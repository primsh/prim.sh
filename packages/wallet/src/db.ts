import { Database } from "bun:sqlite";

export interface WalletRow {
  address: string;
  chain: string;
  encrypted_key: string;
  claim_token: string | null;
  created_by: string | null;
  deactivated_at: string | null;
  created_at: number;
  updated_at: number;
}

export interface ExecutionRow {
  idempotency_key: string;
  wallet_address: string;
  action_type: string;
  payload_hash: string;
  status: "pending" | "succeeded" | "failed";
  result: string | null;
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
      encrypted_key TEXT NOT NULL,
      claim_token   TEXT,
      created_by    TEXT,
      deactivated_at TEXT,
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    )
  `);

  _db.run("CREATE INDEX IF NOT EXISTS idx_wallets_created_by ON wallets(created_by)");
  _db.run("CREATE INDEX IF NOT EXISTS idx_wallets_claim_token ON wallets(claim_token)");

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

  return _db;
}

export function resetDb(): void {
  _db = null;
}

export function insertWallet(wallet: {
  address: string;
  chain: string;
  encryptedKey: string;
  claimToken: string;
}): void {
  const db = getDb();
  const now = Date.now();
  db.query(
    "INSERT INTO wallets (address, chain, encrypted_key, claim_token, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(wallet.address, wallet.chain, wallet.encryptedKey, wallet.claimToken, now, now);
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

export function claimWallet(address: string, claimToken: string, owner: string): boolean {
  const db = getDb();
  const now = Date.now();

  let claimed = false;
  db.transaction(() => {
    const row = db
      .query<WalletRow, [string]>("SELECT * FROM wallets WHERE address = ?")
      .get(address);

    if (!row || row.claim_token !== claimToken) {
      return;
    }

    db.query(
      "UPDATE wallets SET created_by = ?, claim_token = NULL, updated_at = ? WHERE address = ?",
    ).run(owner, now, address);

    claimed = true;
  })();

  return claimed;
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
    "INSERT INTO executions (idempotency_key, wallet_address, action_type, payload_hash, status, result, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', NULL, ?, ?)",
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
