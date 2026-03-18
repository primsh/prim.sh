// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Regenerate: pnpm gen:tests
/**
 * Live smoke test against gate.prim.sh.
 *
 * Run:
 *   pnpm -C packages/gate test:smoke
 *
 * All checks are non-destructive (health + error paths).
 * gate.sh is a free service — no x402 gating.
 */

import { describe, expect, it } from "vitest";

const BASE_URL = process.env.GATE_URL ?? "https://gate.prim.sh";

describe("gate.sh live smoke test", { timeout: 15_000 }, () => {
  it("0. GET / — health check returns service name", async () => {
    const res = await fetch(`${BASE_URL}/`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.service).toBe("gate.sh");
    expect(body.status).toBe("ok");
  });

  it("1. POST /v1/redeem — missing fields returns 400", async () => {
    const res = await fetch(`${BASE_URL}/v1/redeem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
