import { Database } from "bun:sqlite";

export interface DeploymentRow {
  id: string;
  contract_address: string | null;
  owner_wallet: string;
  name: string;
  symbol: string;
  decimals: number;
  initial_supply: string;
  total_minted: string;
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

  // Create table with current schema
  _db.run(`
    CREATE TABLE IF NOT EXISTS deployments (
      id               TEXT PRIMARY KEY,
      contract_address  TEXT UNIQUE,
      owner_wallet      TEXT NOT NULL,
      name              TEXT NOT NULL,
      symbol            TEXT NOT NULL,
      decimals          INTEGER NOT NULL DEFAULT 18,
      initial_supply    TEXT NOT NULL,
      total_minted      TEXT NOT NULL DEFAULT '0',
      mintable          INTEGER NOT NULL DEFAULT 0,
      max_supply        TEXT,
      tx_hash           TEXT NOT NULL,
      deploy_status     TEXT NOT NULL DEFAULT 'pending',
      created_at        INTEGER NOT NULL,
      updated_at        INTEGER NOT NULL
    )
  `);

  // Migration: add total_minted column if missing (existing DBs from before TK-4)
  const cols = _db
    .query<{ name: string }, []>("PRAGMA table_info(deployments)")
    .all()
    .map((r) => r.name);

  if (!cols.includes("total_minted")) {
    _db.run("ALTER TABLE deployments ADD COLUMN total_minted TEXT NOT NULL DEFAULT '0'");
  }

  // Migration: drop factory_address column if present (requires table-rebuild on SQLite)
  if (cols.includes("factory_address")) {
    _db.run(`
      CREATE TABLE deployments_v2 (
        id               TEXT PRIMARY KEY,
        contract_address  TEXT UNIQUE,
        owner_wallet      TEXT NOT NULL,
        name              TEXT NOT NULL,
        symbol            TEXT NOT NULL,
        decimals          INTEGER NOT NULL DEFAULT 18,
        initial_supply    TEXT NOT NULL,
        total_minted      TEXT NOT NULL DEFAULT '0',
        mintable          INTEGER NOT NULL DEFAULT 0,
        max_supply        TEXT,
        tx_hash           TEXT NOT NULL,
        deploy_status     TEXT NOT NULL DEFAULT 'pending',
        created_at        INTEGER NOT NULL,
        updated_at        INTEGER NOT NULL
      )
    `);
    _db.run(`
      INSERT INTO deployments_v2
        SELECT id, contract_address, owner_wallet, name, symbol, decimals,
               initial_supply, '0', mintable, max_supply, tx_hash,
               deploy_status, created_at, updated_at
        FROM deployments
    `);
    _db.run("DROP TABLE deployments");
    _db.run("ALTER TABLE deployments_v2 RENAME TO deployments");
  }

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
    `INSERT INTO deployments (id, contract_address, owner_wallet, name, symbol, decimals, initial_supply, total_minted, mintable, max_supply, tx_hash, deploy_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, '0', ?, ?, ?, ?, ?, ?)`,
  ).run(
    params.id,
    params.contract_address,
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

export function incrementTotalMinted(id: string, amount: string): void {
  const db = getDb();
  const row = getDeploymentById(id);
  if (!row) return;
  const newTotal = (BigInt(row.total_minted) + BigInt(amount)).toString();
  db.query("UPDATE deployments SET total_minted = ?, updated_at = ? WHERE id = ?").run(
    newTotal,
    Date.now(),
    id,
  );
}
