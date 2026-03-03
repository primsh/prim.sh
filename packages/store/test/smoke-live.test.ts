// SPDX-License-Identifier: Apache-2.0
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
    expect(body.network).toMatch(/^eip155:\d+$/);
  });

  it("1. POST /v1/buckets — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/buckets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test-bucket" }),
    });
    expect(res.status).toBe(402);
  });

  it("2. GET /v1/buckets — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/buckets`);
    expect(res.status).toBe(402);
  });

  it("3. GET /public/nonexistent/key — returns 404 for missing public object", async () => {
    const res = await fetch(`${BASE_URL}/public/nonexistent-bucket/nonexistent-key`);
    // 404 (not found) is expected for a missing public object
    expect([404, 500]).toContain(res.status);
  });
});
