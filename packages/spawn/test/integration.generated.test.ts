// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Regenerate: pnpm gen:tests
/**
 * spawn.sh — Tier 2 integration tests
 *
 * Real digitalocean API calls. No x402, no SQLite.
 * Auto-skips when provider credentials are missing.
 *
 * Requires: DO_API_TOKEN
 * Docs: https://docs.digitalocean.com/reference/api/api-reference/
 */
import { describe, expect, it } from "vitest";

const REQUIRED_ENV = ["DO_API_TOKEN"];
const MISSING_ENV = REQUIRED_ENV.filter((k) => !process.env[k]);

describe.skipIf(MISSING_ENV.length > 0)("spawn.sh integration — digitalocean", () => {
  if (MISSING_ENV.length > 0) return;

  it("health check — GET DigitalOcean", async () => {
    const res = await fetch(`https://api.digitalocean.com/v2/account`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.DO_API_TOKEN}`,
      },
    });
    expect(res.status).toBe(200);
  });
});
