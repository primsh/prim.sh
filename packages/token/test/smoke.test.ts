import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Context, Next } from "hono";

process.env.PRIM_NETWORK = "eip155:8453";
process.env.PRIM_PAY_TO = "0x0000000000000000000000000000000000000001";

// Stub bun:sqlite so db.ts doesn't fail in vitest (Node runtime)
vi.mock("bun:sqlite", () => {
  class MockDatabase {
    run() {}
    query() { return { get: () => null, all: () => [], run: () => {} }; }
  }
  return { Database: MockDatabase };
});

// Bypass x402 middleware for unit tests.
// Middleware wiring is verified via check 3 (spy on createAgentStackMiddleware).
vi.mock("@primsh/x402-middleware", async (importOriginal) => {
  const original = await importOriginal<typeof import("@primsh/x402-middleware")>();
  return {
    ...original,
    createAgentStackMiddleware: vi.fn(
      () => async (c: Context, next: Next) => {
        c.set("walletAddress" as never, "0x0000000000000000000000000000000000000001");
        await next();
      },
    ),
    createWalletAllowlistChecker: vi.fn(() => () => Promise.resolve(true)),
  };
});

// Mock the service so smoke tests don't need a real API key
vi.mock("../src/service.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/service.ts")>();
  return {
    ...original,
    deployToken: vi.fn(),
    listTokens: vi.fn(),
    getToken: vi.fn(),
    mintTokens: vi.fn(),
    getSupply: vi.fn(),
    createPool: vi.fn(),
    getPool: vi.fn(),
    getLiquidityParams: vi.fn(),
  };
});

import app from "../src/index.ts";
import { deployToken } from "../src/service.ts";
import { createAgentStackMiddleware } from "@primsh/x402-middleware";
// BEGIN:GENERATED:SMOKE
describe("token.sh app", () => {
  beforeEach(() => {
    vi.mocked(deployToken).mockReset();
  });

  // Check 1: default export defined
  it("exposes a default export", () => {
    expect(app).toBeDefined();
  });

  // Check 2: GET / returns health response
  it("GET / returns { service: 'token.sh', status: 'ok' }", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ service: "token.sh", status: "ok" });
  });

  // Check 3: x402 middleware is wired with the correct paid routes and payTo address
  it("x402 middleware is registered with paid routes and payTo", () => {
    expect(vi.mocked(createAgentStackMiddleware)).toHaveBeenCalledWith(
      expect.objectContaining({
        payTo: expect.any(String),
        freeRoutes: expect.arrayContaining(["GET /"]),
      }),
      expect.objectContaining({ "POST /v1/tokens": expect.any(String) }),
    );
  });

  // Check 4: happy path — handler returns 201 with mocked service response
  it("POST /v1/tokens returns 201 with valid response", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(deployToken).mockResolvedValueOnce({ ok: true, data: {} as any });

    const res = await app.request("/v1/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test", symbol: "TST", initialSupply: "test" }),
    });

    expect(res.status).toBe(201);
  });

  // Check 5: 400 on missing/invalid input — service returns invalid_request → handler maps to 400
  it("POST /v1/tokens with missing/invalid input returns 400", async () => {
    vi.mocked(deployToken).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Missing required fields",
    });

    const res = await app.request("/v1/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });
});
// END:GENERATED:SMOKE
