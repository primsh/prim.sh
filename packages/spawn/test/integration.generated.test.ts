// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Regenerate: pnpm gen:tests
/**
 * spawn.sh — Tier 2 integration tests
 *
 * Real digitalocean API calls. No x402, no SQLite.
 * Auto-skips when provider credentials are missing.
 *
 * Requires: DO_API_TOKEN, WALLET_INTERNAL_URL
 */
import { describe, expect, it } from "vitest";

const REQUIRED_ENV = ["DO_API_TOKEN", "WALLET_INTERNAL_URL"];
const MISSING_ENV = REQUIRED_ENV.filter((k) => !process.env[k]);

describe.skipIf(MISSING_ENV.length > 0)("spawn.sh integration — digitalocean REST", () => {
  if (MISSING_ENV.length > 0) return;

  const apiKey = process.env.DO_API_TOKEN!;

  it("provider API key is valid (non-empty)", () => {
    expect(apiKey.length).toBeGreaterThan(0);
  });

  // TODO: add provider-specific integration tests
  // Provider: digitalocean
  // Docs: https://www.digitalocean.com/
  // Env: DO_API_TOKEN
});
