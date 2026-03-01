// SPDX-License-Identifier: Apache-2.0
import { getDb } from "./db.ts";

type Scope = "all" | "send" | "swap";

interface CircuitBreakerRow {
  scope: string;
  paused_at: string | null;
  updated_at: number;
}

export function pause(scope: Scope): void {
  const db = getDb();
  const now = Date.now();
  const pausedAt = new Date().toISOString();
  db.query(
    "INSERT INTO circuit_breaker (scope, paused_at, updated_at) VALUES (?, ?, ?) ON CONFLICT(scope) DO UPDATE SET paused_at = excluded.paused_at, updated_at = excluded.updated_at",
  ).run(scope, pausedAt, now);
}

export function resume(scope: Scope): void {
  const db = getDb();
  const now = Date.now();
  db.query(
    "INSERT INTO circuit_breaker (scope, paused_at, updated_at) VALUES (?, NULL, ?) ON CONFLICT(scope) DO UPDATE SET paused_at = NULL, updated_at = excluded.updated_at",
  ).run(scope, now);
}

export function isPaused(flowType: string): boolean {
  const db = getDb();
  const allRow = db
    .query<CircuitBreakerRow, [string]>("SELECT * FROM circuit_breaker WHERE scope = ?")
    .get("all");
  if (allRow?.paused_at !== null && allRow?.paused_at !== undefined) {
    return true;
  }
  const scopeRow = db
    .query<CircuitBreakerRow, [string]>("SELECT * FROM circuit_breaker WHERE scope = ?")
    .get(flowType);
  return scopeRow?.paused_at !== null && scopeRow?.paused_at !== undefined;
}

export function assertNotPaused(flowType: string): void {
  if (isPaused(flowType)) {
    throw new Error(`Circuit breaker is open for scope: ${flowType}`);
  }
}

export function getState(): Record<string, string | null> {
  const db = getDb();
  const rows = db.query<CircuitBreakerRow>("SELECT * FROM circuit_breaker").all();
  const state: Record<string, string | null> = {};
  for (const row of rows) {
    state[row.scope] = row.paused_at;
  }
  return state;
}
