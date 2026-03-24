// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Regenerate: pnpm gen:tests
/**
 * infer.sh — Tier 2 integration tests
 *
 * Real openrouter API calls. No x402, no SQLite.
 * Auto-skips when provider credentials are missing.
 *
 * Requires: OPENROUTER_API_KEY, WALLET_INTERNAL_URL, PRIM_INTERNAL_KEY
 */
import { afterAll, describe, expect, it } from "vitest";

const REQUIRED_ENV = ["OPENROUTER_API_KEY","WALLET_INTERNAL_URL","PRIM_INTERNAL_KEY"];
const MISSING_ENV = REQUIRED_ENV.filter((k) => !process.env[k]);

const TEST_PREFIX = `test-int-${Date.now()}`;

describe.skipIf(MISSING_ENV.length > 0)("infer.sh integration — openrouter REST", () => {
  if (MISSING_ENV.length > 0) return;

  const apiKey = process.env.OPENROUTER_API_KEY!;

  it("provider API key is valid (non-empty)", () => {
    expect(apiKey.length).toBeGreaterThan(0);
  });

  // TODO: add provider-specific integration tests
  // Provider: openrouter
  // Docs: https://openrouter.ai/
  // Env: OPENROUTER_API_KEY
});