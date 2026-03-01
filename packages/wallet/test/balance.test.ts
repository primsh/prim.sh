// SPDX-License-Identifier: Apache-2.0
/**
 * W-3 balance query tests.
 *
 * Mocks viem's PublicClient.readContract to avoid hitting real Base RPC.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Set env before any module imports
process.env.WALLET_DB_PATH = ":memory:";

// Mock viem so we can control readContract responses
const mockReadContract = vi.fn();

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      readContract: mockReadContract,
    })),
  };
});

// Import balance module AFTER mocking viem
const { getUsdcBalance } = await import("../src/balance.ts");

const ADDR = "0xCa11e900000000000000000000000000000000001" as const;

beforeEach(() => {
  mockReadContract.mockReset();
});

describe("getUsdcBalance", () => {
  it("non-zero balance: returns correct string and funded=true", async () => {
    mockReadContract.mockResolvedValue(10500000n); // 10.50 USDC
    const result = await getUsdcBalance(ADDR);
    expect(result.balance).toBe("10.50");
    expect(result.funded).toBe(true);
  });

  it("zero balance: returns '0.00' and funded=false", async () => {
    mockReadContract.mockResolvedValue(0n);
    const result = await getUsdcBalance(ADDR);
    expect(result.balance).toBe("0.00");
    expect(result.funded).toBe(false);
  });

  it("dust (1 wei USDC): returns '0.00' and funded=true", async () => {
    mockReadContract.mockResolvedValue(1n); // 0.000001 USDC
    const result = await getUsdcBalance(ADDR);
    expect(result.balance).toBe("0.00");
    expect(result.funded).toBe(true);
  });

  it("RPC failure: returns '0.00' and funded=false without throwing", async () => {
    mockReadContract.mockRejectedValue(new Error("RPC timeout"));
    const result = await getUsdcBalance(ADDR);
    expect(result.balance).toBe("0.00");
    expect(result.funded).toBe(false);
  });

  it("large balance (1M USDC): returns correct string and funded=true", async () => {
    mockReadContract.mockResolvedValue(1_000_000_000_000n); // 1,000,000.00 USDC
    const result = await getUsdcBalance(ADDR);
    expect(result.balance).toBe("1000000.00");
    expect(result.funded).toBe(true);
  });
});

// Integration test: verify the balance flows through service → getWallet
describe("balance integration via service", () => {
  it("getWallet returns live balance when RPC succeeds", async () => {
    // Stub fetch for x402 middleware (needed for app import)
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : (input as URL).toString();
      if (url.endsWith("/supported")) {
        return new Response(
          JSON.stringify({
            kinds: [{ x402Version: 2, scheme: "exact", network: "eip155:8453" }],
            extensions: [],
            signers: {},
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", mockFetch);

    const { resetDb, insertWallet } = await import("../src/db.ts");
    resetDb();

    // Register a wallet directly via DB
    const address = "0xCa11e900000000000000000000000000000000001";
    insertWallet({ address, chain: "eip155:8453", createdBy: address });

    // Set the mock to return a specific balance for the next call
    mockReadContract.mockResolvedValue(5000000n); // 5.00 USDC

    // Call service directly
    const { getWallet } = await import("../src/service.ts");
    const result = await getWallet(address, address);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.balance).toBe("5.00");
      expect(result.data.funded).toBe(true);
    }

    resetDb();
    vi.unstubAllGlobals();
  });
});
