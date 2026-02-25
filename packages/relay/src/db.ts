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

  _db.run("CREATE INDEX IF NOT EXISTS idx_mailboxes_owner ON mailboxes(owner_wallet)");
  _db.run("CREATE INDEX IF NOT EXISTS idx_mailboxes_address ON mailboxes(address)");

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
