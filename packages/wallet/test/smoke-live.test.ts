// SPDX-License-Identifier: Apache-2.0
/**
 * Live smoke test against wallet.prim.sh.
 *
 * Run:
 *   pnpm -C packages/wallet test:smoke
 *
 * All checks are non-destructive (health + error paths only).
 * x402-gated routes return 402 without a valid payment token.
 */

import { describe, expect, it } from "vitest";

const BASE_URL = process.env.WALLET_URL ?? "https://wallet.prim.sh";

describe("wallet.sh live smoke test", { timeout: 15_000 }, () => {
  it("0. GET / — health check returns service name", async () => {
    const res = await fetch(`${BASE_URL}/`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.service).toBe("wallet.sh");
    expect(body.status).toBe("ok");
    expect(body.network).toMatch(/^eip155:\d+$/);
  });

  it("1. POST /v1/wallets — missing fields returns 400", async () => {
    const res = await fetch(`${BASE_URL}/v1/wallets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: "0x09D896446fBd3299Fa8d7898001b086E56f642B5" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_request");
  });

  it("2. POST /v1/wallets — invalid signature returns 403", async () => {
    const res = await fetch(`${BASE_URL}/v1/wallets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: "0x09D896446fBd3299Fa8d7898001b086E56f642B5",
        signature: "0xinvalid",
        timestamp: new Date().toISOString(),
      }),
    });
    // 400 (bad sig format) or 403 (sig mismatch) — both are correct rejections
    expect([400, 403]).toContain(res.status);
  });

  it("3. GET /v1/wallets — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/wallets`);
    expect(res.status).toBe(402);
  });

  it("4. GET /v1/wallets/0x0000000000000000000000000000000000000000 — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/wallets/0x0000000000000000000000000000000000000000`);
    expect(res.status).toBe(402);
  });
});
