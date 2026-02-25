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
