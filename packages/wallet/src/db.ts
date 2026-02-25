import { Database } from "bun:sqlite";

export interface WalletRow {
  address: string;
  chain: string;
  label: string | null;
  created_by: string;
  deactivated_at: string | null;
  created_at: number;
  updated_at: number;
}

export interface ExecutionRow {
  idempotency_key: string;
  wallet_address: string;
  action_type: string;
  payload_hash: string;
  status: "queued" | "running" | "succeeded" | "failed" | "aborted";
  result: string | null;
  created_at: number;
  updated_at: number;
}

export interface ExecutionEventRow {
  id: number;
  execution_id: string;
  event_type: string;
  payload: string | null;
  created_at: number;
}

export interface DeadLetterRow {
  id: number;
  execution_id: string | null;
  reason: string;
  payload: string | null;
  created_at: number;
}

export interface FundRequestRow {
  id: string;
  wallet_address: string;
  amount: string;
  reason: string;
  status: "pending" | "approved" | "denied";
  approved_tx: string | null;
  deny_reason: string | null;
  created_by: string;
  created_at: number;
  updated_at: number;
}

export interface PolicyRow {
  wallet_address: string;
  max_per_tx: string | null;
  max_per_day: string | null;
  allowed_primitives: string | null; // JSON array string or null
  daily_spent: string;
  daily_reset_at: string;
  pause_scope: string | null; // null | "all" | "send" | "swap"
  paused_at: string | null;
  created_at: number;
  updated_at: number;
}

let _db: Database | null = null;

export function getDb(): Database {
  if (_db) return _db;

  const dbPath = process.env.WALLET_DB_PATH ?? "./wallet.db";
  _db = new Database(dbPath);

  _db.run(`
    CREATE TABLE IF NOT EXISTS wallets (
      address       TEXT PRIMARY KEY,
      chain         TEXT NOT NULL DEFAULT 'eip155:8453',
      label         TEXT,
      created_by    TEXT NOT NULL,
      deactivated_at TEXT,
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    )
  `);

  _db.run("CREATE INDEX IF NOT EXISTS idx_wallets_created_by ON wallets(created_by)");

  _db.run(`
    CREATE TABLE IF NOT EXISTS executions (
      idempotency_key TEXT PRIMARY KEY,
      wallet_address  TEXT NOT NULL,
      action_type     TEXT NOT NULL,
      payload_hash    TEXT NOT NULL,
      status          TEXT NOT NULL,
      result          TEXT,
      created_at      INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL
    )
  `);

  _db.run("CREATE INDEX IF NOT EXISTS idx_executions_wallet_address ON executions(wallet_address)");

  _db.run(`
    CREATE TABLE IF NOT EXISTS execution_events (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      execution_id  TEXT NOT NULL,
      event_type    TEXT NOT NULL,
      payload       TEXT,
      created_at    INTEGER NOT NULL
    )
  `);

  _db.run("CREATE INDEX IF NOT EXISTS idx_execution_events_execution_id ON execution_events(execution_id)");

  _db.run(`
    CREATE TABLE IF NOT EXISTS dead_letters (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      execution_id  TEXT,
      reason        TEXT NOT NULL,
      payload       TEXT,
      created_at    INTEGER NOT NULL
    )
  `);

  _db.run("CREATE INDEX IF NOT EXISTS idx_dead_letters_execution_id ON dead_letters(execution_id)");

  _db.run(`
    CREATE TABLE IF NOT EXISTS fund_requests (
      id              TEXT PRIMARY KEY,
      wallet_address  TEXT NOT NULL,
      amount          TEXT NOT NULL,
      reason          TEXT NOT NULL,
      status          TEXT NOT NULL,
      approved_tx     TEXT,
      deny_reason     TEXT,
      created_by      TEXT NOT NULL,
      created_at      INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL
    )
  `);

  _db.run("CREATE INDEX IF NOT EXISTS idx_fund_requests_wallet_address ON fund_requests(wallet_address)");

  _db.run(`
    CREATE TABLE IF NOT EXISTS policies (
      wallet_address    TEXT PRIMARY KEY,
      max_per_tx        TEXT,
      max_per_day       TEXT,
      allowed_primitives TEXT,
      daily_spent       TEXT NOT NULL DEFAULT '0.00',
      daily_reset_at    TEXT NOT NULL,
      pause_scope       TEXT,
      paused_at         TEXT,
      created_at        INTEGER NOT NULL,
      updated_at        INTEGER NOT NULL
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS circuit_breaker (
      scope      TEXT PRIMARY KEY,
      paused_at  TEXT,
      updated_at INTEGER NOT NULL
    )
  `);

  return _db;
}

export function resetDb(): void {
  _db = null;
}

export function insertWallet(wallet: {
  address: string;
  chain: string;
  createdBy: string;
  label?: string;
}): void {
  const db = getDb();
  const now = Date.now();
  db.query(
    "INSERT INTO wallets (address, chain, label, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(wallet.address, wallet.chain, wallet.label ?? null, wallet.createdBy, now, now);
}

export function getWalletByAddress(address: string): WalletRow | null {
  const db = getDb();
  return db
    .query<WalletRow, [string]>("SELECT * FROM wallets WHERE address = ?")
    .get(address) ?? null;
}

export function getWalletsByOwner(owner: string, limit: number, after?: string): WalletRow[] {
  const db = getDb();
  if (after) {
    return db
      .query<WalletRow, [string, string, number]>(
        "SELECT * FROM wallets WHERE created_by = ? AND address > ? ORDER BY address ASC LIMIT ?",
      )
      .all(owner, after, limit);
  }
  return db
    .query<WalletRow, [string, number]>(
      "SELECT * FROM wallets WHERE created_by = ? ORDER BY address ASC LIMIT ?",
    )
    .all(owner, limit);
}

export function deactivateWallet(address: string): void {
  const db = getDb();
  const now = Date.now();
  const deactivatedAt = new Date().toISOString();
  db.query(
    "UPDATE wallets SET deactivated_at = ?, updated_at = ? WHERE address = ?",
  ).run(deactivatedAt, now, address);
}

export function getExecution(idempotencyKey: string): ExecutionRow | null {
  const db = getDb();
  return (
    db
      .query<ExecutionRow, [string]>("SELECT * FROM executions WHERE idempotency_key = ?")
      .get(idempotencyKey) ?? null
  );
}

export function insertExecution(params: {
  idempotencyKey: string;
  walletAddress: string;
  actionType: string;
  payloadHash: string;
}): void {
  const db = getDb();
  const now = Date.now();
  db.query(
    "INSERT INTO executions (idempotency_key, wallet_address, action_type, payload_hash, status, result, created_at, updated_at) VALUES (?, ?, ?, ?, 'queued', NULL, ?, ?)",
  ).run(params.idempotencyKey, params.walletAddress, params.actionType, params.payloadHash, now, now);
}

export function completeExecution(
  idempotencyKey: string,
  status: "succeeded" | "failed",
  result: string,
): void {
  const db = getDb();
  const now = Date.now();
  db.query(
    "UPDATE executions SET status = ?, result = ?, updated_at = ? WHERE idempotency_key = ?",
  ).run(status, result, now, idempotencyKey);
}

export function tryClaim(idempotencyKey: string): boolean {
  const db = getDb();
  const now = Date.now();
  const result = db.run(
    "UPDATE executions SET status = 'running', updated_at = ? WHERE idempotency_key = ? AND status = 'queued'",
    now,
    idempotencyKey,
  );
  return result.changes > 0;
}

export function markAborted(idempotencyKey: string, reason: string): void {
  const db = getDb();
  const now = Date.now();
  db.query(
    "UPDATE executions SET status = 'aborted', result = ?, updated_at = ? WHERE idempotency_key = ?",
  ).run(JSON.stringify({ reason }), now, idempotencyKey);
}

export function appendEvent(executionId: string, eventType: string, payload?: Record<string, unknown>): void {
  const db = getDb();
  const now = Date.now();
  db.query(
    "INSERT INTO execution_events (execution_id, event_type, payload, created_at) VALUES (?, ?, ?, ?)",
  ).run(executionId, eventType, payload !== undefined ? JSON.stringify(payload) : null, now);
}

export function getEventsByExecution(executionId: string): ExecutionEventRow[] {
  const db = getDb();
  return db
    .query<ExecutionEventRow, [string]>(
      "SELECT * FROM execution_events WHERE execution_id = ? ORDER BY id ASC",
    )
    .all(executionId);
}

export function insertDeadLetter(executionId: string | null, reason: string, payload?: Record<string, unknown>): void {
  const db = getDb();
  const now = Date.now();
  db.query(
    "INSERT INTO dead_letters (execution_id, reason, payload, created_at) VALUES (?, ?, ?, ?)",
  ).run(executionId, reason, payload !== undefined ? JSON.stringify(payload) : null, now);
}

export function getExecutionsByWallet(walletAddress: string, limit: number, after?: string): ExecutionRow[] {
  const db = getDb();
  if (after) {
    return db
      .query<ExecutionRow, [string, string, number]>(
        "SELECT * FROM executions WHERE wallet_address = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?",
      )
      .all(walletAddress, after, limit);
  }
  return db
    .query<ExecutionRow, [string, number]>(
      "SELECT * FROM executions WHERE wallet_address = ? ORDER BY created_at DESC LIMIT ?",
    )
    .all(walletAddress, limit);
}

export function insertFundRequest(params: {
  id: string;
  walletAddress: string;
  amount: string;
  reason: string;
  createdBy: string;
}): void {
  const db = getDb();
  const now = Date.now();
  db.query(
    "INSERT INTO fund_requests (id, wallet_address, amount, reason, status, approved_tx, deny_reason, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', NULL, NULL, ?, ?, ?)",
  ).run(params.id, params.walletAddress, params.amount, params.reason, params.createdBy, now, now);
}

export function getFundRequestById(id: string): FundRequestRow | null {
  const db = getDb();
  return db
    .query<FundRequestRow, [string]>("SELECT * FROM fund_requests WHERE id = ?")
    .get(id) ?? null;
}

export function getFundRequestsByWallet(
  walletAddress: string,
  limit: number,
  after?: string,
): FundRequestRow[] {
  const db = getDb();
  if (after) {
    return db
      .query<FundRequestRow, [string, string, number]>(
        "SELECT * FROM fund_requests WHERE wallet_address = ? AND id > ? ORDER BY id ASC LIMIT ?",
      )
      .all(walletAddress, after, limit);
  }
  return db
    .query<FundRequestRow, [string, number]>(
      "SELECT * FROM fund_requests WHERE wallet_address = ? ORDER BY id ASC LIMIT ?",
    )
    .all(walletAddress, limit);
}

export function updateFundRequestStatus(
  id: string,
  status: "approved" | "denied",
  approvedTx?: string,
  denyReason?: string,
): void {
  const db = getDb();
  const now = Date.now();
  db.query(
    "UPDATE fund_requests SET status = ?, approved_tx = ?, deny_reason = ?, updated_at = ? WHERE id = ?",
  ).run(status, approvedTx ?? null, denyReason ?? null, now, id);
}

// ─── Policy CRUD ──────────────────────────────────────────────────────────

function nextMidnightUtc(): string {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.toISOString();
}

export function getPolicy(walletAddress: string): PolicyRow | null {
  const db = getDb();
  return (
    db
      .query<PolicyRow, [string]>("SELECT * FROM policies WHERE wallet_address = ?")
      .get(walletAddress) ?? null
  );
}

export function upsertPolicy(
  walletAddress: string,
  updates: Partial<Omit<PolicyRow, "wallet_address" | "created_at" | "updated_at">>,
): void {
  const db = getDb();
  const now = Date.now();
  const existing = getPolicy(walletAddress);

  if (!existing) {
    db.query(
      `INSERT INTO policies (wallet_address, max_per_tx, max_per_day, allowed_primitives, daily_spent, daily_reset_at, pause_scope, paused_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      walletAddress,
      updates.max_per_tx ?? null,
      updates.max_per_day ?? null,
      updates.allowed_primitives ?? null,
      updates.daily_spent ?? "0.00",
      updates.daily_reset_at ?? nextMidnightUtc(),
      updates.pause_scope ?? null,
      updates.paused_at ?? null,
      now,
      now,
    );
  } else {
    const merged = { ...existing, ...updates };
    db.query(
      `UPDATE policies SET max_per_tx = ?, max_per_day = ?, allowed_primitives = ?, daily_spent = ?, daily_reset_at = ?, pause_scope = ?, paused_at = ?, updated_at = ?
       WHERE wallet_address = ?`,
    ).run(
      merged.max_per_tx,
      merged.max_per_day,
      merged.allowed_primitives,
      merged.daily_spent,
      merged.daily_reset_at,
      merged.pause_scope,
      merged.paused_at,
      now,
      walletAddress,
    );
  }
}

export function incrementDailySpent(walletAddress: string, amount: string): void {
  const db = getDb();
  const now = Date.now();
  const existing = getPolicy(walletAddress);
  const currentSpent = existing ? Number.parseFloat(existing.daily_spent) : 0;
  const newSpent = (currentSpent + Number.parseFloat(amount)).toFixed(6);

  if (!existing) {
    db.query(
      `INSERT INTO policies (wallet_address, max_per_tx, max_per_day, allowed_primitives, daily_spent, daily_reset_at, pause_scope, paused_at, created_at, updated_at)
       VALUES (?, NULL, NULL, NULL, ?, ?, NULL, NULL, ?, ?)`,
    ).run(walletAddress, newSpent, nextMidnightUtc(), now, now);
  } else {
    db.query("UPDATE policies SET daily_spent = ?, updated_at = ? WHERE wallet_address = ?").run(
      newSpent,
      now,
      walletAddress,
    );
  }
}

export function resetDailySpentIfNeeded(walletAddress: string): void {
  const db = getDb();
  const existing = getPolicy(walletAddress);
  if (!existing) return;

  const resetAt = new Date(existing.daily_reset_at);
  if (Date.now() >= resetAt.getTime()) {
    const now = Date.now();
    db.query(
      "UPDATE policies SET daily_spent = '0.00', daily_reset_at = ?, updated_at = ? WHERE wallet_address = ?",
    ).run(nextMidnightUtc(), now, walletAddress);
  }
}

export function setPauseState(
  walletAddress: string,
  scope: string | null,
  pausedAt: string | null,
): void {
  const db = getDb();
  const now = Date.now();
  const existing = getPolicy(walletAddress);

  if (!existing) {
    db.query(
      `INSERT INTO policies (wallet_address, max_per_tx, max_per_day, allowed_primitives, daily_spent, daily_reset_at, pause_scope, paused_at, created_at, updated_at)
       VALUES (?, NULL, NULL, NULL, '0.00', ?, ?, ?, ?, ?)`,
    ).run(walletAddress, nextMidnightUtc(), scope, pausedAt, now, now);
  } else {
    db.query(
      "UPDATE policies SET pause_scope = ?, paused_at = ?, updated_at = ? WHERE wallet_address = ?",
    ).run(scope, pausedAt, now, walletAddress);
  }
}
