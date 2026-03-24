// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Regenerate: pnpm gen:tests
/**
 * search.sh — Tier 2 integration tests
 *
 * Real tavily API calls. No x402, no SQLite.
 * Auto-skips when provider credentials are missing.
 *
 * Requires: TAVILY_API_KEY, WALLET_INTERNAL_URL
 */
import { afterAll, describe, expect, it } from "vitest";

const REQUIRED_ENV = ["TAVILY_API_KEY","WALLET_INTERNAL_URL"];
const MISSING_ENV = REQUIRED_ENV.filter((k) => !process.env[k]);

const TEST_PREFIX = `test-int-${Date.now()}`;

describe.skipIf(MISSING_ENV.length > 0)("search.sh integration — tavily REST", () => {
  if (MISSING_ENV.length > 0) return;

  const apiKey = process.env.TAVILY_API_KEY!;

  it("provider API key is valid (non-empty)", () => {
    expect(apiKey.length).toBeGreaterThan(0);
  });

  // TODO: add provider-specific integration tests
  // Provider: tavily
  // Docs: https://tavily.com/
  // Env: TAVILY_API_KEY
});