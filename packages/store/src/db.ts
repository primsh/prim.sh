import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";

export interface BucketRow {
  id: string;
  cf_name: string;
  name: string;
  owner_wallet: string;
  location: string | null;
  quota_bytes: number | null;
  usage_bytes: number;
  created_at: number;
  updated_at: number;
}

let _db: Database | null = null;

export function getDb(): Database {
  if (_db) return _db;

  const dataDir = join(process.env.PRIM_HOME ?? join(homedir(), ".prim"), "data");
  mkdirSync(dataDir, { recursive: true });
  const dbPath = process.env.STORE_DB_PATH ?? join(dataDir, "store.db");
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
  _db.run(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_buckets_name_owner ON buckets(name, owner_wallet)",
  );

  // ST-3 migration: add quota + usage columns
  try {
    _db.run("ALTER TABLE buckets ADD COLUMN quota_bytes INTEGER DEFAULT NULL");
  } catch {
    /* column exists */
  }
  try {
    _db.run("ALTER TABLE buckets ADD COLUMN usage_bytes INTEGER NOT NULL DEFAULT 0");
  } catch {
    /* column exists */
  }

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
  return (
    db.query<BucketRow, [string]>("SELECT * FROM buckets WHERE cf_name = ?").get(cfName) ?? null
  );
}

export function getBucketByNameAndOwner(name: string, owner: string): BucketRow | null {
  const db = getDb();
  return (
    db
      .query<BucketRow, [string, string]>(
        "SELECT * FROM buckets WHERE name = ? AND owner_wallet = ?",
      )
      .get(name, owner) ?? null
  );
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
    .query<{ count: number }, [string]>(
      "SELECT COUNT(*) as count FROM buckets WHERE owner_wallet = ?",
    )
    .get(owner) as { count: number } | null;
  return row?.count ?? 0;
}

export function getTotalStorageByOwner(owner: string): number {
  const db = getDb();
  const row = db
    .query<{ total: number }, [string]>(
      "SELECT COALESCE(SUM(usage_bytes), 0) as total FROM buckets WHERE owner_wallet = ?",
    )
    .get(owner) as { total: number } | null;
  return row?.total ?? 0;
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

// ─── Quota queries ────────────────────────────────────────────────────────

export function getQuota(
  bucketId: string,
): { quota_bytes: number | null; usage_bytes: number } | null {
  const db = getDb();
  const row = db
    .query<{ quota_bytes: number | null; usage_bytes: number }, [string]>(
      "SELECT quota_bytes, usage_bytes FROM buckets WHERE id = ?",
    )
    .get(bucketId) as { quota_bytes: number | null; usage_bytes: number } | null;
  return row ?? null;
}

export function setQuota(bucketId: string, quotaBytes: number | null): void {
  const db = getDb();
  db.query("UPDATE buckets SET quota_bytes = ?, updated_at = ? WHERE id = ?").run(
    quotaBytes,
    Date.now(),
    bucketId,
  );
}

export function incrementUsage(bucketId: string, deltaBytes: number): void {
  const db = getDb();
  db.query("UPDATE buckets SET usage_bytes = usage_bytes + ?, updated_at = ? WHERE id = ?").run(
    deltaBytes,
    Date.now(),
    bucketId,
  );
}

export function decrementUsage(bucketId: string, deltaBytes: number): void {
  const db = getDb();
  db.query(
    "UPDATE buckets SET usage_bytes = MAX(0, usage_bytes - ?), updated_at = ? WHERE id = ?",
  ).run(deltaBytes, Date.now(), bucketId);
}

export function setUsage(bucketId: string, usageBytes: number): void {
  const db = getDb();
  db.query("UPDATE buckets SET usage_bytes = ?, updated_at = ? WHERE id = ?").run(
    usageBytes,
    Date.now(),
    bucketId,
  );
}
