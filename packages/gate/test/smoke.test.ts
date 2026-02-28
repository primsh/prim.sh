import { describe, expect, it, vi, beforeEach } from "vitest";

process.env.PRIM_NETWORK = "eip155:84532";
process.env.GATE_FUND_KEY = "0x0000000000000000000000000000000000000000000000000000000000000001";
process.env.GATE_CODES = "TEST-CODE-1,TEST-CODE-2";
process.env.PRIM_INTERNAL_KEY = "test-internal-key";

// Mock x402-middleware — gate uses freeService so no x402, but createPrimApp still imports it.
// Simple factory (no importOriginal) to avoid pulling in @x402/* deps that vitest can't resolve.
vi.mock("@primsh/x402-middleware", () => ({
  createAgentStackMiddleware: vi.fn(
    () =>
      async (
        _c: import("hono").Context,
        next: import("hono").Next,
      ) => {
        await next();
      },
  ),
  createWalletAllowlistChecker: vi.fn(() => () => Promise.resolve(true)),
  createLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  getNetworkConfig: vi.fn(() => ({
    chainId: 84532,
    chain: { id: 84532, name: "Base Sepolia" },
    facilitatorUrl: "https://facilitator.example.com",
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  })),
}));

// Mock create-prim-app subpath — gate imports it directly.
// Use vi.hoisted to make Hono available inside the hoisted mock factory.
const { hoistedHono } = vi.hoisted(() => {
  // biome-ignore lint/suspicious/noExplicitAny: vitest hoisted mock needs dynamic require
  const { Hono } = require("hono") as any;
  return { hoistedHono: Hono };
});
vi.mock("@primsh/x402-middleware/create-prim-app", () => ({
  createPrimApp: vi.fn((_config: unknown) => new hoistedHono()),
}));

// Mock allowlist-db so no real SQLite files
vi.mock("@primsh/x402-middleware/allowlist-db", () => ({
  addToAllowlist: vi.fn(),
  removeFromAllowlist: vi.fn(),
  isAllowed: vi.fn(() => true),
  createAllowlistChecker: vi.fn(() => () => Promise.resolve(true)),
  resetAllowlistDb: vi.fn(),
}));

// Mock the DB module
vi.mock("../src/db.ts", () => ({
  seedCodes: vi.fn(() => 2),
  validateAndBurn: vi.fn(() => ({ ok: true })),
  resetDb: vi.fn(),
}));

// Mock the fund module
vi.mock("../src/fund.ts", () => ({
  fundWallet: vi.fn(() =>
    Promise.resolve({
      usdc_tx: "0xusdc123",
      eth_tx: "0xeth456",
      usdc_amount: "5.00",
      eth_amount: "0.001",
    }),
  ),
}));

import app from "../src/index.ts";
import { validateAndBurn } from "../src/db.ts";
import { fundWallet } from "../src/fund.ts";
import { addToAllowlist } from "@primsh/x402-middleware/allowlist-db";

describe("gate.sh app", () => {
  beforeEach(() => {
    vi.mocked(validateAndBurn).mockReset();
    vi.mocked(validateAndBurn).mockReturnValue({ ok: true });
    vi.mocked(fundWallet).mockReset();
    vi.mocked(fundWallet).mockResolvedValue({
      usdc_tx: "0xusdc123",
      eth_tx: "0xeth456",
      usdc_amount: "5.00",
      eth_amount: "0.001",
    });
  });

  // Check 1: default export defined
  it("exposes a default export", () => {
    expect(app).toBeDefined();
  });

  // Check 2: GET / returns health response
  it("GET / returns { service: 'gate.sh', status: 'ok' }", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ service: "gate.sh", status: "ok" });
  });

  // Check 3: freeService — no x402 middleware on paid routes
  it("is a free service (freeService: true)", async () => {
    // Verify the redeem endpoint is reachable without any payment
    vi.mocked(validateAndBurn).mockReturnValue({ ok: true });
    const res = await app.request("/v1/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "TEST-CODE-1", wallet: "0x09D896446fBd3299Fa8d7898001b086E56f642B5" }),
    });
    expect(res.status).toBe(200);
  });

  // Check 4: happy path — valid code + wallet → 200 + funded
  it("POST /v1/redeem with valid code returns 200 with funding details", async () => {
    const res = await app.request("/v1/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "TEST-CODE-1", wallet: "0x09D896446fBd3299Fa8d7898001b086E56f642B5" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      status: "redeemed",
      wallet: expect.any(String),
      funded: {
        usdc: "5.00",
        eth: "0.001",
        usdc_tx: "0xusdc123",
        eth_tx: "0xeth456",
      },
    });
    expect(vi.mocked(addToAllowlist)).toHaveBeenCalled();
    expect(vi.mocked(fundWallet)).toHaveBeenCalled();
  });

  // Check 5: missing wallet → 400
  it("POST /v1/redeem with missing wallet returns 400", async () => {
    const res = await app.request("/v1/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "TEST-CODE-1" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_request");
  });

  // Check 6: missing code → 400
  it("POST /v1/redeem with missing code returns 400", async () => {
    const res = await app.request("/v1/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet: "0x09D896446fBd3299Fa8d7898001b086E56f642B5" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_request");
  });

  // Check 7: invalid code → 400
  it("POST /v1/redeem with invalid code returns 400", async () => {
    vi.mocked(validateAndBurn).mockReturnValue({ ok: false, reason: "invalid_code" });
    const res = await app.request("/v1/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "BAD-CODE", wallet: "0x09D896446fBd3299Fa8d7898001b086E56f642B5" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_code");
  });

  // Check 8: already-redeemed code → 409
  it("POST /v1/redeem with used code returns 409", async () => {
    vi.mocked(validateAndBurn).mockReturnValue({ ok: false, reason: "code_redeemed" });
    const res = await app.request("/v1/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "TEST-CODE-1", wallet: "0x09D896446fBd3299Fa8d7898001b086E56f642B5" }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("code_redeemed");
  });

  // Check 9: funding failure → 502 (wallet is still allowlisted)
  it("POST /v1/redeem with fund failure returns 502", async () => {
    vi.mocked(fundWallet).mockRejectedValue(new Error("RPC timeout"));
    const res = await app.request("/v1/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "TEST-CODE-1", wallet: "0x09D896446fBd3299Fa8d7898001b086E56f642B5" }),
    });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe("fund_error");
  });
});
