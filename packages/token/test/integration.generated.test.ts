// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Regenerate: pnpm gen:tests
/**
 * token.sh — Tier 2 integration tests
 *
 * Real viem API calls. No x402, no SQLite.
 * Auto-skips when provider credentials are missing.
 *
 * Requires: BASE_RPC_URL
 * Docs: https://viem.sh/docs/getting-started
 */
import { describe, expect, it } from "vitest";

const REQUIRED_ENV = ["BASE_RPC_URL"];
const MISSING_ENV = REQUIRED_ENV.filter((k) => !process.env[k]);

describe.skipIf(MISSING_ENV.length > 0)("token.sh integration — viem", () => {
  if (MISSING_ENV.length > 0) return;

  it("health check — POST Viem (Base RPC)", async () => {
    const res = await fetch(`${process.env.BASE_RPC_URL}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}',
    });
    expect(res.status).toBe(200);
  });
});
