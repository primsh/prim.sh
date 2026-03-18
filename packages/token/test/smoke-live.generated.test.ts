// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Regenerate: pnpm gen:tests
/**
 * Live smoke test against token.prim.sh.
 *
 * Run:
 *   pnpm -C packages/token test:smoke
 *
 * All checks are non-destructive (health + error paths + 402 gating).
 */

import { describe, expect, it } from "vitest";

const BASE_URL = process.env.TOKEN_URL ?? "https://token.prim.sh";

describe("token.sh live smoke test", { timeout: 15_000 }, () => {
  it("0. GET / — health check returns service name", async () => {
    const res = await fetch(`${BASE_URL}/`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.service).toBe("token.sh");
    expect(body.status).toBe("ok");
  });

  it("1. POST /v1/tokens — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("2. POST /v1/tokens/:id/mint — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/tokens/:id/mint`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("3. POST /v1/tokens/:id/pool — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/tokens/:id/pool`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("4. POST /v1/tokens — missing fields returns 400", async () => {
    const res = await fetch(`${BASE_URL}/v1/tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
