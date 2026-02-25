import { Database } from "bun:sqlite";

export interface MailboxRow {
  id: string;
  stalwart_name: string;
  address: string;
  domain: string;
  owner_wallet: string;
  status: string;
  password_hash: string;
  password_enc: string | null;
  quota: number;
  created_at: number;
  expires_at: number;
  jmap_api_url: string | null;
  jmap_account_id: string | null;
  jmap_identity_id: string | null;
  jmap_inbox_id: string | null;
  jmap_drafts_id: string | null;
  jmap_sent_id: string | null;
  stalwart_cleanup_failed: number;
  cleanup_attempts: number;
}

let _db: Database | null = null;

export function getDb(): Database {
  if (_db) return _db;

  const dbPath = process.env.RELAY_DB_PATH ?? "./relay.db";
  _db = new Database(dbPath);

  _db.run(`
    CREATE TABLE IF NOT EXISTS mailboxes (
      id               TEXT PRIMARY KEY,
      stalwart_name    TEXT NOT NULL UNIQUE,
      address          TEXT NOT NULL UNIQUE,
      domain           TEXT NOT NULL,
      owner_wallet     TEXT NOT NULL,
      status           TEXT NOT NULL DEFAULT 'active',
      password_hash    TEXT NOT NULL,
      password_enc     TEXT,
      quota            INTEGER NOT NULL DEFAULT 0,
      created_at       INTEGER NOT NULL,
      expires_at       INTEGER NOT NULL,
      jmap_api_url     TEXT,
      jmap_account_id  TEXT,
      jmap_identity_id TEXT,
      jmap_inbox_id    TEXT,
      jmap_drafts_id   TEXT,
      jmap_sent_id     TEXT
    )
  `);

  // R-8: additive columns for expiry management
  try {
    _db.run("ALTER TABLE mailboxes ADD COLUMN stalwart_cleanup_failed INTEGER NOT NULL DEFAULT 0");
  } catch { /* column already exists */ }
  try {
    _db.run("ALTER TABLE mailboxes ADD COLUMN cleanup_attempts INTEGER NOT NULL DEFAULT 0");
  } catch { /* column already exists */ }

  // R-7: webhooks tables
  _db.run(`
    CREATE TABLE IF NOT EXISTS webhooks (
      id            TEXT PRIMARY KEY,
      mailbox_id    TEXT NOT NULL,
      owner_wallet  TEXT NOT NULL,
      url           TEXT NOT NULL,
      secret_enc    TEXT,
      events        TEXT NOT NULL DEFAULT '["message.received"]',
      status        TEXT NOT NULL DEFAULT 'active',
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      created_at    INTEGER NOT NULL,
      FOREIGN KEY (mailbox_id) REFERENCES mailboxes(id) ON DELETE CASCADE
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS webhooks_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      webhook_id    TEXT NOT NULL,
      message_id    TEXT,
      status_code   INTEGER,
      attempt       INTEGER NOT NULL DEFAULT 1,
      delivered_at  INTEGER,
      error         TEXT,
      created_at    INTEGER NOT NULL
    )
  `);

  _db.run("CREATE INDEX IF NOT EXISTS idx_webhooks_mailbox ON webhooks(mailbox_id)");
  _db.run("CREATE INDEX IF NOT EXISTS idx_webhooks_log_webhook ON webhooks_log(webhook_id)");

  _db.run("CREATE INDEX IF NOT EXISTS idx_mailboxes_owner ON mailboxes(owner_wallet)");
  _db.run("CREATE INDEX IF NOT EXISTS idx_mailboxes_address ON mailboxes(address)");
  _db.run("CREATE INDEX IF NOT EXISTS idx_mailboxes_expiry ON mailboxes(status, expires_at)");

  return _db;
}

export function resetDb(): void {
  _db = null;
}

// ─── Mailbox queries ────────────────────────────────────────────────────

export function insertMailbox(params: {
  id: string;
  stalwart_name: string;
  address: string;
  domain: string;
  owner_wallet: string;
  password_hash: string;
  password_enc: string | null;
  quota: number;
  created_at: number;
  expires_at: number;
  jmap_api_url: string | null;
  jmap_account_id: string | null;
  jmap_identity_id: string | null;
  jmap_inbox_id: string | null;
  jmap_drafts_id: string | null;
  jmap_sent_id: string | null;
}): void {
  const db = getDb();
  db.query(
    `INSERT INTO mailboxes (id, stalwart_name, address, domain, owner_wallet, password_hash, password_enc, quota, created_at, expires_at, jmap_api_url, jmap_account_id, jmap_identity_id, jmap_inbox_id, jmap_drafts_id, jmap_sent_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    params.id,
    params.stalwart_name,
    params.address,
    params.domain,
    params.owner_wallet,
    params.password_hash,
    params.password_enc,
    params.quota,
    params.created_at,
    params.expires_at,
    params.jmap_api_url,
    params.jmap_account_id,
    params.jmap_identity_id,
    params.jmap_inbox_id,
    params.jmap_drafts_id,
    params.jmap_sent_id,
  );
}

export function updateMailboxJmap(id: string, params: {
  jmap_api_url: string;
  jmap_account_id: string;
  jmap_identity_id: string;
  jmap_inbox_id: string;
  jmap_drafts_id: string;
  jmap_sent_id: string;
}): void {
  const db = getDb();
  db.query(
    "UPDATE mailboxes SET jmap_api_url = ?, jmap_account_id = ?, jmap_identity_id = ?, jmap_inbox_id = ?, jmap_drafts_id = ?, jmap_sent_id = ? WHERE id = ?",
  ).run(
    params.jmap_api_url,
    params.jmap_account_id,
    params.jmap_identity_id,
    params.jmap_inbox_id,
    params.jmap_drafts_id,
    params.jmap_sent_id,
    id,
  );
}

export function getMailboxById(id: string): MailboxRow | null {
  const db = getDb();
  return db.query<MailboxRow, [string]>("SELECT * FROM mailboxes WHERE id = ?").get(id) ?? null;
}

export function getMailboxesByOwner(owner: string, limit: number, offset: number): MailboxRow[] {
  const db = getDb();
  return db
    .query<MailboxRow, [string, number, number]>(
      "SELECT * FROM mailboxes WHERE owner_wallet = ? AND status = 'active' ORDER BY created_at DESC LIMIT ? OFFSET ?",
    )
    .all(owner, limit, offset);
}

export function countMailboxesByOwner(owner: string): number {
  const db = getDb();
  const row = db
    .query<{ count: number }, [string]>(
      "SELECT COUNT(*) as count FROM mailboxes WHERE owner_wallet = ? AND status = 'active'",
    )
    .get(owner) as { count: number } | null;
  return row?.count ?? 0;
}

export function deleteMailboxRow(id: string): void {
  const db = getDb();
  db.query("DELETE FROM mailboxes WHERE id = ?").run(id);
}

// ─── Expiry queries (R-8) ─────────────────────────────────────────────

export function getExpiredMailboxes(limit: number): MailboxRow[] {
  const db = getDb();
  return db
    .query<MailboxRow, [number, number]>(
      "SELECT * FROM mailboxes WHERE status = 'active' AND expires_at < ? LIMIT ?",
    )
    .all(Date.now(), limit);
}

export function getFailedCleanups(limit: number): MailboxRow[] {
  const db = getDb();
  return db
    .query<MailboxRow, [number]>(
      "SELECT * FROM mailboxes WHERE status = 'expired' AND stalwart_cleanup_failed = 1 LIMIT ?",
    )
    .all(limit);
}

export function markExpired(id: string, cleanupFailed: boolean): void {
  const db = getDb();
  db.query(
    "UPDATE mailboxes SET status = 'expired', stalwart_cleanup_failed = ? WHERE id = ?",
  ).run(cleanupFailed ? 1 : 0, id);
}

export function markCleanupDone(id: string): void {
  const db = getDb();
  db.query(
    "UPDATE mailboxes SET stalwart_cleanup_failed = 0 WHERE id = ?",
  ).run(id);
}

export function markCleanupDeadLetter(id: string): void {
  const db = getDb();
  db.query(
    "UPDATE mailboxes SET stalwart_cleanup_failed = -1 WHERE id = ?",
  ).run(id);
}

export function updateExpiresAt(id: string, expiresAt: number): void {
  const db = getDb();
  db.query("UPDATE mailboxes SET expires_at = ? WHERE id = ?").run(expiresAt, id);
}

export function incrementCleanupAttempts(id: string): void {
  const db = getDb();
  db.query("UPDATE mailboxes SET cleanup_attempts = cleanup_attempts + 1 WHERE id = ?").run(id);
}

export function getMailboxesByOwnerAll(owner: string, limit: number, offset: number): MailboxRow[] {
  const db = getDb();
  return db
    .query<MailboxRow, [string, number, number]>(
      "SELECT * FROM mailboxes WHERE owner_wallet = ? AND status IN ('active', 'expired') ORDER BY created_at DESC LIMIT ? OFFSET ?",
    )
    .all(owner, limit, offset);
}

export function countMailboxesByOwnerAll(owner: string): number {
  const db = getDb();
  const row = db
    .query<{ count: number }, [string]>(
      "SELECT COUNT(*) as count FROM mailboxes WHERE owner_wallet = ? AND status IN ('active', 'expired')",
    )
    .get(owner) as { count: number } | null;
  return row?.count ?? 0;
}

export function getMailboxByAddress(address: string): MailboxRow | null {
  const db = getDb();
  return db.query<MailboxRow, [string]>("SELECT * FROM mailboxes WHERE address = ?").get(address) ?? null;
}

// ─── Webhook queries (R-7) ────────────────────────────────────────────

export interface WebhookRow {
  id: string;
  mailbox_id: string;
  owner_wallet: string;
  url: string;
  secret_enc: string | null;
  events: string;
  status: string;
  consecutive_failures: number;
  created_at: number;
}

export interface WebhookLogRow {
  id: number;
  webhook_id: string;
  message_id: string | null;
  status_code: number | null;
  attempt: number;
  delivered_at: number | null;
  error: string | null;
  created_at: number;
}

export function insertWebhook(params: {
  id: string;
  mailbox_id: string;
  owner_wallet: string;
  url: string;
  secret_enc: string | null;
  events: string;
  created_at: number;
}): void {
  const db = getDb();
  db.query(
    "INSERT INTO webhooks (id, mailbox_id, owner_wallet, url, secret_enc, events, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(params.id, params.mailbox_id, params.owner_wallet, params.url, params.secret_enc, params.events, params.created_at);
}

export function getWebhooksByMailbox(mailboxId: string): WebhookRow[] {
  const db = getDb();
  return db.query<WebhookRow, [string]>(
    "SELECT * FROM webhooks WHERE mailbox_id = ? AND status = 'active'",
  ).all(mailboxId);
}

export function getWebhookById(id: string): WebhookRow | null {
  const db = getDb();
  return db.query<WebhookRow, [string]>("SELECT * FROM webhooks WHERE id = ?").get(id) ?? null;
}

export function deleteWebhookRow(id: string): void {
  const db = getDb();
  db.query("DELETE FROM webhooks WHERE id = ?").run(id);
}

export function updateWebhookStatus(id: string, status: string): void {
  const db = getDb();
  db.query("UPDATE webhooks SET status = ? WHERE id = ?").run(status, id);
}

export function incrementWebhookFailures(id: string): number {
  const db = getDb();
  db.query("UPDATE webhooks SET consecutive_failures = consecutive_failures + 1 WHERE id = ?").run(id);
  const row = db.query<{ consecutive_failures: number }, [string]>(
    "SELECT consecutive_failures FROM webhooks WHERE id = ?",
  ).get(id) as { consecutive_failures: number } | null;
  return row?.consecutive_failures ?? 0;
}

export function resetWebhookFailures(id: string): void {
  const db = getDb();
  db.query("UPDATE webhooks SET consecutive_failures = 0 WHERE id = ?").run(id);
}

export function insertWebhookLog(params: {
  webhook_id: string;
  message_id: string | null;
  status_code: number | null;
  attempt: number;
  delivered_at: number | null;
  error: string | null;
}): void {
  const db = getDb();
  db.query(
    "INSERT INTO webhooks_log (webhook_id, message_id, status_code, attempt, delivered_at, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(params.webhook_id, params.message_id, params.status_code, params.attempt, params.delivered_at, params.error, Date.now());
}
