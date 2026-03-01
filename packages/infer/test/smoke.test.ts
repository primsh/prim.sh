import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.PRIM_NETWORK = "eip155:8453";
  process.env.PRIM_PAY_TO = "0x0000000000000000000000000000000000000001";
});

import { mockX402Middleware } from "@primsh/x402-middleware/testing";

const createAgentStackMiddlewareSpy = vi.hoisted(() => vi.fn());

vi.mock("@primsh/x402-middleware", async (importOriginal) => {
  const original = await importOriginal<typeof import("@primsh/x402-middleware")>();
  const mocks = mockX402Middleware();
  createAgentStackMiddlewareSpy.mockImplementation(mocks.createAgentStackMiddleware);
  return {
    ...original,
    createAgentStackMiddleware: createAgentStackMiddlewareSpy,
    createWalletAllowlistChecker: vi.fn(mocks.createWalletAllowlistChecker),
  };
});

// Mock the service so smoke tests don't need a real API key
vi.mock("../src/service.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/service.ts")>();
  return {
    ...original,
    chat: vi.fn(),
    embed: vi.fn(),
    models: vi.fn(),
  };
});

import type { ChatResponse } from "../src/api.ts";
import app from "../src/index.ts";
import { chat } from "../src/service.ts";

const MOCK_RESPONSE: ChatResponse = {
  id: "gen-abc123",
  object: "chat.completion",
  created: 1700000000,
  model: "anthropic/claude-sonnet-4",
  choices: [
    {
      index: 0,
      message: { role: "assistant", content: "Hello! How can I help you?" },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
};

describe("infer.sh app", () => {
  beforeEach(() => {
    vi.mocked(chat).mockReset();
  });

  // Check 1: default export defined
  it("exposes a default export", () => {
    expect(app).toBeDefined();
  });

  // Check 2: GET / returns health response
  it("GET / returns { service: 'infer.sh', status: 'ok' }", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ service: "infer.sh", status: "ok" });
  });

  // Check 3: x402 middleware is wired with the correct paid routes and payTo address
  it("x402 middleware is registered with paid routes and payTo", () => {
    expect(createAgentStackMiddlewareSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        payTo: expect.any(String),
        freeRoutes: expect.arrayContaining(["GET /"]),
      }),
      expect.objectContaining({
        "POST /v1/chat": expect.any(String),
        "POST /v1/embed": expect.any(String),
        "GET /v1/models": expect.any(String),
      }),
    );
  });

  // Check 4: happy path — handler returns 200 with mocked service response
  it("POST /v1/chat with valid input returns 200", async () => {
    vi.mocked(chat).mockResolvedValueOnce({ ok: true, data: MOCK_RESPONSE });

    const res = await app.request("/v1/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
  });

  // Check 5: 400 on invalid input — service returns invalid_request → handler maps to 400
  it("POST /v1/chat with invalid input returns 400", async () => {
    vi.mocked(chat).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Invalid request",
    });

    const res = await app.request("/v1/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
