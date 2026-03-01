// SPDX-License-Identifier: Apache-2.0
// Compatibility shim: bun:sqlite API surface over node:sqlite for vitest (Node 22+)
// Uses createRequire to bypass vite's module bundler and access node:sqlite directly.
// Only implements the subset of bun:sqlite used in db.ts.

import { createRequire } from "node:module";

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as {
  DatabaseSync: new (path: string) => NodeSqliteDb;
};

interface NodeSqliteStmt {
  get(...args: unknown[]): unknown;
  all(...args: unknown[]): unknown[];
  run(...args: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
}

interface NodeSqliteDb {
  exec(sql: string): void;
  prepare(sql: string): NodeSqliteStmt;
  close(): void;
}

interface QueryResult {
  [key: string]: unknown;
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

  run(...args: unknown[]): { changes: number } {
    const params = args.flat();
    const result = params.length > 0 ? this.stmt.run(...params) : this.stmt.run();
    return { changes: Number(result.changes) };
  }
}

export class Database {
  private db: NodeSqliteDb;

  constructor(path: string, _options?: { create?: boolean }) {
    this.db = new DatabaseSync(path);
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  prepare<T = QueryResult>(sql: string): PreparedStatement<T> {
    return new PreparedStatement(this.db.prepare(sql));
  }

  close(): void {
    this.db.close();
  }
}
