// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.REVENUE_WALLET = "0x0000000000000000000000000000000000000001";
  process.env.PRIM_NETWORK = "eip155:8453";
  process.env.PRIM_INTERNAL_KEY = "test-internal-key";
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

vi.mock("@primsh/x402-middleware/allowlist-db", () => ({
  addToAllowlist: vi.fn(),
  removeFromAllowlist: vi.fn(),
  isAllowed: vi.fn(() => true),
  createAllowlistChecker: vi.fn(() => () => Promise.resolve(true)),
}));

// Mock the balance module — returns "0.00" (RPC not available in tests)
vi.mock("../src/balance.ts", () => ({
  getUsdcBalance: vi.fn(() => Promise.resolve({ balance: "0.00", funded: false })),
  getEthBalance: vi.fn(() => Promise.resolve({ eth_balance: "0.000000" })),
}));

// Mock the service layer so smoke tests don't need real keystores
vi.mock("../src/service.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/service.ts")>();
  return {
    ...original,
    registerWallet: vi.fn(),
    registerWalletInternal: vi.fn(),
    listWallets: vi.fn(),
    getWallet: vi.fn(),
    deactivateWallet: vi.fn(),
    createFundRequest: vi.fn(),
    listFundRequests: vi.fn(),
    approveFundRequest: vi.fn(),
    denyFundRequest: vi.fn(),
    getSpendingPolicy: vi.fn(),
    updateSpendingPolicy: vi.fn(),
    pauseWallet: vi.fn(),
    resumeWallet: vi.fn(),
  };
});

import app from "../src/index.ts";
import { registerWallet, getWallet } from "../src/service.ts";

describe("wallet.sh app", () => {
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

  // Check 3: x402 middleware is wired — wallet uses skipX402 + manual registration,
  // so we verify createAgentStackMiddleware was called directly
  it("x402 middleware is registered with payTo and freeRoutes", () => {
    expect(createAgentStackMiddlewareSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        payTo: expect.any(String),
        freeRoutes: expect.arrayContaining(["GET /", "POST /v1/wallets"]),
      }),
      expect.any(Object),
    );
  });

  // Check 4: POST /v1/wallets happy path — register a wallet (free route)
  it("POST /v1/wallets with valid signature returns 201", async () => {
    vi.mocked(registerWallet).mockResolvedValueOnce({
      ok: true,
      data: {
        address: "0x09D896446fBd3299Fa8d7898001b086E56f642B5",
        chain: "base",
        label: null,
        registered_at: "2026-03-03T00:00:00.000Z",
        created_at: "2026-03-03T00:00:00.000Z",
      },
    });

    const res = await app.request("/v1/wallets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: "0x09D896446fBd3299Fa8d7898001b086E56f642B5",
        signature: "0xfakesig",
        timestamp: new Date().toISOString(),
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.address).toBe("0x09D896446fBd3299Fa8d7898001b086E56f642B5");
    expect(body.chain).toBe("base");
  });

  // Check 5: POST /v1/wallets with missing fields returns 400
  it("POST /v1/wallets with missing fields returns 400", async () => {
    const res = await app.request("/v1/wallets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: "0x09D896446fBd3299Fa8d7898001b086E56f642B5" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_request");
  });

  // Check 6: HRD-65 — balance for unregistered wallet returns on-chain balance, not 404
  it("GET /v1/wallets/:address returns balance for unregistered wallet instead of 404", async () => {
    // Wallet is funded on-chain (e.g. by gate.sh redeem) but not registered on wallet.sh.
    // The caller queries their own address — currently returns 404, should return balance.
    const address = "0x0000000000000000000000000000000000000001";
    vi.mocked(getWallet).mockResolvedValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Wallet not found",
    });

    const res = await app.request(`/v1/wallets/${address}`);
    expect(res.status).not.toBe(404);
    const body = await res.json();
    // Should include on-chain balance even for unregistered wallets
    expect(body.balance).toBeDefined();
    expect(body.eth_balance).toBeDefined();
    expect(body.address).toBe(address);
  });
});
