// SPDX-License-Identifier: Apache-2.0
// Integration tests: authenticated route behavior
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.CHAT_ENCRYPTION_KEY = "a".repeat(64);
  process.env.CHAT_SESSION_SECRET = "test-secret-for-signing-sessions";
  process.env.CHAT_DB_PATH = ":memory:";
  process.env.CHAT_RP_ID = "localhost";
  process.env.CHAT_RP_ORIGIN = "http://localhost:3020";
});

import app from "../src/index.ts";
import { createAccount } from "../src/accounts.ts";
import { createConversation, addMessage } from "../src/conversations.ts";
import { resetDb } from "../src/db.ts";

function makeSessionCookie(accountId: string): string {
  const timestamp = Date.now().toString(36);
  const payload = `${accountId}.${timestamp}`;
  const signature = createHmac("sha256", "test-secret-for-signing-sessions")
    .update(payload)
    .digest("hex")
    .slice(0, 16);
  return `${payload}.${signature}`;
}

describe("authenticated routes", () => {
  let accountId: string;
  let sessionCookie: string;

  beforeEach(() => {
    resetDb();
    const result = createAccount("cred_route_test", new Uint8Array([1, 2, 3]));
    if (!result.ok) throw new Error("setup failed");
    accountId = result.data.id;
    sessionCookie = makeSessionCookie(accountId);
  });

  afterEach(() => {
    resetDb();
  });

  describe("GET /api/conversations", () => {
    it("returns empty list for new account", async () => {
      const res = await app.request("/api/conversations", {
        headers: { Cookie: `session=${sessionCookie}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.conversations).toEqual([]);
    });

    it("returns conversations for account", async () => {
      createConversation(accountId, "Chat 1");
      createConversation(accountId, "Chat 2");

      const res = await app.request("/api/conversations", {
        headers: { Cookie: `session=${sessionCookie}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.conversations).toHaveLength(2);
    });

    it("returns 401 without session", async () => {
      const res = await app.request("/api/conversations");
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/conversations", () => {
    it("creates a conversation with title", async () => {
      const res = await app.request("/api/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session=${sessionCookie}`,
        },
        body: JSON.stringify({ title: "My chat" }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.conversation.id).toMatch(/^conv_/);
      expect(body.conversation.title).toBe("My chat");
    });

    it("creates a conversation without title", async () => {
      const res = await app.request("/api/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session=${sessionCookie}`,
        },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.conversation.title).toBe("New conversation");
    });
  });

  describe("GET /api/conversations/:id/messages", () => {
    it("returns messages for a conversation", async () => {
      const conv = createConversation(accountId, "Test");
      if (!conv.ok) throw new Error("setup failed");
      addMessage(conv.data.id, "user", "Hello");
      addMessage(conv.data.id, "assistant", "Hi there");

      const res = await app.request(`/api/conversations/${conv.data.id}/messages`, {
        headers: { Cookie: `session=${sessionCookie}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0].role).toBe("user");
      expect(body.messages[0].content).toBe("Hello");
      expect(body.messages[1].role).toBe("assistant");
    });

    it("returns empty array for conversation with no messages", async () => {
      const conv = createConversation(accountId, "Empty");
      if (!conv.ok) throw new Error("setup failed");

      const res = await app.request(`/api/conversations/${conv.data.id}/messages`, {
        headers: { Cookie: `session=${sessionCookie}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.messages).toEqual([]);
    });
  });

  describe("GET /api/balance", () => {
    it("returns wallet address and balance", async () => {
      const res = await app.request("/api/balance", {
        headers: { Cookie: `session=${sessionCookie}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.wallet_address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(body.balance_usdc).toBe("0.00");
    });

    it("returns 401 without session", async () => {
      const res = await app.request("/api/balance");
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/chat", () => {
    it("returns 401 without session", async () => {
      const res = await app.request("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "hello" }),
      });
      expect(res.status).toBe(401);
    });

    it("returns 400 without message", async () => {
      const res = await app.request("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session=${sessionCookie}`,
        },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("invalid_request");
    });

    it("returns 400 with non-string message", async () => {
      const res = await app.request("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session=${sessionCookie}`,
        },
        body: JSON.stringify({ message: 123 }),
      });
      expect(res.status).toBe(400);
    });
  });
});
