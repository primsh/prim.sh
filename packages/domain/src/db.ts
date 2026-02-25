import { Database } from "bun:sqlite";

export interface ZoneRow {
  id: string;
  cloudflare_id: string;
  domain: string;
  owner_wallet: string;
  status: string;
  nameservers: string;
  created_at: number;
  updated_at: number;
}

export interface RecordRow {
  id: string;
  cloudflare_id: string;
  zone_id: string;
  type: string;
  name: string;
  content: string;
  ttl: number;
  proxied: number;
  priority: number | null;
  created_at: number;
  updated_at: number;
}

let _db: Database | null = null;

export function getDb(): Database {
  if (_db) return _db;

  const dbPath = process.env.DOMAIN_DB_PATH ?? process.env.DNS_DB_PATH ?? "./domain.db";
  _db = new Database(dbPath);

  _db.run(`
    CREATE TABLE IF NOT EXISTS zones (
      id            TEXT PRIMARY KEY,
      cloudflare_id TEXT NOT NULL,
      domain        TEXT NOT NULL UNIQUE,
      owner_wallet  TEXT NOT NULL,
      status        TEXT NOT NULL,
      nameservers   TEXT NOT NULL DEFAULT '[]',
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    )
  `);

  _db.run("CREATE INDEX IF NOT EXISTS idx_zones_owner_wallet ON zones(owner_wallet)");
  _db.run("CREATE INDEX IF NOT EXISTS idx_zones_domain ON zones(domain)");

  _db.run(`
    CREATE TABLE IF NOT EXISTS records (
      id            TEXT PRIMARY KEY,
      cloudflare_id TEXT NOT NULL,
      zone_id       TEXT NOT NULL REFERENCES zones(id),
      type          TEXT NOT NULL,
      name          TEXT NOT NULL,
      content       TEXT NOT NULL,
      ttl           INTEGER NOT NULL DEFAULT 3600,
      proxied       INTEGER NOT NULL DEFAULT 0,
      priority      INTEGER,
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    )
  `);

  _db.run("CREATE INDEX IF NOT EXISTS idx_records_zone_id ON records(zone_id)");

  return _db;
}

export function resetDb(): void {
  _db = null;
}

export function runInTransaction(fn: () => void): void {
  const db = getDb();
  db.transaction(fn)();
}

// ─── Zone queries ────────────────────────────────────────────────────────

export function insertZone(params: {
  id: string;
  cloudflare_id: string;
  domain: string;
  owner_wallet: string;
  status: string;
  nameservers: string[];
}): void {
  const db = getDb();
  const now = Date.now();
  db.query(
    `INSERT INTO zones (id, cloudflare_id, domain, owner_wallet, status, nameservers, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(params.id, params.cloudflare_id, params.domain, params.owner_wallet, params.status, JSON.stringify(params.nameservers), now, now);
}

export function getZoneById(id: string): ZoneRow | null {
  const db = getDb();
  return db.query<ZoneRow, [string]>("SELECT * FROM zones WHERE id = ?").get(id) ?? null;
}

export function getZoneByDomain(domain: string): ZoneRow | null {
  const db = getDb();
  return db.query<ZoneRow, [string]>("SELECT * FROM zones WHERE domain = ?").get(domain) ?? null;
}

export function getZonesByOwner(owner: string, limit: number, offset: number): ZoneRow[] {
  const db = getDb();
  return db
    .query<ZoneRow, [string, number, number]>(
      "SELECT * FROM zones WHERE owner_wallet = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
    )
    .all(owner, limit, offset);
}

export function countZonesByOwner(owner: string): number {
  const db = getDb();
  const row = db
    .query<{ count: number }, [string]>("SELECT COUNT(*) as count FROM zones WHERE owner_wallet = ?")
    .get(owner) as { count: number } | null;
  return row?.count ?? 0;
}

export function updateZoneStatus(id: string, status: string): void {
  const db = getDb();
  const now = Date.now();
  db.query("UPDATE zones SET status = ?, updated_at = ? WHERE id = ?").run(status, now, id);
}

export function deleteZoneRow(id: string): void {
  const db = getDb();
  db.query("DELETE FROM zones WHERE id = ?").run(id);
}

// ─── Record queries ──────────────────────────────────────────────────────

export function insertRecord(params: {
  id: string;
  cloudflare_id: string;
  zone_id: string;
  type: string;
  name: string;
  content: string;
  ttl: number;
  proxied: boolean;
  priority: number | null;
}): void {
  const db = getDb();
  const now = Date.now();
  db.query(
    `INSERT INTO records (id, cloudflare_id, zone_id, type, name, content, ttl, proxied, priority, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(params.id, params.cloudflare_id, params.zone_id, params.type, params.name, params.content, params.ttl, params.proxied ? 1 : 0, params.priority, now, now);
}

export function getRecordById(id: string): RecordRow | null {
  const db = getDb();
  return db.query<RecordRow, [string]>("SELECT * FROM records WHERE id = ?").get(id) ?? null;
}

export function getRecordByCloudflareId(cfId: string): RecordRow | null {
  const db = getDb();
  return db.query<RecordRow, [string]>("SELECT * FROM records WHERE cloudflare_id = ?").get(cfId) ?? null;
}

export function getRecordsByZone(zoneId: string): RecordRow[] {
  const db = getDb();
  return db
    .query<RecordRow, [string]>("SELECT * FROM records WHERE zone_id = ? ORDER BY created_at DESC")
    .all(zoneId);
}

export function updateRecordRow(id: string, params: {
  cloudflare_id?: string;
  type?: string;
  name?: string;
  content?: string;
  ttl?: number;
  proxied?: boolean;
  priority?: number | null;
}): void {
  const db = getDb();
  const now = Date.now();
  const sets: string[] = ["updated_at = ?"];
  const values: unknown[] = [now];

  if (params.cloudflare_id !== undefined) { sets.push("cloudflare_id = ?"); values.push(params.cloudflare_id); }
  if (params.type !== undefined) { sets.push("type = ?"); values.push(params.type); }
  if (params.name !== undefined) { sets.push("name = ?"); values.push(params.name); }
  if (params.content !== undefined) { sets.push("content = ?"); values.push(params.content); }
  if (params.ttl !== undefined) { sets.push("ttl = ?"); values.push(params.ttl); }
  if (params.proxied !== undefined) { sets.push("proxied = ?"); values.push(params.proxied ? 1 : 0); }
  if (params.priority !== undefined) { sets.push("priority = ?"); values.push(params.priority); }

  values.push(id);
  db.query(`UPDATE records SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}

export function deleteRecordRow(id: string): void {
  const db = getDb();
  db.query("DELETE FROM records WHERE id = ?").run(id);
}

export function deleteRecordsByZone(zoneId: string): void {
  const db = getDb();
  db.query("DELETE FROM records WHERE zone_id = ?").run(zoneId);
}
