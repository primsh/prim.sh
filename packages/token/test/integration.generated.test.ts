// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Regenerate: pnpm gen:tests
/**
 * token.sh — Tier 2 integration tests
 *
 * Real viem API calls. No x402, no SQLite.
 * Auto-skips when provider credentials are missing.
 *
 * Requires: BASE_RPC_URL, TOKEN_MASTER_KEY, TOKEN_DEPLOYER_ENCRYPTED_KEY, WALLET_INTERNAL_URL
 */
import { describe, expect, it } from "vitest";

const REQUIRED_ENV = [
  "BASE_RPC_URL",
  "TOKEN_MASTER_KEY",
  "TOKEN_DEPLOYER_ENCRYPTED_KEY",
  "WALLET_INTERNAL_URL",
];
const MISSING_ENV = REQUIRED_ENV.filter((k) => !process.env[k]);

describe.skipIf(MISSING_ENV.length > 0)("token.sh integration — viem REST", () => {
  if (MISSING_ENV.length > 0) return;

  const apiKey = process.env.BASE_RPC_URL!;

  it("provider API key is valid (non-empty)", () => {
    expect(apiKey.length).toBeGreaterThan(0);
  });

  // TODO: add provider-specific integration tests
  // Provider: viem
  // Docs: https://viem.sh/
  // Env: BASE_RPC_URL
});
