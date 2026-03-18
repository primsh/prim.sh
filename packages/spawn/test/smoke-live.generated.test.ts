// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Regenerate: pnpm gen:tests
/**
 * Live smoke test against spawn.prim.sh.
 *
 * Run:
 *   pnpm -C packages/spawn test:smoke
 *
 * All checks are non-destructive (health + error paths + 402 gating).
 */

import { describe, expect, it } from "vitest";

const BASE_URL = process.env.SPAWN_URL ?? "https://spawn.prim.sh";

describe("spawn.sh live smoke test", { timeout: 15_000 }, () => {
  it("0. GET / — health check returns service name", async () => {
    const res = await fetch(`${BASE_URL}/`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.service).toBe("spawn.sh");
    expect(body.status).toBe("ok");
  });

  it("1. POST /v1/servers — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/servers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("2. DELETE /v1/servers/:id — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/servers/:id`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("3. POST /v1/servers/:id/start — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/servers/:id/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("4. POST /v1/servers/:id/stop — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/servers/:id/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("5. POST /v1/servers/:id/reboot — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/servers/:id/reboot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("6. POST /v1/servers/:id/resize — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/servers/:id/resize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("7. POST /v1/servers/:id/rebuild — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/servers/:id/rebuild`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("8. POST /v1/ssh-keys — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/ssh-keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("9. DELETE /v1/ssh-keys/:id — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/ssh-keys/:id`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("10. POST /v1/servers — missing fields returns 400", async () => {
    const res = await fetch(`${BASE_URL}/v1/servers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
