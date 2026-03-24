// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Regenerate: pnpm gen:tests
/**
 * domain.sh — Tier 2 integration tests
 *
 * Real cloudflare API calls. No x402, no SQLite.
 * Auto-skips when provider credentials are missing.
 *
 * Requires: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID
 * Docs: https://developers.cloudflare.com/api/operations/zones-get
 */
import { describe, expect, it } from "vitest";

const REQUIRED_ENV = ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ZONE_ID"];
const MISSING_ENV = REQUIRED_ENV.filter((k) => !process.env[k]);

describe.skipIf(MISSING_ENV.length > 0)("domain.sh integration — cloudflare", () => {
  if (MISSING_ENV.length > 0) return;

  it("health check — GET Cloudflare", async () => {
    const endpoint = `https://api.cloudflare.com/client/v4/zones/${process.env.CLOUDFLARE_ZONE_ID}`;
    const res = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
      },
    });
    expect(res.status).toBe(200);
  });
});
