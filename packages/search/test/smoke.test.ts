import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Context, Next } from "hono";

process.env.PRIM_NETWORK = "eip155:8453";
process.env.PRIM_PAY_TO = "0x0000000000000000000000000000000000000001";

// Bypass x402 so the handler is reachable in unit tests.
// Middleware wiring is verified via check 3 (spy on createAgentStackMiddleware).
vi.mock("@primsh/x402-middleware", async (importOriginal) => {
  const original = await importOriginal<typeof import("@primsh/x402-middleware")>();
  return {
    ...original,
    createAgentStackMiddleware: vi.fn(
      () => async (_c: Context, next: Next) => { await next(); },
    ),
    createWalletAllowlistChecker: vi.fn(() => () => Promise.resolve(true)),
  };
});

// Mock the service so smoke tests don't need a real API key
vi.mock("../src/service.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/service.ts")>();
  return {
    ...original,
    searchWeb: vi.fn(),
    searchNews: vi.fn(),
    extractUrls: vi.fn(),
  };
});

import app from "../src/index.ts";
import { searchWeb } from "../src/service.ts";
import { createAgentStackMiddleware } from "@primsh/x402-middleware";
import type { SearchResponse } from "../src/api.ts";

const MOCK_SEARCH_RESPONSE: SearchResponse = {
  query: "test query",
  results: [
    {
      title: "Test Result",
      url: "https://example.com",
      content: "Some snippet text",
      score: 0.95,
    },
  ],
  response_time: 123,
};

describe("search.sh app", () => {
  beforeEach(() => {
    vi.mocked(searchWeb).mockReset();
  });

  // Check 1: default export defined
  it("exposes a default export", () => {
    expect(app).toBeDefined();
  });

  // Check 2: GET / returns health response
  it("GET / returns { service: 'search.sh', status: 'ok' }", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ service: "search.sh", status: "ok" });
  });

  // Check 3: x402 middleware is wired with the correct paid routes and payTo address
  it("x402 middleware is registered with paid routes and payTo", () => {
    expect(vi.mocked(createAgentStackMiddleware)).toHaveBeenCalledWith(
      expect.objectContaining({
        payTo: expect.any(String),
        freeRoutes: expect.arrayContaining(["GET /"]),
      }),
      expect.objectContaining({
        "POST /v1/search": expect.any(String),
        "POST /v1/search/news": expect.any(String),
        "POST /v1/extract": expect.any(String),
      }),
    );
  });

  // Check 4: happy path — handler returns 200 with mocked service response
  it("POST /v1/search with valid query returns 200 with search results", async () => {
    vi.mocked(searchWeb).mockResolvedValueOnce({ ok: true, data: MOCK_SEARCH_RESPONSE });

    const res = await app.request("/v1/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "test query" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchResponse;
    expect(body.query).toBe("test query");
    expect(Array.isArray(body.results)).toBe(true);
    expect(typeof body.response_time).toBe("number");
  });

  // Check 5: 400 on missing query — service returns invalid_request → handler maps to 400
  it("POST /v1/search with missing query returns 400", async () => {
    vi.mocked(searchWeb).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "query is required",
    });

    const res = await app.request("/v1/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
