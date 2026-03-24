// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Regenerate: pnpm gen:tests
/**
 * domain.sh — Tier 2 integration tests
 *
 * Real cloudflare API calls. No x402, no SQLite.
 * Auto-skips when provider credentials are missing.
 *
 * Requires: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID, NAMESILO_API_KEY, WALLET_INTERNAL_URL
 */
import { describe, expect, it } from "vitest";

const REQUIRED_ENV = [
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ZONE_ID",
  "NAMESILO_API_KEY",
  "WALLET_INTERNAL_URL",
];
const MISSING_ENV = REQUIRED_ENV.filter((k) => !process.env[k]);

describe.skipIf(MISSING_ENV.length > 0)("domain.sh integration — cloudflare REST", () => {
  if (MISSING_ENV.length > 0) return;

  const apiKey = process.env.CLOUDFLARE_API_TOKEN!;

  it("provider API key is valid (non-empty)", () => {
    expect(apiKey.length).toBeGreaterThan(0);
  });

  // TODO: add provider-specific integration tests
  // Provider: cloudflare
  // Docs: https://www.cloudflare.com/
  // Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID
});
