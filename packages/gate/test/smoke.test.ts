import { describe, expect, it, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.PRIM_NETWORK = "eip155:84532";
  process.env.GATE_FUND_KEY = "0x0000000000000000000000000000000000000000000000000000000000000001";
  process.env.GATE_CODES = "TEST-CODE-1,TEST-CODE-2";
  process.env.PRIM_INTERNAL_KEY = "test-internal-key";
});

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
  generateCode: vi.fn(() => "PRIM-a3f8c21b"),
  insertCodes: vi.fn((codes: string[]) => codes.length),
  listCodes: vi.fn(() => [
    { code: "PRIM-abc12345", created_at: "2026-01-01T00:00:00.000Z", label: null, wallet: null, redeemed_at: null },
    { code: "PRIM-used0001", created_at: "2026-01-01T00:00:00.000Z", label: null, wallet: "0x1234", redeemed_at: "2026-01-02T00:00:00.000Z" },
  ]),
  revokeCode: vi.fn(() => ({ ok: true })),
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
import { generateCode, insertCodes, listCodes, revokeCode, validateAndBurn } from "../src/db.ts";
import { fundWallet } from "../src/fund.ts";
import { addToAllowlist } from "@primsh/x402-middleware/allowlist-db";

const INTERNAL_HEADERS = { "x-internal-key": "test-internal-key", "Content-Type": "application/json" };

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

  // ─── Internal: code management ─────────────────────────────────────────────

  // Check 10: POST /internal/codes without auth → 401
  it("POST /internal/codes without auth returns 401", async () => {
    const res = await app.request("/internal/codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count: 1 }),
    });
    expect(res.status).toBe(401);
  });

  // Check 11: POST /internal/codes { count: 3 } → 200, 3 codes
  it("POST /internal/codes with count generates random codes", async () => {
    let callCount = 0;
    vi.mocked(generateCode).mockImplementation(() => {
      callCount++;
      return `PRIM-${callCount.toString().padStart(8, "0")}`;
    });
    vi.mocked(insertCodes).mockReturnValue(3);

    const res = await app.request("/internal/codes", {
      method: "POST",
      headers: INTERNAL_HEADERS,
      body: JSON.stringify({ count: 3 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.codes).toHaveLength(3);
    for (const code of body.codes) {
      expect(code).toMatch(/^PRIM-[a-f0-9]{8}$/);
    }
    expect(body.created).toBe(3);
  });

  // Check 12: POST /internal/codes { codes: ["PRIM-custom1"] } → 200
  it("POST /internal/codes with specific codes", async () => {
    vi.mocked(insertCodes).mockReturnValue(1);

    const res = await app.request("/internal/codes", {
      method: "POST",
      headers: INTERNAL_HEADERS,
      body: JSON.stringify({ codes: ["PRIM-custom1"] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.codes).toContain("PRIM-custom1");
    expect(body.created).toBe(1);
  });

  // Check 13: POST /internal/codes {} (no count or codes) → 400
  it("POST /internal/codes with empty body returns 400", async () => {
    const res = await app.request("/internal/codes", {
      method: "POST",
      headers: INTERNAL_HEADERS,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_request");
  });

  // Check 14: POST /internal/codes { count: 101 } → 400
  it("POST /internal/codes with count > 100 returns 400", async () => {
    const res = await app.request("/internal/codes", {
      method: "POST",
      headers: INTERNAL_HEADERS,
      body: JSON.stringify({ count: 101 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_request");
  });

  // Check 15: GET /internal/codes → 200
  it("GET /internal/codes returns list of codes", async () => {
    const res = await app.request("/internal/codes", {
      headers: { "x-internal-key": "test-internal-key" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.codes).toBeInstanceOf(Array);
    expect(body.total).toBe(2);
    expect(body.codes[0]).toMatchObject({
      code: expect.any(String),
      status: "available",
    });
  });

  // Check 16: GET /internal/codes?status=available → 200, filtered
  it("GET /internal/codes?status=available returns filtered list", async () => {
    vi.mocked(listCodes).mockReturnValue([
      { code: "PRIM-abc12345", created_at: "2026-01-01T00:00:00.000Z", label: null, wallet: null, redeemed_at: null },
    ]);

    const res = await app.request("/internal/codes?status=available", {
      headers: { "x-internal-key": "test-internal-key" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.codes).toHaveLength(1);
    expect(body.codes[0].status).toBe("available");
    expect(vi.mocked(listCodes)).toHaveBeenCalledWith("available");
  });

  // Check 17: DELETE /internal/codes/PRIM-exists → 200
  it("DELETE /internal/codes/:code revokes an available code", async () => {
    vi.mocked(revokeCode).mockReturnValue({ ok: true });

    const res = await app.request("/internal/codes/PRIM-exists", {
      method: "DELETE",
      headers: { "x-internal-key": "test-internal-key" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("revoked");
  });

  // Check 18: DELETE /internal/codes/PRIM-missing → 404
  it("DELETE /internal/codes/:code returns 404 for missing code", async () => {
    vi.mocked(revokeCode).mockReturnValue({ ok: false, reason: "not_found" });

    const res = await app.request("/internal/codes/PRIM-missing", {
      method: "DELETE",
      headers: { "x-internal-key": "test-internal-key" },
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("not_found");
  });

  // Check 19: DELETE /internal/codes/PRIM-used → 409
  it("DELETE /internal/codes/:code returns 409 for redeemed code", async () => {
    vi.mocked(revokeCode).mockReturnValue({ ok: false, reason: "already_redeemed" });

    const res = await app.request("/internal/codes/PRIM-used", {
      method: "DELETE",
      headers: { "x-internal-key": "test-internal-key" },
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("code_redeemed");
  });
});
