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
    metricsMiddleware: vi.fn(() => async (_c: Context, next: Next) => { await next(); }),
    metricsHandler: vi.fn(() => (_c: Context) => new Response()),
    requestIdMiddleware: vi.fn(() => async (_c: Context, next: Next) => { await next(); }),
  };
});

vi.mock("@primsh/x402-middleware/allowlist-db", () => ({
  createAllowlistChecker: vi.fn(() => () => Promise.resolve(true)),
  addToAllowlist: vi.fn(),
  removeFromAllowlist: vi.fn(),
  isAllowed: vi.fn(),
}));

// Mock the service so smoke tests don't need a real DB
vi.mock("../src/service.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/service.ts")>();
  return {
    ...original,
    registerWallet: vi.fn(),
  };
});

import app from "../src/index.ts";
import { registerWallet } from "../src/service.ts";
import { createAgentStackMiddleware } from "@primsh/x402-middleware";

describe("wallet.sh app", () => {
  beforeEach(() => {
    vi.mocked(registerWallet).mockReset();
  });

  // Check 1: default export defined
  it("exposes a default export", () => {
    expect(app).toBeDefined();
  });

  // Check 2: GET / returns health response
  it("GET / returns { service: 'wallet.sh', status: 'ok' }", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ service: "wallet.sh", status: "ok" });
  });

  // Check 3: x402 middleware is wired with the correct paid routes and payTo address
  it("x402 middleware is registered with paid routes and payTo", () => {
    expect(vi.mocked(createAgentStackMiddleware)).toHaveBeenCalledWith(
      expect.objectContaining({
        payTo: expect.any(String),
        freeRoutes: expect.arrayContaining(["GET /"]),
      }),
      expect.objectContaining({ "GET /v1/wallets": expect.any(String) }),
    );
  });

  // Check 4: happy path — POST /v1/wallets with valid data returns 201
  it("POST /v1/wallets with valid data returns 201", async () => {
    vi.mocked(registerWallet).mockResolvedValueOnce({
      ok: true,
      data: {
        address: "0x1234567890abcdef1234567890abcdef12346789",
        chain: "eip155:8453",
        label: null,
        registeredAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    });

    const res = await app.request("/v1/wallets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: "0x1234567890abcdef1234567890abcdef12346789",
        signature: "0xsig",
        timestamp: new Date().toISOString(),
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.address).toBe("0x1234567890abcdef1234567890abcdef12346789");
    expect(body.chain).toBe("eip155:8453");
  });

  // Check 5: 400 on missing required fields
  it("POST /v1/wallets with empty body returns 400", async () => {
    const res = await app.request("/v1/wallets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
