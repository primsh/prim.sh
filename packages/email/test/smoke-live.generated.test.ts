// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Regenerate: pnpm gen:tests
/**
 * Live smoke test against email.prim.sh.
 *
 * Run:
 *   pnpm -C packages/email test:smoke
 *
 * All checks are non-destructive (health + error paths + 402 gating).
 */

import { describe, expect, it } from "vitest";

const BASE_URL = process.env.EMAIL_URL ?? "https://email.prim.sh";

describe("email.sh live smoke test", { timeout: 15_000 }, () => {
  it("0. GET / — health check returns service name", async () => {
    const res = await fetch(`${BASE_URL}/`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.service).toBe("email.sh");
    expect(body.status).toBe("ok");
  });

  it("1. POST /v1/mailboxes — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/mailboxes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("2. DELETE /v1/mailboxes/:id — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/mailboxes/:id`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("3. POST /v1/mailboxes/:id/renew — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/mailboxes/:id/renew`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("4. POST /v1/mailboxes/:id/send — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/mailboxes/:id/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("5. POST /v1/mailboxes/:id/webhooks — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/mailboxes/:id/webhooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("6. DELETE /v1/mailboxes/:id/webhooks/:whId — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/mailboxes/:id/webhooks/:whId`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("7. POST /v1/domains — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/domains`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("8. POST /v1/domains/:id/verify — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/domains/:id/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("9. DELETE /v1/domains/:id — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/domains/:id`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("10. POST /v1/mailboxes — missing fields returns 400", async () => {
    const res = await fetch(`${BASE_URL}/v1/mailboxes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
