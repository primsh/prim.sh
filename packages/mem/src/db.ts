import { Database } from "bun:sqlite";

// ─── Row types ────────────────────────────────────────────────────────────

export interface CollectionRow {
  id: string;
  name: string;
  owner_wallet: string;
  qdrant_collection: string;
  dimension: number;
  distance: string;
  created_at: number;
  updated_at: number;
}

export interface CacheEntryRow {
  namespace: string;
  key: string;
  value: string;
  owner_wallet: string;
  expires_at: number | null;
  created_at: number;
  updated_at: number;
}

// ─── DB singleton ─────────────────────────────────────────────────────────

let _db: Database | null = null;

export function getDb(): Database {
  if (_db) return _db;

  const dbPath = process.env.MEM_DB_PATH ?? "./mem.db";
  _db = new Database(dbPath);

  _db.run(`
    CREATE TABLE IF NOT EXISTS collections (
      id                TEXT PRIMARY KEY,
      name              TEXT NOT NULL,
      owner_wallet      TEXT NOT NULL,
      qdrant_collection TEXT NOT NULL UNIQUE,
      dimension         INTEGER NOT NULL DEFAULT 768,
      distance          TEXT NOT NULL DEFAULT 'Cosine',
      created_at        INTEGER NOT NULL,
      updated_at        INTEGER NOT NULL
    )
  `);
  _db.run(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_collections_owner_name ON collections(owner_wallet, name)",
  );
  _db.run("CREATE INDEX IF NOT EXISTS idx_collections_owner ON collections(owner_wallet)");

  _db.run(`
    CREATE TABLE IF NOT EXISTS cache_entries (
      namespace    TEXT NOT NULL,
      key          TEXT NOT NULL,
      value        TEXT NOT NULL,
      owner_wallet TEXT NOT NULL,
      expires_at   INTEGER,
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL,
      PRIMARY KEY (owner_wallet, namespace, key)
    )
  `);
  _db.run("CREATE INDEX IF NOT EXISTS idx_cache_owner ON cache_entries(owner_wallet)");

  return _db;
}

export function resetDb(): void {
  _db = null;
}

// ─── Collection queries ───────────────────────────────────────────────────

export function insertCollection(params: {
  id: string;
  name: string;
  owner_wallet: string;
  qdrant_collection: string;
  dimension: number;
  distance: string;
}): void {
  const db = getDb();
  const now = Date.now();
  db.query(
    `INSERT INTO collections (id, name, owner_wallet, qdrant_collection, dimension, distance, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    params.id,
    params.name,
    params.owner_wallet,
    params.qdrant_collection,
    params.dimension,
    params.distance,
    now,
    now,
  );
}

export function getCollectionById(id: string): CollectionRow | null {
  const db = getDb();
  return (
    db.query<CollectionRow, [string]>("SELECT * FROM collections WHERE id = ?").get(id) ?? null
  );
}

export function getCollectionByOwnerAndName(owner: string, name: string): CollectionRow | null {
  const db = getDb();
  return (
    db
      .query<CollectionRow, [string, string]>(
        "SELECT * FROM collections WHERE owner_wallet = ? AND name = ?",
      )
      .get(owner, name) ?? null
  );
}

export function getCollectionsByOwner(
  owner: string,
  limit: number,
  offset: number,
): CollectionRow[] {
  const db = getDb();
  return db
    .query<CollectionRow, [string, number, number]>(
      "SELECT * FROM collections WHERE owner_wallet = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
    )
    .all(owner, limit, offset);
}

export function countCollectionsByOwner(owner: string): number {
  const db = getDb();
  const row = db
    .query<{ count: number }, [string]>(
      "SELECT COUNT(*) as count FROM collections WHERE owner_wallet = ?",
    )
    .get(owner) as { count: number } | null;
  return row?.count ?? 0;
}

export function deleteCollectionRow(id: string): void {
  const db = getDb();
  db.query("DELETE FROM collections WHERE id = ?").run(id);
}

// ─── Cache queries ────────────────────────────────────────────────────────

export function upsertCacheEntry(params: {
  namespace: string;
  key: string;
  value: string;
  owner_wallet: string;
  expires_at: number | null;
}): void {
  const db = getDb();
  const now = Date.now();
  db.query(
    `INSERT INTO cache_entries
       (namespace, key, value, owner_wallet, expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(owner_wallet, namespace, key) DO UPDATE SET
       value      = excluded.value,
       expires_at = excluded.expires_at,
       updated_at = excluded.updated_at`,
  ).run(params.namespace, params.key, params.value, params.owner_wallet, params.expires_at, now, now);
}

export function getCacheEntry(
  owner: string,
  namespace: string,
  key: string,
): CacheEntryRow | null {
  const db = getDb();
  return (
    db
      .query<CacheEntryRow, [string, string, string]>(
        "SELECT * FROM cache_entries WHERE owner_wallet = ? AND namespace = ? AND key = ?",
      )
      .get(owner, namespace, key) ?? null
  );
}

export function deleteCacheEntry(owner: string, namespace: string, key: string): void {
  const db = getDb();
  db.query(
    "DELETE FROM cache_entries WHERE owner_wallet = ? AND namespace = ? AND key = ?",
  ).run(owner, namespace, key);
}

export function deleteExpiredEntries(now: number): void {
  const db = getDb();
  db.query(
    "DELETE FROM cache_entries WHERE expires_at IS NOT NULL AND expires_at < ?",
  ).run(now);
}
