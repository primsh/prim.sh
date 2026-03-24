// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Regenerate: pnpm gen:tests
/**
 * infer.sh — Tier 2 integration tests
 *
 * Real openrouter API calls. No x402, no SQLite.
 * Auto-skips when provider credentials are missing.
 *
 * Requires: OPENROUTER_API_KEY
 * Docs: https://openrouter.ai/docs/api-reference/overview
 */
import { describe, expect, it } from "vitest";

const REQUIRED_ENV = ["OPENROUTER_API_KEY"];
const MISSING_ENV = REQUIRED_ENV.filter((k) => !process.env[k]);

describe.skipIf(MISSING_ENV.length > 0)("infer.sh integration — openrouter", () => {
  if (MISSING_ENV.length > 0) return;

  it("health check — GET OpenRouter", async () => {
    const res = await fetch(`https://openrouter.ai/api/v1/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
    });
    expect(res.status).toBe(200);
  });
});
