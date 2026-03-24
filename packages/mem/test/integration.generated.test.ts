// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Regenerate: pnpm gen:tests
/**
 * mem.sh — Tier 2 integration tests
 *
 * Real qdrant API calls. No x402, no SQLite.
 * Auto-skips when provider credentials are missing.
 *
 * Requires: QDRANT_URL, GOOGLE_API_KEY, WALLET_INTERNAL_URL
 */
import { afterAll, describe, expect, it } from "vitest";

const REQUIRED_ENV = ["QDRANT_URL","GOOGLE_API_KEY","WALLET_INTERNAL_URL"];
const MISSING_ENV = REQUIRED_ENV.filter((k) => !process.env[k]);

const TEST_PREFIX = `test-int-${Date.now()}`;

describe.skipIf(MISSING_ENV.length > 0)("mem.sh integration — qdrant REST", () => {
  if (MISSING_ENV.length > 0) return;

  const apiKey = process.env.QDRANT_URL!;

  it("provider API key is valid (non-empty)", () => {
    expect(apiKey.length).toBeGreaterThan(0);
  });

  // TODO: add provider-specific integration tests
  // Provider: qdrant
  // Docs: https://qdrant.tech/
  // Env: QDRANT_URL
});