// SPDX-License-Identifier: Apache-2.0
/**
 * Live smoke test against feedback.prim.sh.
 *
 * Run:
 *   pnpm -C packages/feedback test:smoke
 *
 * All checks are non-destructive (health + error paths).
 * feedback.sh is a free service — no x402 gating.
 */

import { describe, expect, it } from "vitest";

const BASE_URL = process.env.FEEDBACK_URL ?? "https://feedback.prim.sh";

describe("feedback.sh live smoke test", { timeout: 15_000 }, () => {
  it("0. GET / — health check returns service name", async () => {
    const res = await fetch(`${BASE_URL}/`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.service).toBe("feedback.sh");
    expect(body.status).toBe("ok");
  });

  it("1. POST /v1/submit — missing fields returns 400", async () => {
    const res = await fetch(`${BASE_URL}/v1/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("2. POST /v1/submit — invalid type returns 400", async () => {
    const res = await fetch(`${BASE_URL}/v1/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        primitive: "wallet.sh",
        type: "complaint",
        body: "test",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("3. GET /v1/feed — missing internal key returns 401", async () => {
    const res = await fetch(`${BASE_URL}/v1/feed`);
    expect(res.status).toBe(401);
  });

  it("4. POST /v1/submit — valid feedback returns 200", async () => {
    const res = await fetch(`${BASE_URL}/v1/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        primitive: "gate.sh",
        type: "praise",
        body: "smoke-live test — ignore this entry",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    expect(body.status).toBe("received");
  });
});
