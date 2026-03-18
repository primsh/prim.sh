// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Regenerate: pnpm gen:tests
/**
 * Live smoke test against create.prim.sh.
 *
 * Run:
 *   pnpm -C packages/create test:smoke
 *
 * All checks are non-destructive (health + error paths).
 * create.sh is a free service — no x402 gating.
 */

import { describe, expect, it } from "vitest";

const BASE_URL = process.env.CREATE_URL ?? "https://create.prim.sh";

describe("create.sh live smoke test", { timeout: 15_000 }, () => {
  it("0. GET / — health check returns service name", async () => {
    const res = await fetch(`${BASE_URL}/`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.service).toBe("create.sh");
    expect(body.status).toBe("ok");
  });

  it("1. POST /v1/scaffold — missing fields returns 400", async () => {
    const res = await fetch(`${BASE_URL}/v1/scaffold`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
