/**
 * Faucet package tests: testnet guard, USDC/ETH drip, rate limiting, status endpoint.
 *
 * IMPORTANT: env vars must be set before any module import that touches network config.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

// Set testnet env before any imports
process.env.PRIM_NETWORK = "eip155:84532";
process.env.CIRCLE_API_KEY = "test-api-key";
// Hardhat/Anvil account #0 — well-known public test key, not a real secret
process.env.FAUCET_TREASURY_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
process.env.FAUCET_DRIP_ETH = "0.01";
// Use in-memory SQLite for tests (isolated, no disk files)
process.env.FAUCET_DB_PATH = ":memory:";

// ─── Mock fns (declared before vi.mock so factories can reference them) ───

const mockSendTransaction = vi.fn<[], Promise<`0x${string}`>>();
const mockWriteContract = vi.fn<[], Promise<`0x${string}`>>();

// ─── Mock viem wallet client ───────────────────────────────────────────────

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createWalletClient: vi.fn(() => ({
      sendTransaction: mockSendTransaction,
      writeContract: mockWriteContract,
    })),
  };
});

// ─── Mock fetch (Circle Faucet API + wallet.sh allowlist) ─────────────────

/** Underlying mock for Circle API calls — tests configure this via setupCircleSuccess/Error */
const mockCircleFetch = vi.fn<
  [RequestInfo | URL, RequestInit | undefined],
  Promise<Response>
>();

/**
 * Global fetch stub that routes:
 *  - wallet.sh allowlist checks → auto-approve (always allowed in tests)
 *  - everything else → mockCircleFetch (configured per-test)
 */
const mockFetch = vi.fn<
  [RequestInfo | URL, RequestInit | undefined],
  Promise<Response>
>().mockImplementation((input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
  if (url.includes("/internal/allowlist/check")) {
    return Promise.resolve(
      new Response(JSON.stringify({ allowed: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }
  return mockCircleFetch(input, init);
});
vi.stubGlobal("fetch", mockFetch);

// Import app and db helpers after env + mocks are set up
import app from "../src/index.ts";
import { resetDb, upsertDrip, getLastDrip, cleanupOldEntries } from "../src/db.ts";

// ─── Test helpers ─────────────────────────────────────────────────────────

const VALID_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const VALID_ADDRESS_CHECKSUMMED = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

async function postJson(path: string, body: unknown): Promise<Response> {
  return await app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setupCircleSuccess(): void {
  mockCircleFetch.mockResolvedValue(
    new Response(
      JSON.stringify({ txHash: "0xCircleTxHash123" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
}

function setupCircleError(status: number, body: string): void {
  mockCircleFetch.mockResolvedValue(new Response(body, { status }));
}

// ─── Reset state between tests ────────────────────────────────────────────

beforeEach(() => {
  mockCircleFetch.mockReset();
  mockSendTransaction.mockReset();
  mockWriteContract.mockReset();
  process.env.PRIM_NETWORK = "eip155:84532";
  process.env.CIRCLE_API_KEY = "test-api-key";
  process.env.FAUCET_TREASURY_KEY =
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  process.env.FAUCET_DRIP_ETH = "0.01";
  // Reset SQLite DB between tests to ensure isolation
  resetDb();
});

// ─── Health check ─────────────────────────────────────────────────────────

describe("GET / — health check", () => {
  it("returns 200 with service info", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.service).toBe("faucet.sh");
    expect(body.status).toBe("ok");
    expect(body.network).toBe("eip155:84532");
    expect(body.testnet).toBe(true);
  });

  it("returns 200 even on mainnet (health check bypasses testnet guard)", async () => {
    process.env.PRIM_NETWORK = "eip155:8453";
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.testnet).toBe(false);
  });
});

// ─── Testnet guard ────────────────────────────────────────────────────────

describe("testnet guard", () => {
  it("POST /v1/faucet/usdc on mainnet returns 403", async () => {
    process.env.PRIM_NETWORK = "eip155:8453";
    const res = await postJson("/v1/faucet/usdc", { address: VALID_ADDRESS });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("mainnet_rejected");
  });

  it("POST /v1/faucet/eth on mainnet returns 403", async () => {
    process.env.PRIM_NETWORK = "eip155:8453";
    const res = await postJson("/v1/faucet/eth", { address: VALID_ADDRESS });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("mainnet_rejected");
  });
});

// ─── USDC drip ────────────────────────────────────────────────────────────

describe("POST /v1/faucet/usdc", () => {
  it("valid address — returns 200 with tx_hash/amount/currency/chain (Circle)", async () => {
    setupCircleSuccess();
    // Use a unique address to avoid rate limit from other tests
    const addr = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
    const res = await postJson("/v1/faucet/usdc", { address: addr });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.tx_hash).toBe("0xCircleTxHash123");
    expect(body.amount).toBe("10.00");
    expect(body.currency).toBe("USDC");
    expect(body.chain).toBe("eip155:84532");
    expect(body.source).toBe("circle");
  });

  it("invalid address — returns 400", async () => {
    const res = await postJson("/v1/faucet/usdc", { address: "not-an-address" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_request");
  });

  it("missing body — returns 400", async () => {
    const res = await app.request("/v1/faucet/usdc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_request");
  });

  it("rate limited — returns 429 with retryAfter", async () => {
    setupCircleSuccess();
    // First drip succeeds
    const addr = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
    const first = await postJson("/v1/faucet/usdc", { address: addr });
    expect(first.status).toBe(200);

    // Second drip within 2h window — rate limited
    setupCircleSuccess();
    const second = await postJson("/v1/faucet/usdc", { address: addr });
    expect(second.status).toBe(429);
    const body = (await second.json()) as { error: { code: string; retryAfter: number } };
    expect(body.error.code).toBe("rate_limited");
    expect(body.error.retryAfter).toBeGreaterThan(0);
  });

  it("Circle API error + treasury failure — returns 502", async () => {
    setupCircleError(500, "Internal server error");
    mockWriteContract.mockRejectedValue(new Error("RPC timeout"));
    const addr = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
    const res = await postJson("/v1/faucet/usdc", { address: addr });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("faucet_error");
    expect(body.error.message).toContain("treasury also failed");
  });

  it("Circle 429 rate-limited — falls back to treasury and returns 200", async () => {
    setupCircleError(429, "Too Many Requests");
    mockWriteContract.mockResolvedValue("0xTreasuryUsdcTx");
    const addr = "0x71bE63f3384f5fb98995898A86B02Fb2426c5788";
    const res = await postJson("/v1/faucet/usdc", { address: addr });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.tx_hash).toBe("0xTreasuryUsdcTx");
    expect(body.amount).toBe("10.00");
    expect(body.currency).toBe("USDC");
    expect(body.chain).toBe("eip155:84532");
    expect(body.source).toBe("treasury");
  });

  it("Circle error — falls back to treasury and returns 200", async () => {
    setupCircleError(503, "Service Unavailable");
    mockWriteContract.mockResolvedValue("0xTreasuryUsdcTx2");
    const addr = "0xFABB0ac9d68B0B445fB7357272Ff202C5651694a";
    const res = await postJson("/v1/faucet/usdc", { address: addr });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.source).toBe("treasury");
    expect(body.tx_hash).toBe("0xTreasuryUsdcTx2");
  });

  it("no CIRCLE_API_KEY + no FAUCET_TREASURY_KEY — returns 502", async () => {
    const origCircle = process.env.CIRCLE_API_KEY;
    const origTreasury = process.env.FAUCET_TREASURY_KEY;
    // biome-ignore lint/performance/noDelete: process.env must use delete to truly unset
    delete process.env.CIRCLE_API_KEY;
    // biome-ignore lint/performance/noDelete: process.env must use delete to truly unset
    delete process.env.FAUCET_TREASURY_KEY;

    const addr = "0x1CBd3b2770909D4e10f157cABC84C7264073C9Ec";
    const res = await postJson("/v1/faucet/usdc", { address: addr });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("faucet_error");

    process.env.CIRCLE_API_KEY = origCircle;
    process.env.FAUCET_TREASURY_KEY = origTreasury;
  });

  it("no CIRCLE_API_KEY — falls back to treasury and returns 200", async () => {
    const origCircle = process.env.CIRCLE_API_KEY;
    // biome-ignore lint/performance/noDelete: process.env must use delete to truly unset
    delete process.env.CIRCLE_API_KEY;
    mockWriteContract.mockResolvedValue("0xTreasuryFallbackNoCircleKey");

    const addr = "0xdF3e18d64BC6A983f673Ab319CCaE4f1a57C7097";
    const res = await postJson("/v1/faucet/usdc", { address: addr });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.source).toBe("treasury");
    expect(body.tx_hash).toBe("0xTreasuryFallbackNoCircleKey");

    process.env.CIRCLE_API_KEY = origCircle;
  });
});

// ─── ETH drip ─────────────────────────────────────────────────────────────

describe("POST /v1/faucet/eth", () => {
  it("valid address — returns 200 with tx_hash", async () => {
    mockSendTransaction.mockResolvedValue("0xEthTxHash456");
    const addr = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65";
    const res = await postJson("/v1/faucet/eth", { address: addr });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.tx_hash).toBe("0xEthTxHash456");
    expect(body.amount).toBe("0.01");
    expect(body.currency).toBe("ETH");
    expect(body.chain).toBe("eip155:84532");
  });

  it("invalid address — returns 400", async () => {
    const res = await postJson("/v1/faucet/eth", { address: "garbage" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_request");
  });

  it("rate limited — returns 429", async () => {
    mockSendTransaction.mockResolvedValue("0xEthTx1");
    const addr = "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc";
    const first = await postJson("/v1/faucet/eth", { address: addr });
    expect(first.status).toBe(200);

    // Second drip within 1h window
    mockSendTransaction.mockResolvedValue("0xEthTx2");
    const second = await postJson("/v1/faucet/eth", { address: addr });
    expect(second.status).toBe(429);
    const body = (await second.json()) as { error: { code: string; retryAfter: number } };
    expect(body.error.code).toBe("rate_limited");
    expect(body.error.retryAfter).toBeGreaterThan(0);
  });

  it("missing FAUCET_TREASURY_KEY — returns 502", async () => {
    const orig = process.env.FAUCET_TREASURY_KEY;
    // biome-ignore lint/performance/noDelete: process.env must use delete to truly unset
    delete process.env.FAUCET_TREASURY_KEY;

    const addr = "0x976EA74026E726554dB657fA54763abd0C3a0aa9";
    const res = await postJson("/v1/faucet/eth", { address: addr });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("faucet_error");
    expect(body.error.message).toContain("FAUCET_TREASURY_KEY");

    process.env.FAUCET_TREASURY_KEY = orig;
  });

  it("sendTransaction failure — returns 502", async () => {
    mockSendTransaction.mockRejectedValue(new Error("RPC timeout"));
    const addr = "0x14dc79964DA2C08Da15fd353D30FF18283C7bD3c";
    const res = await postJson("/v1/faucet/eth", { address: addr });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("faucet_error");
    expect(body.error.message).toContain("RPC timeout");
  });
});

// ─── Status endpoint ──────────────────────────────────────────────────────

describe("GET /v1/faucet/status", () => {
  it("returns availability for both USDC and ETH (fresh address)", async () => {
    const addr = "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f";
    const res = await app.request(`/v1/faucet/status?address=${addr}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.address).toBe(addr);
    const usdc = body.usdc as { available: boolean; retry_after_ms: number };
    const eth = body.eth as { available: boolean; retry_after_ms: number };
    expect(usdc.available).toBe(true);
    expect(usdc.retry_after_ms).toBe(0);
    expect(eth.available).toBe(true);
    expect(eth.retry_after_ms).toBe(0);
  });

  it("shows unavailable after recent drip", async () => {
    // First: do a USDC drip
    setupCircleSuccess();
    const addr = "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720";
    await postJson("/v1/faucet/usdc", { address: addr });

    // Then: do an ETH drip
    mockSendTransaction.mockResolvedValue("0xStatusEthTx");
    await postJson("/v1/faucet/eth", { address: addr });

    // Check status
    const res = await app.request(`/v1/faucet/status?address=${addr}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    const usdc = body.usdc as { available: boolean; retry_after_ms: number };
    const eth = body.eth as { available: boolean; retry_after_ms: number };
    expect(usdc.available).toBe(false);
    expect(usdc.retry_after_ms).toBeGreaterThan(0);
    expect(eth.available).toBe(false);
    expect(eth.retry_after_ms).toBeGreaterThan(0);
  });

  it("invalid address — returns 400", async () => {
    const res = await app.request("/v1/faucet/status?address=notvalid");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_request");
  });

  it("missing address query param — returns 400", async () => {
    const res = await app.request("/v1/faucet/status");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_request");
  });
});

// ─── SQLite persistence ───────────────────────────────────────────────────

describe("SQLite rate limit persistence", () => {
  it("records drip and reads it back within same session", () => {
    const addr = "0xBcd4042DE499D14e55001CcbB24a551F3b954096";
    const ts = Date.now();
    upsertDrip(addr, "usdc", ts);

    const result = getLastDrip(addr, "usdc");
    expect(result).not.toBeNull();
    expect(result).toBe(ts);
  });

  it("getLastDrip returns null for unknown address", () => {
    const result = getLastDrip("0x0000000000000000000000000000000000000001", "usdc");
    expect(result).toBeNull();
  });

  it("upsertDrip updates existing record", () => {
    const addr = "0xdD2FD4581271e230360230F9337D5c0430Bf44C0";
    const t1 = Date.now() - 1000;
    upsertDrip(addr, "usdc", t1);

    const t2 = Date.now();
    upsertDrip(addr, "usdc", t2);

    const result = getLastDrip(addr, "usdc");
    expect(result).toBe(t2);
  });

  it("cleanupOldEntries removes stale rows", () => {
    const addr = "0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199";
    // Insert a record that is 25 hours old
    const oldTimestamp = Date.now() - 25 * 60 * 60 * 1000;
    upsertDrip(addr, "eth", oldTimestamp);

    // Cleanup entries older than 24h
    cleanupOldEntries(24 * 60 * 60 * 1000);

    const result = getLastDrip(addr, "eth");
    expect(result).toBeNull();
  });
});
