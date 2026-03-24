// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Regenerate: pnpm gen:tests
/**
 * email.sh — Tier 2 integration tests
 *
 * Real stalwart API calls. No x402, no SQLite.
 * Auto-skips when provider credentials are missing.
 *
 * Requires: STALWART_URL, STALWART_API_KEY
 * Docs: https://stalw.art/docs/api/management/overview
 */
import { describe, expect, it } from "vitest";

const REQUIRED_ENV = ["STALWART_URL", "STALWART_API_KEY"];
const MISSING_ENV = REQUIRED_ENV.filter((k) => !process.env[k]);

describe.skipIf(MISSING_ENV.length > 0)("email.sh integration — stalwart", () => {
  if (MISSING_ENV.length > 0) return;

  it("health check — GET Stalwart Mail Server", async () => {
    const res = await fetch(`${process.env.STALWART_URL}/api/healthz`, {
      method: "GET",
    });
    expect(res.status).toBe(200);
  });
});
