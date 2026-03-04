// SPDX-License-Identifier: Apache-2.0
import { Database } from "bun:sqlite";
import { join } from "node:path";
import type { MiddlewareHandler } from "hono";
import type { AgentStackRouteConfig } from "./types.js";

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS access_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  method      TEXT NOT NULL,
  path        TEXT NOT NULL,
  status      INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  wallet      TEXT,
  request_id  TEXT,
  created_at  INTEGER NOT NULL,
  price_usdc  TEXT,
  network     TEXT
);
CREATE INDEX IF NOT EXISTS idx_access_log_wallet_ts ON access_log (wallet, created_at);
CREATE INDEX IF NOT EXISTS idx_access_log_ts ON access_log (created_at);
`;

/** Columns added after initial schema — migrated via ALTER TABLE on existing DBs. */
const MIGRATION_COLUMNS = ["price_usdc", "network"] as const;

const _dbs = new Map<string, Database>();

function dbPath(serviceName: string): string {
  const slug = serviceName.replace(/\.sh$/, "");
  return join(process.env.PRIM_DATA_DIR ?? "/var/lib/prim", `${slug}-access.db`);
}

/** Run schema migrations for columns that may not exist on older DBs. */
function migrateSchema(db: Database): void {
  const cols = db.prepare("PRAGMA table_info(access_log)").all() as Array<{ name: string }>;
  const existing = new Set(cols.map((c) => c.name));
  for (const col of MIGRATION_COLUMNS) {
    if (!existing.has(col)) {
      db.exec(`ALTER TABLE access_log ADD COLUMN ${col} TEXT`);
    }
  }
}

/**
 * Get or create the access log database for a service.
 * Reusable for both the middleware and query scripts.
 */
export function getAccessLogDb(serviceName: string): Database {
  const path = dbPath(serviceName);
  let db = _dbs.get(path);
  if (db) return db;
  db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode=WAL;");
  db.exec(INIT_SQL);
  migrateSchema(db);
  _dbs.set(path, db);
  return db;
}

export interface AccessLogEntry {
  id: number;
  method: string;
  path: string;
  status: number;
  duration_ms: number;
  wallet: string | null;
  request_id: string | null;
  created_at: number;
  price_usdc: string | null;
  network: string | null;
}

export interface AccessLogQuery {
  wallet?: string;
  method?: string;
  path?: string;
  status?: number;
  since?: number;
  until?: number;
  limit?: number;
}

/**
 * Query access log entries with optional filters.
 */
export function queryAccessLog(db: Database, filters: AccessLogQuery = {}): AccessLogEntry[] {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters.wallet) {
    clauses.push("wallet = ?");
    params.push(filters.wallet);
  }
  if (filters.method) {
    clauses.push("method = ?");
    params.push(filters.method);
  }
  if (filters.path) {
    clauses.push("path = ?");
    params.push(filters.path);
  }
  if (filters.status != null) {
    clauses.push("status = ?");
    params.push(filters.status);
  }
  if (filters.since != null) {
    clauses.push("created_at >= ?");
    params.push(filters.since);
  }
  if (filters.until != null) {
    clauses.push("created_at <= ?");
    params.push(filters.until);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = filters.limit ?? 1000;

  return db
    .prepare(`SELECT * FROM access_log ${where} ORDER BY created_at DESC LIMIT ?`)
    .all(...params, limit) as unknown as AccessLogEntry[];
}

/**
 * Resolve the price for a given "METHOD /path" from the route config map.
 *
 * Matching order:
 *   1. Exact match: "POST /v1/buckets"
 *   2. Pattern match: "GET /v1/buckets/[id]" → matches "GET /v1/buckets/b_abc"
 *      Patterns: [param] → [^/]+, * → .+
 */
export function resolveRoutePrice(routeKey: string, routes: AgentStackRouteConfig): string | null {
  // Exact match
  const exact = routes[routeKey];
  if (exact != null) {
    return typeof exact === "string" ? exact : exact.price;
  }

  // Pattern match
  for (const [pattern, value] of Object.entries(routes)) {
    if (!pattern.includes("[") && !pattern.includes("*")) continue;
    const regex = new RegExp(`^${pattern.replace(/\[[^\]]+\]/g, "[^/]+").replace(/\*/g, ".+")}$`);
    if (regex.test(routeKey)) {
      return typeof value === "string" ? value : value.price;
    }
  }

  return null;
}

export interface AccessLogMiddlewareOptions {
  routes?: AgentStackRouteConfig;
  network?: string;
}

/**
 * Hono middleware that logs every request to a per-service SQLite DB.
 *
 * Position: after requestIdMiddleware, before everything else.
 * Calls `await next()` so x402 + routes run first, then captures
 * wallet address (set by x402), response status, and duration.
 */
export function createAccessLogMiddleware(
  serviceName: string,
  options?: AccessLogMiddlewareOptions,
): MiddlewareHandler {
  const db = getAccessLogDb(serviceName);
  const stmt = db.prepare(
    "INSERT INTO access_log (method, path, status, duration_ms, wallet, request_id, created_at, price_usdc, network) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const routes = options?.routes;
  const network = options?.network ?? null;

  return async (c, next) => {
    const start = Date.now();
    await next();
    const duration = Date.now() - start;

    const method = c.req.method;
    const path = new URL(c.req.url).pathname;
    const status = c.res.status;
    const wallet = c.get("walletAddress") ?? null;
    const requestId = c.get("requestId") ?? null;

    // Only resolve price for paid (non-402) responses with a wallet
    let priceUsdc: string | null = null;
    if (routes && wallet && status !== 402) {
      priceUsdc = resolveRoutePrice(`${method} ${path}`, routes);
    }

    try {
      stmt.run(method, path, status, duration, wallet, requestId, start, priceUsdc, network);
    } catch (_) {
      // Non-blocking — never fail a request because of logging
    }
  };
}

/** Reset DB connections (for tests). */
export function resetAccessLogDbs(): void {
  _dbs.clear();
}
