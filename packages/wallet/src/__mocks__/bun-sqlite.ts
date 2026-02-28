// Compatibility shim: bun:sqlite API surface over node:sqlite for vitest (Node 22+)
// Uses createRequire to bypass vite's module bundler and access node:sqlite directly.
// Only implements the subset of bun:sqlite used in db.ts.

import { createRequire } from "node:module";

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as {
  DatabaseSync: new (path: string) => NodeSqliteDb;
};

interface NodeSqliteRunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

interface NodeSqliteStmt {
  get(...args: unknown[]): unknown;
  all(...args: unknown[]): unknown[];
  run(...args: unknown[]): NodeSqliteRunResult;
}

interface NodeSqliteDb {
  exec(sql: string): void;
  prepare(sql: string): NodeSqliteStmt;
  close(): void;
}

interface QueryResult {
  [key: string]: unknown;
}

interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

class PreparedStatement<TRow = QueryResult> {
  private stmt: NodeSqliteStmt;

  constructor(stmt: NodeSqliteStmt) {
    this.stmt = stmt;
  }

  get(...args: unknown[]): TRow | null {
    const params = args.flat();
    const result = params.length > 0 ? this.stmt.get(...params) : this.stmt.get();
    return (result as TRow | undefined) ?? null;
  }

  all(...args: unknown[]): TRow[] {
    const params = args.flat();
    const result = params.length > 0 ? this.stmt.all(...params) : this.stmt.all();
    return result as TRow[];
  }

  run(...args: unknown[]): RunResult {
    const params = args.flat();
    const r = params.length > 0 ? this.stmt.run(...params) : this.stmt.run();
    return { changes: r.changes, lastInsertRowid: Number(r.lastInsertRowid) };
  }
}

export class Database {
  private db: NodeSqliteDb;

  constructor(path: string, _options?: Record<string, unknown>) {
    try {
      this.db = new DatabaseSync(path);
    } catch {
      // Fall back to in-memory DB when path is not writable (e.g., tests)
      this.db = new DatabaseSync(":memory:");
    }
  }

  // run() without params: used for schema DDL statements (CREATE TABLE, CREATE INDEX)
  // run() with params: used for DML (INSERT, UPDATE, DELETE) — returns { changes, lastInsertRowid }
  run(sql: string, ...params: unknown[]): RunResult {
    if (params.length === 0) {
      this.db.exec(sql);
      return { changes: 0, lastInsertRowid: 0 };
    }
    const stmt = this.db.prepare(sql);
    stmt.run(...params);
    // Retrieve changes count via a separate query
    const changesRow = this.db.prepare("SELECT changes() as n").get() as { n: number } | undefined;
    const liRow = this.db.prepare("SELECT last_insert_rowid() as id").get() as
      | { id: number }
      | undefined;
    return { changes: changesRow?.n ?? 0, lastInsertRowid: liRow?.id ?? 0 };
  }

  query<T = QueryResult, _P = unknown[]>(sql: string): PreparedStatement<T> {
    return new PreparedStatement(this.db.prepare(sql));
  }

  transaction<T>(fn: () => T): () => T {
    return () => {
      this.db.exec("BEGIN");
      try {
        const result = fn();
        this.db.exec("COMMIT");
        return result;
      } catch (err) {
        try {
          this.db.exec("ROLLBACK");
        } catch {
          // ignore rollback errors
        }
        throw err;
      }
    };
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  prepare(sql: string): PreparedStatement<QueryResult> {
    return new PreparedStatement(this.db.prepare(sql));
  }

  close(): void {
    this.db.close();
  }
}
