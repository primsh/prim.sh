// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Regenerate: pnpm gen:tests
/**
 * track.sh — Tier 2 integration tests
 *
 * Real trackingmore API calls. No x402, no SQLite.
 * Auto-skips when provider credentials are missing.
 *
 * Requires: TRACKINGMORE_API_KEY
 * Docs: https://www.trackingmore.com/docs/trackingmore/d5o23goan87lo-getting-started
 */
import { describe, expect, it } from "vitest";

const REQUIRED_ENV = ["TRACKINGMORE_API_KEY"];
const MISSING_ENV = REQUIRED_ENV.filter((k) => !process.env[k]);

describe.skipIf(MISSING_ENV.length > 0)("track.sh integration — trackingmore", () => {
  if (MISSING_ENV.length > 0) return;

  it("health check — GET TrackingMore", async () => {
    const res = await fetch(`https://api.trackingmore.com/v4/couriers/all`, {
      method: "GET",
      headers: {
        "X-Api-Key": process.env.TRACKINGMORE_API_KEY!,
      },
    });
    expect(res.status).toBe(200);
  });
});
