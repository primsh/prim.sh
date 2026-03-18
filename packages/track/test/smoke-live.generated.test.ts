// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Regenerate: pnpm gen:tests
/**
 * Live smoke test against track.prim.sh.
 *
 * Run:
 *   pnpm -C packages/track test:smoke
 *
 * All checks are non-destructive (health + error paths + 402 gating).
 */

import { describe, expect, it } from "vitest";

const BASE_URL = process.env.TRACK_URL ?? "https://track.prim.sh";

describe("track.sh live smoke test", { timeout: 15_000 }, () => {
  it("0. GET / — health check returns service name", async () => {
    const res = await fetch(`${BASE_URL}/`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.service).toBe("track.sh");
    expect(body.status).toBe("ok");
  });

  it("1. POST /v1/track — requires x402 payment", async () => {
    const res = await fetch(`${BASE_URL}/v1/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
  });

  it("2. POST /v1/track — missing fields returns 400", async () => {
    const res = await fetch(`${BASE_URL}/v1/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
