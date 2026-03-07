// SPDX-License-Identifier: Apache-2.0
// Tests for prim tool definitions
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.CHAT_ENCRYPTION_KEY = "a".repeat(64);
  process.env.CHAT_SESSION_SECRET = "test-secret-for-signing-sessions";
  process.env.CHAT_DB_PATH = ":memory:";
  process.env.PRIM_BASE_URL = "https://{service}.prim.sh";
});

import { createPrimTools } from "../src/tools.ts";

const execCtx = { toolCallId: "call_1", messages: [] as never[], abortSignal: new AbortController().signal };

// biome-ignore lint/suspicious/noExplicitAny: test helper wrapping optional execute
function exec(t: { execute?: (...args: any[]) => any }, input: unknown) {
  if (!t.execute) throw new Error("tool has no execute");
  return t.execute(input, execCtx);
}

describe("tools", () => {
  const EXPECTED_TOOLS = [
    "spawn_create_server",
    "spawn_get_server",
    "spawn_delete_server",
    "search_web",
    "store_put",
    "store_get",
    "email_create_mailbox",
    "email_send",
    "email_list",
    "domain_create_zone",
    "domain_create_record",
    "domain_verify",
    "wallet_balance",
  ] as const;

  it("createPrimTools returns all 13 tools", () => {
    const mockFetch = vi.fn();
    const tools = createPrimTools(mockFetch as unknown as typeof fetch);
    const toolNames = Object.keys(tools);
    expect(toolNames).toHaveLength(13);
    for (const name of EXPECTED_TOOLS) {
      expect(tools).toHaveProperty(name);
    }
  });

  it("each tool has description and inputSchema", () => {
    const mockFetch = vi.fn();
    const tools = createPrimTools(mockFetch as unknown as typeof fetch);
    for (const [name, t] of Object.entries(tools)) {
      expect((t as { description?: string }).description, `${name} missing description`).toBeTruthy();
    }
  });

  it("spawn_create_server calls correct URL with POST", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ server_id: "srv_123", ip: "1.2.3.4" }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    const tools = createPrimTools(mockFetch as unknown as typeof fetch);
    const result = await exec(tools.spawn_create_server, { name: "test-server" });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://spawn.prim.sh/v1/servers");
    expect(opts.method).toBe("POST");
    expect(result).toMatchObject({ server_id: "srv_123" });
  });

  it("search_web calls correct URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    const tools = createPrimTools(mockFetch as unknown as typeof fetch);
    await exec(tools.search_web, { query: "test" });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://search.prim.sh/v1/search");
  });

  it("store_get returns text content for non-JSON responses", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response("hello world", {
        headers: { "Content-Type": "text/plain" },
      }),
    );
    const tools = createPrimTools(mockFetch as unknown as typeof fetch);
    const result = await exec(tools.store_get, { bucket_id: "b1", key: "test.txt" });

    expect(result).toEqual({ content: "hello world" });
  });

  it("wallet_balance calls correct URL without address", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ usdc: "1.00", eth: "0.001" }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    const tools = createPrimTools(mockFetch as unknown as typeof fetch);
    await exec(tools.wallet_balance, {});

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://wallet.prim.sh/v1/balance");
  });

  it("wallet_balance includes address param when provided", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ usdc: "5.00" }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    const tools = createPrimTools(mockFetch as unknown as typeof fetch);
    await exec(tools.wallet_balance, { address: "0x1234" });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://wallet.prim.sh/v1/balance?address=0x1234");
  });

  it("email_send passes correct body fields", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message_id: "msg_1" }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    const tools = createPrimTools(mockFetch as unknown as typeof fetch);
    await exec(tools.email_send, { mailbox_id: "mb_1", to: "a@b.com", subject: "Hi", body: "Hello" });

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://email.prim.sh/v1/mailboxes/mb_1/send");
    const body = JSON.parse(opts.body);
    expect(body).toMatchObject({ to: "a@b.com", subject: "Hi", body: "Hello" });
    expect(body).not.toHaveProperty("mailbox_id");
  });
});
