/**
 * @primsh/x402-client tests.
 *
 * Mocks:
 * - global fetch to simulate 402 -> 200 flows
 * - @x402/core/client and @x402/evm/exact/client to avoid real signing
 * - viem createPublicClient to avoid real RPC calls
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { encodePaymentRequiredHeader } from "@x402/core/http";

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

// Mock @primsh/keystore — configured per-test via vi.mocked(loadAccount)
const mockLoadAccount = vi.fn();
vi.mock("@primsh/keystore", () => ({
  loadAccount: mockLoadAccount,
}));

// ── Import modules after mocks ────────────────────────────────────────────────

const { createPrimFetch, parseUsdc } = await import("../src/client.ts");

// ── Constants ─────────────────────────────────────────────────────────────────

const TEST_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`;

// ── Helpers ───────────────────────────────────────────────────────────────────

// Amounts are in atomic units (micro-USDC, 6 decimals) matching x402 protocol.
// e.g. "10000" = 0.01 USDC, "5000000" = 5.00 USDC, "1000000" = 1.00 USDC
function makePaymentRequiredHeader(amount = "10000"): string {
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

function make402Response(amount = "10000"): Response {
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

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  mockCreatePaymentPayload.mockResolvedValue({
    x402Version: 2,
    scheme: "exact",
    network: "eip155:8453",
    resource: { url: "https://example.com/resource", method: "GET" },
    accepted: {},
    payload: { signature: "0xsig" },
  });
  mockEncodePaymentSignatureHeader.mockReturnValue({
    "Payment-Signature": "dGVzdA==",
  });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("parseUsdc", () => {
  it("parses whole number", () => {
    expect(parseUsdc("1")).toBe(1_000_000n);
  });

  it("parses decimal", () => {
    expect(parseUsdc("0.01")).toBe(10_000n);
  });

  it("parses full precision", () => {
    expect(parseUsdc("1.000001")).toBe(1_000_001n);
  });

  it("truncates beyond 6 decimals", () => {
    expect(parseUsdc("1.0000019")).toBe(1_000_001n);
  });
});

describe("createPrimFetch", () => {
  it("non-402 passthrough: returns 200 immediately without signing", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(make200Response());
    vi.stubGlobal("fetch", mockFetch);

    const primFetch = createPrimFetch({ privateKey: TEST_PRIVATE_KEY });
    const res = await primFetch("https://example.com/resource");

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockCreatePaymentPayload).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("402 -> sign -> 200: returns 200, Payment-Signature sent on retry", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(make402Response())
      .mockResolvedValueOnce(make200Response());
    vi.stubGlobal("fetch", mockFetch);

    const primFetch = createPrimFetch({ privateKey: TEST_PRIVATE_KEY });
    const res = await primFetch("https://example.com/resource");

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockCreatePaymentPayload).toHaveBeenCalledTimes(1);

    // Verify retry had Payment-Signature header
    const retryCall = mockFetch.mock.calls[1];
    const retryHeaders = retryCall[1]?.headers as Headers;
    expect(retryHeaders.get("Payment-Signature")).toBe("dGVzdA==");

    vi.unstubAllGlobals();
  });

  it("402 -> sign -> still 402: returns second 402 without looping", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(make402Response())
      .mockResolvedValueOnce(make402Response());
    vi.stubGlobal("fetch", mockFetch);

    const primFetch = createPrimFetch({ privateKey: TEST_PRIVATE_KEY });
    const res = await primFetch("https://example.com/resource");

    expect(res.status).toBe(402);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    vi.unstubAllGlobals();
  });

  it("price exceeds maxPayment: throws with descriptive message", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(make402Response("5000000"));
    vi.stubGlobal("fetch", mockFetch);

    const primFetch = createPrimFetch({ privateKey: TEST_PRIVATE_KEY, maxPayment: "1.00" });
    await expect(primFetch("https://example.com/resource")).rejects.toThrow("exceeds maxPayment");

    vi.unstubAllGlobals();
  });

  it("price at maxPayment cap: does not throw", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(make402Response("1000000"))
      .mockResolvedValueOnce(make200Response());
    vi.stubGlobal("fetch", mockFetch);

    const primFetch = createPrimFetch({ privateKey: TEST_PRIVATE_KEY, maxPayment: "1.00" });
    const res = await primFetch("https://example.com/resource");

    expect(res.status).toBe(200);

    vi.unstubAllGlobals();
  });

  it("402 with no Payment-Required header: returns 402 as-is", async () => {
    const raw402 = new Response("Payment Required", { status: 402 });
    const mockFetch = vi.fn().mockResolvedValueOnce(raw402);
    vi.stubGlobal("fetch", mockFetch);

    const primFetch = createPrimFetch({ privateKey: TEST_PRIVATE_KEY });
    const res = await primFetch("https://example.com/resource");

    expect(res.status).toBe(402);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockCreatePaymentPayload).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("privateKey mode: creates account from key and signs", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(make402Response())
      .mockResolvedValueOnce(make200Response());
    vi.stubGlobal("fetch", mockFetch);

    const primFetch = createPrimFetch({ privateKey: TEST_PRIVATE_KEY });
    const res = await primFetch("https://example.com/resource");

    expect(res.status).toBe(200);
    expect(mockCreatePaymentPayload).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it("signer mode: uses provided account", async () => {
    // Import privateKeyToAccount to create a real viem account as signer
    const { privateKeyToAccount } = await import("viem/accounts");
    const account = privateKeyToAccount(TEST_PRIVATE_KEY);

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(make402Response())
      .mockResolvedValueOnce(make200Response());
    vi.stubGlobal("fetch", mockFetch);

    const primFetch = createPrimFetch({ signer: account });
    const res = await primFetch("https://example.com/resource");

    expect(res.status).toBe(200);
    expect(mockCreatePaymentPayload).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it("no credentials: throws error", () => {
    // No signer, no privateKey, no keystore, no AGENT_PRIVATE_KEY env
    const saved = process.env.AGENT_PRIVATE_KEY;
    // biome-ignore lint/performance/noDelete: env var must be absent (not "undefined" string)
    delete process.env.AGENT_PRIVATE_KEY;
    expect(() => createPrimFetch({})).toThrow("createPrimFetch requires");
    if (saved !== undefined) process.env.AGENT_PRIVATE_KEY = saved;
  });

  it("AGENT_PRIVATE_KEY env: falls back to env var", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(make200Response());
    vi.stubGlobal("fetch", mockFetch);

    process.env.AGENT_PRIVATE_KEY = TEST_PRIVATE_KEY;
    const primFetch = createPrimFetch({});
    const res = await primFetch("https://example.com/resource");

    expect(res.status).toBe(200);
    // biome-ignore lint/performance/noDelete: env var must be absent (not "undefined" string)
    delete process.env.AGENT_PRIVATE_KEY;

    vi.unstubAllGlobals();
  });

  it("keystore mode: loads account from keystore", async () => {
    const { privateKeyToAccount } = await import("viem/accounts");
    const mockAccount = privateKeyToAccount(TEST_PRIVATE_KEY);
    mockLoadAccount.mockResolvedValue(mockAccount);

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(make402Response())
      .mockResolvedValueOnce(make200Response());
    vi.stubGlobal("fetch", mockFetch);

    const primFetch = createPrimFetch({ keystore: true });
    const res = await primFetch("https://example.com/resource");

    expect(res.status).toBe(200);
    expect(mockLoadAccount).toHaveBeenCalledWith(undefined, { passphrase: undefined });

    vi.unstubAllGlobals();
  });

  it("custom network: uses specified network config", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(make200Response());
    vi.stubGlobal("fetch", mockFetch);

    // Should not throw — baseSepolia is a valid network
    const primFetch = createPrimFetch({
      privateKey: TEST_PRIVATE_KEY,
      network: "eip155:84532",
    });
    const res = await primFetch("https://example.com/resource");

    expect(res.status).toBe(200);

    vi.unstubAllGlobals();
  });
});
