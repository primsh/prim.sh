// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Regenerate: pnpm gen:tests
/**
 * mem.sh — Tier 2 integration tests
 *
 * Real qdrant API calls. No x402, no SQLite.
 * Auto-skips when provider credentials are missing.
 *
 * Requires: QDRANT_URL, QDRANT_API_KEY
 * Docs: https://qdrant.tech/documentation/interfaces/
 */
import { describe, expect, it } from "vitest";

const REQUIRED_ENV = ["QDRANT_URL", "QDRANT_API_KEY"];
const MISSING_ENV = REQUIRED_ENV.filter((k) => !process.env[k]);

describe.skipIf(MISSING_ENV.length > 0)("mem.sh integration — qdrant", () => {
  if (MISSING_ENV.length > 0) return;

  it("health check — GET Qdrant", async () => {
    const res = await fetch(`${process.env.QDRANT_URL}/collections`, {
      method: "GET",
      headers: {
        "X-Api-Key": process.env.QDRANT_API_KEY!,
      },
    });
    expect(res.status).toBe(200);
  });
});
