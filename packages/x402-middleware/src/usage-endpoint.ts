// SPDX-License-Identifier: Apache-2.0
import type { Context } from "hono";
import type { AccessLogEntry, AccessLogQuery } from "./access-log.js";

/**
 * Handler for GET /internal/usage — query access logs over HTTP.
 *
 * Auth: requires x-internal-key header matching INTERNAL_API_KEY env var.
 *
 * Query params: wallet, since, until, status, limit (default 100).
 */
export function createUsageHandler(serviceName: string) {
  return async (c: Context) => {
    const key = c.req.header("x-internal-key");
    const expected = process.env.INTERNAL_API_KEY;
    if (!expected || key !== expected) {
      return c.json(
        { error: { code: "unauthorized", message: "Invalid or missing x-internal-key" } },
        401,
      );
    }

    // Lazy import to avoid bun:sqlite in test environments
    const mod = await import(/* @vite-ignore */ "./access-log.js");
    const db = mod.getAccessLogDb(serviceName);

    const url = new URL(c.req.url);
    const filters: AccessLogQuery = {};

    const wallet = url.searchParams.get("wallet");
    if (wallet) filters.wallet = wallet;

    const since = url.searchParams.get("since");
    if (since) filters.since = Number(since);

    const until = url.searchParams.get("until");
    if (until) filters.until = Number(until);

    const status = url.searchParams.get("status");
    if (status) filters.status = Number(status);

    const limit = url.searchParams.get("limit");
    filters.limit = limit ? Number(limit) : 100;

    const entries: AccessLogEntry[] = mod.queryAccessLog(db, filters);

    let totalUsdc = 0;
    const wallets = new Set<string>();
    for (const e of entries) {
      if (e.price_usdc) totalUsdc += Number.parseFloat(e.price_usdc);
      if (e.wallet) wallets.add(e.wallet);
    }

    return c.json({
      service: serviceName,
      entries,
      summary: {
        total_requests: entries.length,
        total_usdc: totalUsdc.toFixed(6),
        unique_wallets: wallets.size,
      },
    });
  };
}
