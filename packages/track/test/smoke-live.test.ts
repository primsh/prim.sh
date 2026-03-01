// SPDX-License-Identifier: Apache-2.0
/**
 * TR-2 live smoke test — runs against real TrackingMore API.
 * Requires TRACKINGMORE_API_KEY env var.
 *
 * Usage:
 *   TRACKINGMORE_API_KEY=xxx pnpm --filter @primsh/track test:smoke
 *
 * Note: TrackingMore charges 1 credit per POST /create call.
 * Use a real tracking number via SMOKE_TRACKING_NUMBER + SMOKE_CARRIER,
 * or rely on the default USPS test number (will return "pending" if not in system).
 */

import { describe, expect, it } from "vitest";
import { TrackingMoreClient } from "../src/trackingmore.ts";

const apiKey = process.env.TRACKINGMORE_API_KEY;
const client = apiKey ? new TrackingMoreClient(apiKey) : null;

const TEST_CARRIER = process.env.SMOKE_CARRIER ?? "usps";
const TEST_TRACKING_NUMBER =
  process.env.SMOKE_TRACKING_NUMBER ?? "9400111899223397910435";

describe.skipIf(!apiKey)("track.sh live smoke test (TrackingMore)", () => {
  const c = client as TrackingMoreClient;
  it("returns a valid response shape for a tracking number", async () => {
    const result = await c.track(TEST_TRACKING_NUMBER, TEST_CARRIER);

    expect(result.tracking_number).toBe(TEST_TRACKING_NUMBER);
    expect(result.carrier).toBe(TEST_CARRIER);
    expect(typeof result.status).toBe("string");
    expect(result.status.length).toBeGreaterThan(0);
    expect(typeof result.status_detail).toBe("string");
    expect(Array.isArray(result.events)).toBe(true);

    console.log(`  carrier: ${result.carrier}`);
    console.log(`  status: ${result.status}`);
    console.log(`  status_detail: ${result.status_detail || "(none)"}`);
    console.log(`  eta: ${result.eta ?? "none"}`);
    console.log(`  events: ${result.events.length}`);
    if (result.events.length > 0) {
      console.log(`  events[0]: ${result.events[0]?.status} — ${result.events[0]?.status_detail}`);
    }
  });

  it("returns PRE_TRANSIT for an unknown tracking number (TrackingMore queues it as pending)", async () => {
    // TrackingMore accepts any number at creation time and returns delivery_status: "pending".
    // It only transitions to "notfound" after a carrier lookup attempt, which may take minutes.
    const result = await c.track(`PRIM_SMOKE_UNKNOWN_XYZ_${Date.now()}`, "usps");
    expect(result.status).toBe("PRE_TRANSIT");
  });
});
