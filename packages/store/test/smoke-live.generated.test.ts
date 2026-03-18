// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Regenerate: pnpm gen:tests
/**
 * Live smoke test against store.prim.sh.
 *
 * Run:
 *   pnpm -C packages/store test:smoke
 *
 * All checks are non-destructive (health + error paths + 402 gating).
 */

import { describe, expect, it } from "vitest";

const BASE_URL = process.env.STORE_URL ?? "https://store.prim.sh";

describe("store.sh live smoke test", { timeout: 15_000 }, () => {
  it("0. GET / — health check returns service name", async () => {
    const res = await fetch(`${BASE_URL}/`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.service).toBe("store.sh");
    expect(body.status).toBe("ok");
  });

  it("1. POST /v1/buckets — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/buckets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("2. DELETE /v1/buckets/:id — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/buckets/:id`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("3. PUT /v1/buckets/:id/objects/:key — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/buckets/:id/objects/:key`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("4. DELETE /v1/buckets/:id/objects/:key — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/buckets/:id/objects/:key`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("5. PUT /v1/buckets/:id/quota — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/buckets/:id/quota`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("6. POST /v1/buckets/:id/quota/reconcile — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/buckets/:id/quota/reconcile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("7. POST /v1/buckets/:id/presign — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/buckets/:id/presign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("8. POST /v1/buckets — missing fields returns 400", async () => {
    const res = await fetch(`${BASE_URL}/v1/buckets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
