import { Database } from "bun:sqlite";

export interface BucketRow {
  id: string;
  cf_name: string;
  name: string;
  owner_wallet: string;
  location: string | null;
  created_at: number;
  updated_at: number;
}

let _db: Database | null = null;

export function getDb(): Database {
  if (_db) return _db;

  const dbPath = process.env.STORE_DB_PATH ?? "./store.db";
  _db = new Database(dbPath);

  _db.run(`
    CREATE TABLE IF NOT EXISTS buckets (
      id            TEXT PRIMARY KEY,
      cf_name       TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL,
      owner_wallet  TEXT NOT NULL,
      location      TEXT,
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    )
  `);

  _db.run("CREATE INDEX IF NOT EXISTS idx_buckets_owner_wallet ON buckets(owner_wallet)");
  _db.run("CREATE INDEX IF NOT EXISTS idx_buckets_cf_name ON buckets(cf_name)");

  return _db;
}

export function resetDb(): void {
  _db = null;
}

// ─── Bucket queries ───────────────────────────────────────────────────────

export function getBucketById(id: string): BucketRow | null {
  const db = getDb();
  return db.query<BucketRow, [string]>("SELECT * FROM buckets WHERE id = ?").get(id) ?? null;
}

export function getBucketByCfName(cfName: string): BucketRow | null {
  const db = getDb();
  return db.query<BucketRow, [string]>("SELECT * FROM buckets WHERE cf_name = ?").get(cfName) ?? null;
}

export function getBucketsByOwner(owner: string, limit: number, offset: number): BucketRow[] {
  const db = getDb();
  return db
    .query<BucketRow, [string, number, number]>(
      "SELECT * FROM buckets WHERE owner_wallet = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
    )
    .all(owner, limit, offset);
}

export function countBucketsByOwner(owner: string): number {
  const db = getDb();
  const row = db
    .query<{ count: number }, [string]>("SELECT COUNT(*) as count FROM buckets WHERE owner_wallet = ?")
    .get(owner) as { count: number } | null;
  return row?.count ?? 0;
}

export function insertBucket(params: {
  id: string;
  cf_name: string;
  name: string;
  owner_wallet: string;
  location: string | null;
}): void {
  const db = getDb();
  const now = Date.now();
  db.query(
    `INSERT INTO buckets (id, cf_name, name, owner_wallet, location, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(params.id, params.cf_name, params.name, params.owner_wallet, params.location, now, now);
}

export function deleteBucketRow(id: string): void {
  const db = getDb();
  db.query("DELETE FROM buckets WHERE id = ?").run(id);
}
