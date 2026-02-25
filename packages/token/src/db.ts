import { Database } from "bun:sqlite";

export interface DeploymentRow {
  id: string;
  contract_address: string | null;
  factory_address: string;
  owner_wallet: string;
  name: string;
  symbol: string;
  decimals: number;
  initial_supply: string;
  mintable: number;
  max_supply: string | null;
  tx_hash: string;
  deploy_status: string;
  created_at: number;
  updated_at: number;
}

let _db: Database | null = null;

export function getDb(): Database {
  if (_db) return _db;

  const dbPath = process.env.TOKEN_DB_PATH ?? "./token.db";
  _db = new Database(dbPath);

  _db.run(`
    CREATE TABLE IF NOT EXISTS deployments (
      id               TEXT PRIMARY KEY,
      contract_address  TEXT UNIQUE,
      factory_address   TEXT NOT NULL,
      owner_wallet      TEXT NOT NULL,
      name              TEXT NOT NULL,
      symbol            TEXT NOT NULL,
      decimals          INTEGER NOT NULL DEFAULT 18,
      initial_supply    TEXT NOT NULL,
      mintable          INTEGER NOT NULL DEFAULT 0,
      max_supply        TEXT,
      tx_hash           TEXT NOT NULL,
      deploy_status     TEXT NOT NULL DEFAULT 'pending',
      created_at        INTEGER NOT NULL,
      updated_at        INTEGER NOT NULL
    )
  `);

  _db.run("CREATE INDEX IF NOT EXISTS idx_deployments_owner_wallet ON deployments(owner_wallet)");

  return _db;
}

export function resetDb(): void {
  _db = null;
}

// ─── Deployment queries ──────────────────────────────────────────────────

export function getDeploymentById(id: string): DeploymentRow | null {
  const db = getDb();
  return db.query<DeploymentRow, [string]>("SELECT * FROM deployments WHERE id = ?").get(id) ?? null;
}

export function getDeploymentsByOwner(owner: string): DeploymentRow[] {
  const db = getDb();
  return db
    .query<DeploymentRow, [string]>(
      "SELECT * FROM deployments WHERE owner_wallet = ? ORDER BY created_at DESC",
    )
    .all(owner);
}

export function insertDeployment(params: {
  id: string;
  contract_address: string | null;
  factory_address: string;
  owner_wallet: string;
  name: string;
  symbol: string;
  decimals: number;
  initial_supply: string;
  mintable: boolean;
  max_supply: string | null;
  tx_hash: string;
  deploy_status: string;
}): void {
  const db = getDb();
  const now = Date.now();
  db.query(
    `INSERT INTO deployments (id, contract_address, factory_address, owner_wallet, name, symbol, decimals, initial_supply, mintable, max_supply, tx_hash, deploy_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    params.id,
    params.contract_address,
    params.factory_address,
    params.owner_wallet,
    params.name,
    params.symbol,
    params.decimals,
    params.initial_supply,
    params.mintable ? 1 : 0,
    params.max_supply,
    params.tx_hash,
    params.deploy_status,
    now,
    now,
  );
}

export function updateDeploymentStatus(
  id: string,
  status: string,
  contractAddress?: string,
): void {
  const db = getDb();
  if (contractAddress) {
    db.query(
      "UPDATE deployments SET deploy_status = ?, contract_address = ?, updated_at = ? WHERE id = ?",
    ).run(status, contractAddress, Date.now(), id);
  } else {
    db.query("UPDATE deployments SET deploy_status = ?, updated_at = ? WHERE id = ?").run(
      status,
      Date.now(),
      id,
    );
  }
}
