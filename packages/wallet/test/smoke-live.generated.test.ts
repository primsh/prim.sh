// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Regenerate: pnpm gen:tests
/**
 * Live smoke test against wallet.prim.sh.
 *
 * Run:
 *   pnpm -C packages/wallet test:smoke
 *
 * All checks are non-destructive (health + error paths + 402 gating).
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
  });

  it("1. POST /v1/wallets — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/wallets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("2. DELETE /v1/wallets/:address — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/wallets/:address`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("3. POST /v1/wallets/:address/fund-request — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/wallets/:address/fund-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("4. POST /v1/fund-requests/:id/approve — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/fund-requests/:id/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("5. POST /v1/fund-requests/:id/deny — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/fund-requests/:id/deny`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("6. PUT /v1/wallets/:address/policy — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/wallets/:address/policy`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("7. POST /v1/wallets/:address/pause — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/wallets/:address/pause`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("8. POST /v1/wallets/:address/resume — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/wallets/:address/resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("9. POST /v1/wallets — missing fields returns 400", async () => {
    const res = await fetch(`${BASE_URL}/v1/wallets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
