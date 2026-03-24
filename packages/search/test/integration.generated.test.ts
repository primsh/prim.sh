// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Regenerate: pnpm gen:tests
/**
 * search.sh — Tier 2 integration tests
 *
 * Real tavily API calls. No x402, no SQLite.
 * Auto-skips when provider credentials are missing.
 *
 * Requires: TAVILY_API_KEY
 * Docs: https://docs.tavily.com/documentation/api-reference/search
 */
import { describe, expect, it } from "vitest";

const REQUIRED_ENV = ["TAVILY_API_KEY"];
const MISSING_ENV = REQUIRED_ENV.filter((k) => !process.env[k]);

describe.skipIf(MISSING_ENV.length > 0)("search.sh integration — tavily", () => {
  if (MISSING_ENV.length > 0) return;

  it("health check — POST Tavily", async () => {
    const res = await fetch(`https://api.tavily.com/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: `{"api_key": "${process.env.TAVILY_API_KEY}", "query": "test", "max_results": 1}`,
    });
    expect(res.status).toBe(200);
  });
});
