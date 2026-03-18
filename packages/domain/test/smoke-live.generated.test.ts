// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Regenerate: pnpm gen:tests
/**
 * Live smoke test against domain.prim.sh.
 *
 * Run:
 *   pnpm -C packages/domain test:smoke
 *
 * All checks are non-destructive (health + error paths + 402 gating).
 */

import { describe, expect, it } from "vitest";

const BASE_URL = process.env.DOMAIN_URL ?? "https://domain.prim.sh";

describe("domain.sh live smoke test", { timeout: 15_000 }, () => {
  it("0. GET / — health check returns service name", async () => {
    const res = await fetch(`${BASE_URL}/`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.service).toBe("domain.sh");
    expect(body.status).toBe("ok");
  });

  it("1. POST /v1/domains/quote — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/domains/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("2. POST /v1/zones — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/zones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("3. DELETE /v1/zones/:id — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/zones/:id`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("4. PUT /v1/zones/:zone_id/activate — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/zones/:zone_id/activate`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("5. POST /v1/zones/:zone_id/mail-setup — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/zones/:zone_id/mail-setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("6. POST /v1/zones/:zone_id/records/batch — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/zones/:zone_id/records/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("7. POST /v1/zones/:zone_id/records — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/zones/:zone_id/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("8. PUT /v1/zones/:zone_id/records/:id — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/zones/:zone_id/records/:id`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("9. DELETE /v1/zones/:zone_id/records/:id — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/zones/:zone_id/records/:id`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("10. POST /v1/domains/quote — missing fields returns 400", async () => {
    const res = await fetch(`${BASE_URL}/v1/domains/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
