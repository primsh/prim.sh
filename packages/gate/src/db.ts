import { randomBytes } from "node:crypto";
import { Database } from "bun:sqlite";
import { join } from "node:path";

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS invite_codes (
  code TEXT PRIMARY KEY,
  wallet TEXT,
  redeemed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  label TEXT
);
`;

let _db: Database | null = null;

function getDbPath(): string {
  return (
    process.env.GATE_DB_PATH ??
    join(process.env.PRIM_DATA_DIR ?? "/var/lib/prim", "gate.db")
  );
}

function getDb(): Database {
  if (_db) return _db;
  _db = new Database(getDbPath(), { create: true });
  _db.exec("PRAGMA journal_mode=WAL;");
  _db.exec(INIT_SQL);
  // Migrate existing DBs that lack new columns
  try {
    _db.exec("ALTER TABLE invite_codes ADD COLUMN created_at TEXT DEFAULT (datetime('now'))");
  } catch (_) {
    /* column already exists */
  }
  try {
    _db.exec("ALTER TABLE invite_codes ADD COLUMN label TEXT");
  } catch (_) {
    /* column already exists */
  }
  return _db;
}

/** Seed invite codes from env var. Skips codes that already exist. */
export function seedCodes(codes: string[]): number {
  const db = getDb();
  const stmt = db.prepare("INSERT OR IGNORE INTO invite_codes (code) VALUES (?)");
  let seeded = 0;
  for (const code of codes) {
    const trimmed = code.trim();
    if (trimmed) {
      const result = stmt.run(trimmed);
      if (result.changes > 0) seeded++;
    }
  }
  return seeded;
}

export type ValidateResult =
  | { ok: true }
  | { ok: false; reason: "invalid_code" | "code_redeemed" };

/** Validate and burn an invite code atomically. */
export function validateAndBurn(code: string, wallet: string): ValidateResult {
  const db = getDb();

  const row = db
    .prepare("SELECT code, wallet, redeemed_at FROM invite_codes WHERE code = ?")
    .get(code) as { code: string; wallet: string | null; redeemed_at: string | null } | null;

  if (!row) {
    return { ok: false, reason: "invalid_code" };
  }

  if (row.redeemed_at) {
    return { ok: false, reason: "code_redeemed" };
  }

  db.prepare("UPDATE invite_codes SET wallet = ?, redeemed_at = ? WHERE code = ?").run(
    wallet,
    new Date().toISOString(),
    code,
  );

  return { ok: true };
}

/** Reset DB connection (for tests). */
export function resetDb(): void {
  _db = null;
}

/** Generate a random invite code: PRIM-<8 hex chars>. */
export function generateCode(): string {
  return `PRIM-${randomBytes(4).toString("hex")}`;
}

export interface CodeRow {
  code: string;
  created_at: string | null;
  label: string | null;
  wallet: string | null;
  redeemed_at: string | null;
}

/** Insert codes into the DB. Returns count actually inserted (skips dupes). */
export function insertCodes(codes: string[], label?: string): number {
  const db = getDb();
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO invite_codes (code, label) VALUES (?, ?)",
  );
  let inserted = 0;
  for (const code of codes) {
    const trimmed = code.trim();
    if (trimmed) {
      const result = stmt.run(trimmed, label ?? null);
      if (result.changes > 0) inserted++;
    }
  }
  return inserted;
}

/** List codes, optionally filtered by status. */
export function listCodes(status?: "available" | "redeemed"): CodeRow[] {
  const db = getDb();
  if (status === "available") {
    return db
      .prepare("SELECT code, created_at, label, wallet, redeemed_at FROM invite_codes WHERE redeemed_at IS NULL")
      .all() as unknown as CodeRow[];
  }
  if (status === "redeemed") {
    return db
      .prepare("SELECT code, created_at, label, wallet, redeemed_at FROM invite_codes WHERE redeemed_at IS NOT NULL")
      .all() as unknown as CodeRow[];
  }
  return db
    .prepare("SELECT code, created_at, label, wallet, redeemed_at FROM invite_codes")
    .all() as unknown as CodeRow[];
}

export type RevokeResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "already_redeemed" };

/** Revoke (delete) an available code. Returns error if missing or already redeemed. */
export function revokeCode(code: string): RevokeResult {
  const db = getDb();
  const row = db
    .prepare("SELECT code, redeemed_at FROM invite_codes WHERE code = ?")
    .get(code) as { code: string; redeemed_at: string | null } | null;

  if (!row) {
    return { ok: false, reason: "not_found" };
  }
  if (row.redeemed_at) {
    return { ok: false, reason: "already_redeemed" };
  }

  db.prepare("DELETE FROM invite_codes WHERE code = ?").run(code);
  return { ok: true };
}
