import { Database } from "bun:sqlite";

export interface SshKeyRow {
  id: string;
  provider: string;
  provider_resource_id: string;
  owner_wallet: string;
  name: string;
  fingerprint: string;
  created_at: number;
}

export interface ServerRow {
  id: string;
  provider: string;
  provider_resource_id: string;
  owner_wallet: string;
  name: string;
  type: string;
  image: string;
  location: string;
  status: string;
  public_ipv4: string | null;
  public_ipv6: string | null;
  deposit_charged: string;
  deposit_daily_burn: string;
  created_at: number;
  updated_at: number;
}

let _db: Database | null = null;

export function getDb(): Database {
  if (_db) return _db;

  const dbPath = process.env.SPAWN_DB_PATH ?? "./spawn.db";
  _db = new Database(dbPath);

  _db.run(`
    CREATE TABLE IF NOT EXISTS servers (
      id                  TEXT PRIMARY KEY,
      provider            TEXT NOT NULL DEFAULT 'hetzner',
      provider_resource_id TEXT NOT NULL,
      owner_wallet        TEXT NOT NULL,
      name                TEXT NOT NULL,
      type                TEXT NOT NULL,
      image               TEXT NOT NULL,
      location            TEXT NOT NULL,
      status              TEXT NOT NULL,
      public_ipv4         TEXT,
      public_ipv6         TEXT,
      deposit_charged     TEXT NOT NULL,
      deposit_daily_burn  TEXT NOT NULL,
      created_at          INTEGER NOT NULL,
      updated_at          INTEGER NOT NULL
    )
  `);

  _db.run("CREATE INDEX IF NOT EXISTS idx_servers_owner_wallet ON servers(owner_wallet)");
  _db.run("CREATE INDEX IF NOT EXISTS idx_servers_provider_resource_id ON servers(provider_resource_id)");

  _db.run(`
    CREATE TABLE IF NOT EXISTS ssh_keys (
      id                  TEXT PRIMARY KEY,
      provider            TEXT NOT NULL DEFAULT 'hetzner',
      provider_resource_id TEXT NOT NULL,
      owner_wallet        TEXT NOT NULL,
      name                TEXT NOT NULL,
      fingerprint         TEXT NOT NULL,
      created_at          INTEGER NOT NULL
    )
  `);

  _db.run("CREATE INDEX IF NOT EXISTS idx_ssh_keys_owner_wallet ON ssh_keys(owner_wallet)");

  return _db;
}

export function resetDb(): void {
  _db = null;
}

export function insertServer(params: {
  id: string;
  provider: string;
  provider_resource_id: string;
  owner_wallet: string;
  name: string;
  type: string;
  image: string;
  location: string;
  status: string;
  public_ipv4: string | null;
  public_ipv6: string | null;
  deposit_charged: string;
  deposit_daily_burn: string;
}): void {
  const db = getDb();
  const now = Date.now();
  db.query(
    `INSERT INTO servers (
      id, provider, provider_resource_id, owner_wallet, name, type, image, location, status,
      public_ipv4, public_ipv6, deposit_charged, deposit_daily_burn, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    params.id,
    params.provider,
    params.provider_resource_id,
    params.owner_wallet,
    params.name,
    params.type,
    params.image,
    params.location,
    params.status,
    params.public_ipv4,
    params.public_ipv6,
    params.deposit_charged,
    params.deposit_daily_burn,
    now,
    now,
  );
}

export function getServerById(id: string): ServerRow | null {
  const db = getDb();
  return db.query<ServerRow, [string]>("SELECT * FROM servers WHERE id = ?").get(id) ?? null;
}

export function getServersByOwner(owner: string, limit: number, offset: number): ServerRow[] {
  const db = getDb();
  return db
    .query<ServerRow, [string, number, number]>(
      "SELECT * FROM servers WHERE owner_wallet = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
    )
    .all(owner, limit, offset);
}

export function countServersByOwner(owner: string): number {
  const db = getDb();
  const row = db
    .query<{ count: number }, [string]>("SELECT COUNT(*) as count FROM servers WHERE owner_wallet = ?")
    .get(owner) as { count: number } | null;
  return row?.count ?? 0;
}

export function updateServerStatus(
  id: string,
  status: string,
  ipv4?: string,
  ipv6?: string,
): void {
  const db = getDb();
  const now = Date.now();
  if (ipv4 !== undefined || ipv6 !== undefined) {
    db.query(
      "UPDATE servers SET status = ?, public_ipv4 = COALESCE(?, public_ipv4), public_ipv6 = COALESCE(?, public_ipv6), updated_at = ? WHERE id = ?",
    ).run(status, ipv4 ?? null, ipv6 ?? null, now, id);
  } else {
    db.query("UPDATE servers SET status = ?, updated_at = ? WHERE id = ?").run(status, now, id);
  }
}

export function deleteServerRow(id: string): void {
  const db = getDb();
  db.query("DELETE FROM servers WHERE id = ?").run(id);
}

export function updateServerTypeAndImage(id: string, type?: string, image?: string): void {
  const db = getDb();
  const now = Date.now();
  if (type !== undefined && image !== undefined) {
    db.query("UPDATE servers SET type = ?, image = ?, updated_at = ? WHERE id = ?").run(type, image, now, id);
  } else if (type !== undefined) {
    db.query("UPDATE servers SET type = ?, updated_at = ? WHERE id = ?").run(type, now, id);
  } else if (image !== undefined) {
    db.query("UPDATE servers SET image = ?, updated_at = ? WHERE id = ?").run(image, now, id);
  }
}

export function insertSshKey(params: {
  id: string;
  provider: string;
  provider_resource_id: string;
  owner_wallet: string;
  name: string;
  fingerprint: string;
}): void {
  const db = getDb();
  const now = Date.now();
  db.query(
    "INSERT INTO ssh_keys (id, provider, provider_resource_id, owner_wallet, name, fingerprint, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(params.id, params.provider, params.provider_resource_id, params.owner_wallet, params.name, params.fingerprint, now);
}

export function getSshKeyById(id: string): SshKeyRow | null {
  const db = getDb();
  return db.query<SshKeyRow, [string]>("SELECT * FROM ssh_keys WHERE id = ?").get(id) ?? null;
}

export function getSshKeysByOwner(owner: string): SshKeyRow[] {
  const db = getDb();
  return db
    .query<SshKeyRow, [string]>("SELECT * FROM ssh_keys WHERE owner_wallet = ? ORDER BY created_at DESC")
    .all(owner);
}

export function deleteSshKeyRow(id: string): void {
  const db = getDb();
  db.query("DELETE FROM ssh_keys WHERE id = ?").run(id);
}
