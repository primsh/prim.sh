import { Database } from "bun:sqlite";

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS allowed_wallets (
  address TEXT PRIMARY KEY,
  added_at TEXT DEFAULT (datetime('now')),
  added_by TEXT,
  note TEXT
);
`;

function openDb(dbPath: string): Database {
  const db = new Database(dbPath, { create: true });
  db.exec("PRAGMA journal_mode=WAL;");
  db.exec(INIT_SQL);
  return db;
}

/**
 * Returns an async checker function suitable for `AgentStackMiddlewareOptions.checkAllowlist`.
 * Opens the DB once and reuses the connection.
 */
export function createAllowlistChecker(dbPath: string): (address: string) => Promise<boolean> {
  const db = openDb(dbPath);
  const stmt = db.prepare("SELECT 1 FROM allowed_wallets WHERE address = ?");
  return async (address: string): Promise<boolean> => {
    const row = stmt.get(address.toLowerCase());
    return row !== null;
  };
}

export function isAllowed(dbPath: string, address: string): boolean {
  const db = openDb(dbPath);
  const row = db.prepare("SELECT 1 FROM allowed_wallets WHERE address = ?").get(address.toLowerCase());
  return row !== null;
}

export function addToAllowlist(dbPath: string, address: string, addedBy: string, note?: string): void {
  const db = openDb(dbPath);
  db.prepare(
    "INSERT OR REPLACE INTO allowed_wallets (address, added_by, note) VALUES (?, ?, ?)",
  ).run(address.toLowerCase(), addedBy, note ?? null);
}

export function removeFromAllowlist(dbPath: string, address: string): void {
  const db = openDb(dbPath);
  db.prepare("DELETE FROM allowed_wallets WHERE address = ?").run(address.toLowerCase());
}
