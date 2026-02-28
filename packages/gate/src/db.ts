import { Database } from "bun:sqlite";
import { join } from "node:path";

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS invite_codes (
  code TEXT PRIMARY KEY,
  wallet TEXT,
  redeemed_at TEXT
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
