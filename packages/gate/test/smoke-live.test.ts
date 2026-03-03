// SPDX-License-Identifier: Apache-2.0
/**
 * Live smoke test against gate.prim.sh.
 *
 * Run:
 *   pnpm -C packages/gate test:smoke
 *
 * Optional env:
 *   GATE_URL         — override base URL (default: https://gate.prim.sh)
 *   GATE_TEST_CODE   — a valid, unredeemed invite code to test full redeem flow
 *   GATE_TEST_WALLET — wallet address for redeem test (required with GATE_TEST_CODE)
 *
 * Without GATE_TEST_CODE + GATE_TEST_WALLET, only non-destructive checks run.
 */

import { describe, expect, it } from "vitest";

const BASE_URL = process.env.GATE_URL ?? "https://gate.prim.sh";

describe("gate.sh live smoke test", { timeout: 15_000 }, () => {
  it("0. GET / — health check returns service name and network", async () => {
    const res = await fetch(`${BASE_URL}/`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.service).toBe("gate.sh");
    expect(body.status).toBe("ok");
    expect(body.network).toMatch(/^eip155:\d+$/);
  });

  it("1. POST /v1/redeem — missing code returns 400", async () => {
    const res = await fetch(`${BASE_URL}/v1/redeem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet: "0x09D896446fBd3299Fa8d7898001b086E56f642B5" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_request");
  });

  it("2. POST /v1/redeem — missing wallet returns 400", async () => {
    const res = await fetch(`${BASE_URL}/v1/redeem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "PRIM-00000000" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_request");
  });

  it("3. POST /v1/redeem — invalid code returns 400", async () => {
    const res = await fetch(`${BASE_URL}/v1/redeem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "PRIM-does-not-exist",
        wallet: "0x09D896446fBd3299Fa8d7898001b086E56f642B5",
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_code");
  });

  const hasRedeemEnv = !!process.env.GATE_TEST_CODE && !!process.env.GATE_TEST_WALLET;

  it.skipIf(!hasRedeemEnv)(
    "4. POST /v1/redeem — valid code returns 200 with network and funding",
    async () => {
      const code = process.env.GATE_TEST_CODE!;
      const wallet = process.env.GATE_TEST_WALLET!;

      const res = await fetch(`${BASE_URL}/v1/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, wallet }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("redeemed");
      expect(body.wallet).toBeTruthy();
      expect(body.network).toMatch(/^eip155:\d+$/);
      expect(body.funded.usdc).toBeTruthy();
      expect(body.funded.eth).toBeTruthy();
      expect(body.funded.usdc_tx).toMatch(/^0x/);
      expect(body.funded.eth_tx).toMatch(/^0x/);
    },
  );
});
