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
  const dbPath = process.env.FEEDBACK_DB_PATH ?? join(dataDir, "feedback.db");
  _db = new Database(dbPath);

  _db.run(`
    CREATE TABLE IF NOT EXISTS feedback (
      id         TEXT PRIMARY KEY,
      primitive  TEXT NOT NULL,
      endpoint   TEXT,
      type       TEXT NOT NULL CHECK(type IN ('bug','friction','feature','praise')),
      body       TEXT NOT NULL,
      wallet     TEXT,
      request_id TEXT,
      created_at INTEGER NOT NULL
    )
  `);

  return _db;
}

export function resetDb(): void {
  _db?.close();
  _db = null;
}

// ─── Feedback queries ──────────────────────────────────────────────────────

export interface FeedbackRow {
  id: string;
  primitive: string;
  endpoint: string | null;
  type: string;
  body: string;
  wallet: string | null;
  request_id: string | null;
  created_at: number;
}

export function insertFeedback(row: Omit<FeedbackRow, "created_at"> & { created_at?: number }): void {
  const db = getDb();
  const ts = row.created_at ?? Date.now();
  db.query(
    `INSERT INTO feedback (id, primitive, endpoint, type, body, wallet, request_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(row.id, row.primitive, row.endpoint ?? null, row.type, row.body, row.wallet ?? null, row.request_id ?? null, ts);
}

export function listFeedback(opts: { primitive?: string; limit?: number; offset?: number }): FeedbackRow[] {
  const db = getDb();
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);

  if (opts.primitive) {
    return db
      .query<FeedbackRow, [string, number, number]>(
        "SELECT * FROM feedback WHERE primitive = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
      )
      .all(opts.primitive, limit, offset);
  }
  return db
    .query<FeedbackRow, [number, number]>(
      "SELECT * FROM feedback ORDER BY created_at DESC LIMIT ? OFFSET ?",
    )
    .all(limit, offset);
}

export function countFeedback(primitive?: string): number {
  const db = getDb();
  if (primitive) {
    const row = db.query<{ count: number }, [string]>("SELECT COUNT(*) as count FROM feedback WHERE primitive = ?").get(primitive);
    return row?.count ?? 0;
  }
  const row = db.query<{ count: number }, []>("SELECT COUNT(*) as count FROM feedback").get();
  return row?.count ?? 0;
}
