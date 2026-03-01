// SPDX-License-Identifier: Apache-2.0
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";

let _db: Database | null = null;

export function getDb(): Database {
  if (_db) return _db;

  const dataDir = join(process.env.PRIM_HOME ?? join(homedir(), ".prim"), "data");
  mkdirSync(dataDir, { recursive: true });
  const dbPath = process.env.FAUCET_DB_PATH ?? join(dataDir, "faucet.db");
  _db = new Database(dbPath);

  _db.run(`
    CREATE TABLE IF NOT EXISTS rate_limits (
      address      TEXT NOT NULL,
      resource     TEXT NOT NULL,
      last_drip_at INTEGER NOT NULL,
      PRIMARY KEY (address, resource)
    )
  `);

  return _db;
}

export function resetDb(): void {
  _db?.close();
  _db = null;
}

// ─── Rate limit queries ───────────────────────────────────────────────────

export function getLastDrip(address: string, resource: string): number | null {
  const db = getDb();
  const row = db
    .query<{ last_drip_at: number }, [string, string]>(
      "SELECT last_drip_at FROM rate_limits WHERE address = ? AND resource = ?",
    )
    .get(address, resource);
  return row?.last_drip_at ?? null;
}

export function upsertDrip(address: string, resource: string, timestamp: number): void {
  const db = getDb();
  db.query(
    `INSERT INTO rate_limits (address, resource, last_drip_at) VALUES (?, ?, ?)
     ON CONFLICT(address, resource) DO UPDATE SET last_drip_at = excluded.last_drip_at`,
  ).run(address, resource, timestamp);
}

export function cleanupOldEntries(olderThanMs: number): void {
  const db = getDb();
  const cutoff = Date.now() - olderThanMs;
  db.query("DELETE FROM rate_limits WHERE last_drip_at < ?").run(cutoff);
}
