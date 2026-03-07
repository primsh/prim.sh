// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.CHAT_ENCRYPTION_KEY = "a".repeat(64);
  process.env.CHAT_SESSION_SECRET = "test-secret-for-signing-sessions";
  process.env.CHAT_DB_PATH = ":memory:";
  process.env.CHAT_RP_ID = "localhost";
  process.env.CHAT_RP_ORIGIN = "http://localhost:3020";
});

import { verifySessionToken } from "../src/auth.ts";
import { resetDb } from "../src/db.ts";

describe("auth", () => {
  beforeEach(() => {
    resetDb();
  });

  afterEach(() => {
    resetDb();
  });

  describe("session tokens", () => {
    it("verifySessionToken returns null for empty string", () => {
      expect(verifySessionToken("")).toBeNull();
    });

    it("verifySessionToken returns null for malformed token", () => {
      expect(verifySessionToken("not-a-token")).toBeNull();
    });

    it("verifySessionToken returns null for tampered signature", () => {
      expect(verifySessionToken("acct_123.abc123.0000000000000000")).toBeNull();
    });

    it("verifySessionToken returns null for expired token", () => {
      // Manually construct a token with old timestamp (> 7 days ago)
      const { createHmac } = require("node:crypto");
      const accountId = "acct_test123";
      const oldTimestamp = (Date.now() - 8 * 24 * 60 * 60 * 1000).toString(36);
      const payload = `${accountId}.${oldTimestamp}`;
      const signature = createHmac("sha256", "test-secret-for-signing-sessions")
        .update(payload)
        .digest("hex")
        .slice(0, 16);
      const token = `${payload}.${signature}`;
      expect(verifySessionToken(token)).toBeNull();
    });

    it("verifySessionToken accepts valid non-expired token", () => {
      const { createHmac } = require("node:crypto");
      const accountId = "acct_test456";
      const timestamp = Date.now().toString(36);
      const payload = `${accountId}.${timestamp}`;
      const signature = createHmac("sha256", "test-secret-for-signing-sessions")
        .update(payload)
        .digest("hex")
        .slice(0, 16);
      const token = `${payload}.${signature}`;
      expect(verifySessionToken(token)).toBe(accountId);
    });
  });

  describe("auth routes", () => {
    let app: typeof import("../src/index.ts").default;

    beforeEach(async () => {
      const mod = await import("../src/index.ts");
      app = mod.default;
    });

    it("POST /auth/register/options returns challenge and rpId", async () => {
      const res = await app.request("/auth/register/options", { method: "POST" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.options.challenge).toBeTruthy();
      expect(body.options.rp.id).toBe("localhost");
      expect(body.options.rp.name).toBe("prim");
      expect(body.challenge_id).toBeTruthy();
    });

    it("POST /auth/register/options returns user with random name", async () => {
      const res = await app.request("/auth/register/options", { method: "POST" });
      const body = await res.json();
      expect(body.options.user.name).toMatch(/^user_[a-f0-9]{8}$/);
    });

    it("POST /auth/register/verify rejects expired challenge", async () => {
      const res = await app.request("/auth/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: {}, challenge_id: "nonexistent" }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("challenge_expired");
    });

    it("POST /auth/login/options returns challenge", async () => {
      const res = await app.request("/auth/login/options", { method: "POST" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.options.challenge).toBeTruthy();
      expect(body.challenge_id).toBeTruthy();
    });

    it("POST /auth/login/verify rejects expired challenge", async () => {
      const res = await app.request("/auth/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: { id: "fake" }, challenge_id: "nonexistent" }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("challenge_expired");
    });
  });
});
