/**
 * W-5: x402Fetch client tests.
 *
 * Mocks:
 * - global fetch to simulate 402 → 200 flows
 * - @x402/core/client and @x402/evm/exact/client to avoid real signing
 * - DB with in-memory SQLite via the bun-sqlite shim
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { encodePaymentRequiredHeader } from "@x402/core/http";

// Set env before module imports
process.env.WALLET_MASTER_KEY = "a".repeat(64);
process.env.WALLET_DB_PATH = ":memory:";

// ── Mock x402 client so tests don't need real EIP-3009 signing ────────────────

const mockCreatePaymentPayload = vi.fn();
const mockEncodePaymentSignatureHeader = vi.fn();

vi.mock("@x402/core/client", () => ({
  x402Client: vi.fn().mockImplementation(() => ({})),
  x402HTTPClient: vi.fn().mockImplementation(() => ({
    createPaymentPayload: mockCreatePaymentPayload,
    encodePaymentSignatureHeader: mockEncodePaymentSignatureHeader,
  })),
}));

vi.mock("@x402/evm/exact/client", () => ({
  registerExactEvmScheme: vi.fn(),
}));

// Mock viem public client (readContract not needed in tests)
vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      readContract: vi.fn(),
    })),
  };
});

// ── Import modules after mocks ────────────────────────────────────────────────

const { x402Fetch } = await import("../src/x402-client.ts");
const { resetDb, getDb } = await import("../src/db.ts");
const { encryptPrivateKey } = await import("../src/keystore.ts");

// ── Helpers ───────────────────────────────────────────────────────────────────

const TEST_ADDRESS = "0xCa11e900000000000000000000000000000000001" as const;
const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`;

function makePaymentRequiredHeader(amount = "0.01"): string {
  const paymentRequired = {
    x402Version: 2,
    error: undefined,
    resource: {
      url: "https://example.com/resource",
      method: "GET",
    },
    accepts: [
      {
        scheme: "exact",
        network: "eip155:8453",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        amount,
        payTo: "0xRecipient000000000000000000000000000000001",
        maxTimeoutSeconds: 300,
        extra: {},
      },
    ],
    extensions: undefined,
  };
  // biome-ignore lint/suspicious/noExplicitAny: test helper casting
  return encodePaymentRequiredHeader(paymentRequired as any);
}

function make402Response(amount = "0.01"): Response {
  return new Response("Payment Required", {
    status: 402,
    headers: {
      "X-Payment-Required": makePaymentRequiredHeader(amount),
    },
  });
}

function make200Response(): Response {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function insertTestWallet(address: string = TEST_ADDRESS, deactivated = false): void {
  const encryptedKey = encryptPrivateKey(TEST_PRIVATE_KEY);
  const db = getDb();
  const now = Date.now();
  const deactivatedAt = deactivated ? new Date().toISOString() : null;
  db.query(
    "INSERT INTO wallets (address, chain, encrypted_key, claim_token, deactivated_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(address, "eip155:8453", encryptedKey, null, deactivatedAt, now, now);
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  resetDb();
  vi.clearAllMocks();

  // Default: payment creation returns a fake payload, encode returns a header
  mockCreatePaymentPayload.mockResolvedValue({
    x402Version: 2,
    scheme: "exact",
    network: "eip155:8453",
    resource: { url: "https://example.com/resource", method: "GET" },
    accepted: {},
    payload: { signature: "0xsig" },
  });
  mockEncodePaymentSignatureHeader.mockReturnValue({
    "Payment-Signature": "dGVzdA==", // base64 "test"
  });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("x402Fetch", () => {
  it("non-402 passthrough: returns 200 immediately without signing", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(make200Response());
    vi.stubGlobal("fetch", mockFetch);

    insertTestWallet();
    const res = await x402Fetch("https://example.com/resource", {
      walletAddress: TEST_ADDRESS,
    });

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockCreatePaymentPayload).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("402 → sign → 200: returns 200, Payment-Signature sent on retry", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(make402Response())
      .mockResolvedValueOnce(make200Response());
    vi.stubGlobal("fetch", mockFetch);

    insertTestWallet();
    const res = await x402Fetch("https://example.com/resource", {
      walletAddress: TEST_ADDRESS,
    });

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockCreatePaymentPayload).toHaveBeenCalledTimes(1);

    // Verify retry had Payment-Signature header
    const retryCall = mockFetch.mock.calls[1];
    const retryHeaders = retryCall[1]?.headers as Headers;
    expect(retryHeaders.get("Payment-Signature")).toBe("dGVzdA==");

    vi.unstubAllGlobals();
  });

  it("402 → sign → still 402: returns second 402 without looping", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(make402Response())
      .mockResolvedValueOnce(make402Response());
    vi.stubGlobal("fetch", mockFetch);

    insertTestWallet();
    const res = await x402Fetch("https://example.com/resource", {
      walletAddress: TEST_ADDRESS,
    });

    expect(res.status).toBe(402);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    vi.unstubAllGlobals();
  });

  it("wallet not found: throws error", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(make402Response());
    vi.stubGlobal("fetch", mockFetch);

    await expect(
      x402Fetch("https://example.com/resource", {
        walletAddress: "0xNonexistent000000000000000000000000000000",
      }),
    ).rejects.toThrow("Wallet not found");

    vi.unstubAllGlobals();
  });

  it("deactivated wallet: throws error", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(make402Response());
    vi.stubGlobal("fetch", mockFetch);

    insertTestWallet(TEST_ADDRESS, true);
    await expect(
      x402Fetch("https://example.com/resource", {
        walletAddress: TEST_ADDRESS,
      }),
    ).rejects.toThrow("deactivated");

    vi.unstubAllGlobals();
  });

  it("price exceeds maxPayment: throws with descriptive message", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(make402Response("5.00"));
    vi.stubGlobal("fetch", mockFetch);

    insertTestWallet();
    await expect(
      x402Fetch("https://example.com/resource", {
        walletAddress: TEST_ADDRESS,
        maxPayment: "1.00",
      }),
    ).rejects.toThrow("exceeds maxPayment");

    vi.unstubAllGlobals();
  });

  it("price at maxPayment cap: does not throw", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(make402Response("1.00"))
      .mockResolvedValueOnce(make200Response());
    vi.stubGlobal("fetch", mockFetch);

    insertTestWallet();
    const res = await x402Fetch("https://example.com/resource", {
      walletAddress: TEST_ADDRESS,
      maxPayment: "1.00",
    });

    expect(res.status).toBe(200);

    vi.unstubAllGlobals();
  });

  it("402 with no Payment-Required header: returns 402 as-is", async () => {
    const raw402 = new Response("Payment Required", { status: 402 });
    const mockFetch = vi.fn().mockResolvedValueOnce(raw402);
    vi.stubGlobal("fetch", mockFetch);

    insertTestWallet();
    const res = await x402Fetch("https://example.com/resource", {
      walletAddress: TEST_ADDRESS,
    });

    expect(res.status).toBe(402);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockCreatePaymentPayload).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
