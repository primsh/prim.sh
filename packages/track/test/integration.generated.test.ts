// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Regenerate: pnpm gen:tests
/**
 * track.sh — Tier 2 integration tests
 *
 * Real trackingmore API calls. No x402, no SQLite.
 * Auto-skips when provider credentials are missing.
 *
 * Requires: TRACKINGMORE_API_KEY, WALLET_INTERNAL_URL
 */
import { describe, expect, it } from "vitest";

const REQUIRED_ENV = ["TRACKINGMORE_API_KEY", "WALLET_INTERNAL_URL"];
const MISSING_ENV = REQUIRED_ENV.filter((k) => !process.env[k]);

describe.skipIf(MISSING_ENV.length > 0)("track.sh integration — trackingmore REST", () => {
  if (MISSING_ENV.length > 0) return;

  const apiKey = process.env.TRACKINGMORE_API_KEY!;

  it("provider API key is valid (non-empty)", () => {
    expect(apiKey.length).toBeGreaterThan(0);
  });

  // TODO: add provider-specific integration tests
  // Provider: trackingmore
  // Docs: https://www.trackingmore.com/
  // Env: TRACKINGMORE_API_KEY
});
