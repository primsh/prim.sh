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
  run(...args: unknown[]): void;
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

  run(...args: unknown[]): void {
    const params = args.flat();
    if (params.length > 0) {
      this.stmt.run(...params);
    } else {
      this.stmt.run();
    }
  }
}

export class Database {
  private db: NodeSqliteDb;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
  }

  run(sql: string): void {
    this.db.exec(sql);
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

  close(): void {
    this.db.close();
  }
}
