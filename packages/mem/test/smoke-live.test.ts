// SPDX-License-Identifier: Apache-2.0
/**
 * Live smoke test against mem.prim.sh.
 *
 * Run:
 *   pnpm -C packages/mem test:smoke
 *
 * All checks are non-destructive (health + error paths + 402 gating).
 */

import { describe, expect, it } from "vitest";

const BASE_URL = process.env.MEM_URL ?? "https://mem.prim.sh";

// BEGIN:GENERATED:SMOKE_LIVE
describe("mem.sh live smoke test", { timeout: 15_000 }, () => {
  it("0. GET / — health check returns service name", async () => {
    const res = await fetch(`${BASE_URL}/`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.service).toBe("mem.sh");
    expect(body.status).toBe("ok");
  });

  it("1. POST /v1/collections — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/collections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("2. DELETE /v1/collections/:id — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/collections/:id`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("3. POST /v1/collections/:id/upsert — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/collections/:id/upsert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("4. POST /v1/collections/:id/query — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/collections/:id/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("5. PUT /v1/cache/:namespace/:key — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/cache/:namespace/:key`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("6. DELETE /v1/cache/:namespace/:key — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/cache/:namespace/:key`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("7. POST /v1/collections — missing fields returns 400", async () => {
    const res = await fetch(`${BASE_URL}/v1/collections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
// END:GENERATED:SMOKE_LIVE
