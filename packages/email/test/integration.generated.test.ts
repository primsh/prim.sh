// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Regenerate: pnpm gen:tests
/**
 * email.sh — Tier 2 integration tests
 *
 * Real stalwart API calls. No x402, no SQLite.
 * Auto-skips when provider credentials are missing.
 *
 * Requires: STALWART_URL, STALWART_API_KEY, EMAIL_DEFAULT_DOMAIN, WALLET_INTERNAL_URL
 */
import { afterAll, describe, expect, it } from "vitest";

const REQUIRED_ENV = ["STALWART_URL","STALWART_API_KEY","EMAIL_DEFAULT_DOMAIN","WALLET_INTERNAL_URL"];
const MISSING_ENV = REQUIRED_ENV.filter((k) => !process.env[k]);

const TEST_PREFIX = `test-int-${Date.now()}`;

describe.skipIf(MISSING_ENV.length > 0)("email.sh integration — stalwart REST", () => {
  if (MISSING_ENV.length > 0) return;

  const apiKey = process.env.STALWART_API_KEY!;

  it("provider API key is valid (non-empty)", () => {
    expect(apiKey.length).toBeGreaterThan(0);
  });

  // TODO: add provider-specific integration tests
  // Provider: stalwart
  // Docs: https://stalw.art/
  // Env: STALWART_URL, STALWART_API_KEY
});