// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Regenerate: pnpm gen:tests
/**
 * Live smoke test against faucet.prim.sh.
 *
 * Run:
 *   pnpm -C packages/faucet test:smoke
 *
 * All checks are non-destructive (health + error paths).
 * faucet.sh is a free service — no x402 gating.
 */

import { describe, expect, it } from "vitest";

const BASE_URL = process.env.FAUCET_URL ?? "https://faucet.prim.sh";

describe("faucet.sh live smoke test", { timeout: 15_000 }, () => {
  it("0. GET / — health check returns service name", async () => {
    const res = await fetch(`${BASE_URL}/`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.service).toBe("faucet.sh");
    expect(body.status).toBe("ok");
  });

  it("1. POST /v1/faucet/usdc — missing fields returns 400", async () => {
    const res = await fetch(`${BASE_URL}/v1/faucet/usdc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
