// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.CHAT_ENCRYPTION_KEY = "a".repeat(64);
  process.env.CHAT_SESSION_SECRET = "test-secret-for-signing-sessions";
  process.env.CHAT_DB_PATH = ":memory:";
});

import { createAccount } from "../src/accounts.ts";
import {
  addMessage,
  createConversation,
  getConversations,
  getMessages,
} from "../src/conversations.ts";
import { resetDb } from "../src/db.ts";

describe("conversations", () => {
  let accountId: string;

  beforeEach(() => {
    resetDb();
    const result = createAccount("cred_conv_test", new Uint8Array([1]));
    if (!result.ok) throw new Error("setup failed");
    accountId = result.data.id;
  });

  afterEach(() => {
    resetDb();
  });

  it("createConversation returns conversation with id", () => {
    const result = createConversation(accountId, "Test chat");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.id).toMatch(/^conv_/);
    expect(result.data.account_id).toBe(accountId);
    expect(result.data.title).toBe("Test chat");
  });

  it("createConversation uses default title when none provided", () => {
    const result = createConversation(accountId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.title).toBe("New conversation");
  });

  it("getConversations returns all conversations for account", () => {
    createConversation(accountId, "First");
    createConversation(accountId, "Second");
    const result = getConversations(accountId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(2);
  });

  it("getConversations returns empty array for account with no conversations", () => {
    const result = getConversations(accountId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(0);
  });

  it("getConversations does not return other accounts conversations", () => {
    createConversation(accountId, "Mine");
    const other = createAccount("cred_other", new Uint8Array([2]));
    if (!other.ok) throw new Error("setup failed");
    createConversation(other.data.id, "Theirs");

    const result = getConversations(accountId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0].title).toBe("Mine");
  });

  it("addMessage stores a message", () => {
    const conv = createConversation(accountId, "Chat");
    if (!conv.ok) throw new Error("setup failed");

    const result = addMessage(conv.data.id, "user", "Hello");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.id).toMatch(/^msg_/);
    expect(result.data.role).toBe("user");
    expect(result.data.content).toBe("Hello");
  });

  it("addMessage stores tool calls as JSON", () => {
    const conv = createConversation(accountId, "Chat");
    if (!conv.ok) throw new Error("setup failed");

    const toolCalls = [{ name: "search_web", args: { query: "test" } }];
    const result = addMessage(conv.data.id, "assistant", "Searching...", toolCalls);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.tool_calls).toEqual(toolCalls);
  });

  it("getMessages returns messages in chronological order", () => {
    const conv = createConversation(accountId, "Chat");
    if (!conv.ok) throw new Error("setup failed");

    addMessage(conv.data.id, "user", "First");
    addMessage(conv.data.id, "assistant", "Second");
    addMessage(conv.data.id, "user", "Third");

    const result = getMessages(conv.data.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(3);
    expect(result.data[0].content).toBe("First");
    expect(result.data[1].content).toBe("Second");
    expect(result.data[2].content).toBe("Third");
  });

  it("getMessages returns empty array for conversation with no messages", () => {
    const conv = createConversation(accountId, "Empty");
    if (!conv.ok) throw new Error("setup failed");

    const result = getMessages(conv.data.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(0);
  });

  it("addMessage updates conversation updated_at", async () => {
    const conv = createConversation(accountId, "Chat");
    if (!conv.ok) throw new Error("setup failed");
    const originalUpdatedAt = conv.data.updated_at;

    // Wait to ensure timestamp differs (ISO 8601 has ms precision)
    await new Promise((r) => setTimeout(r, 5));
    addMessage(conv.data.id, "user", "Hello");

    const convs = getConversations(accountId);
    if (!convs.ok) throw new Error("lookup failed");
    expect(convs.data[0].updated_at).not.toBe(originalUpdatedAt);
  });
});
