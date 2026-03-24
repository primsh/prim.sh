// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Regenerate: pnpm gen:tests
/**
 * imagine.sh — Tier 2 integration tests
 *
 * Real google-gemini API calls. No x402, no SQLite.
 * Auto-skips when provider credentials are missing.
 *
 * Requires: GEMINI_API_KEY
 * Docs: https://ai.google.dev/gemini-api/docs/text-generation
 */
import { describe, expect, it } from "vitest";

const REQUIRED_ENV = ["GEMINI_API_KEY"];
const MISSING_ENV = REQUIRED_ENV.filter((k) => !process.env[k]);

describe.skipIf(MISSING_ENV.length > 0)("imagine.sh integration — google-gemini", () => {
  if (MISSING_ENV.length > 0) return;

  it("health check — GET Google Gemini", async () => {
    const base = "https://generativelanguage.googleapis.com/v1beta/models?key=";
    const endpoint = `${base}${process.env.GEMINI_API_KEY}`;
    const res = await fetch(endpoint, {
      method: "GET",
      headers: {
        "X-Api-Key": process.env.GEMINI_API_KEY!,
      },
    });
    expect(res.status).toBe(200);
  });
});
