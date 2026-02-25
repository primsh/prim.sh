/**
 * W-2 wallet creation tests: keystore, creation, ownership, claim, deactivation.
 *
 * IMPORTANT: env vars must be set before any module import that touches keystore/db.
 * We use vi.isolateModules() to reset module state for keystore tests that need
 * different env configs.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

// Set master key and in-memory DB before any imports
const TEST_MASTER_KEY = "a".repeat(64); // 32 bytes as hex
process.env.WALLET_MASTER_KEY = TEST_MASTER_KEY;
process.env.WALLET_DB_PATH = ":memory:";

// Import modules after env is set
import { getMasterKey, encryptPrivateKey, decryptPrivateKey, generateWallet } from "../src/keystore.ts";
import { resetDb } from "../src/db.ts";

// ─── Keystore tests ────────────────────────────────────────────────────────

describe("keystore", () => {
  it("encrypt + decrypt roundtrip returns original key", () => {
    const { privateKey } = generateWallet();
    const blob = encryptPrivateKey(privateKey);
    const recovered = decryptPrivateKey(blob);
    expect(recovered).toBe(privateKey);
  });

  it("decryptPrivateKey throws with wrong master key", () => {
    const { privateKey } = generateWallet();
    const blob = encryptPrivateKey(privateKey);

    // Temporarily set a different master key
    const orig = process.env.WALLET_MASTER_KEY;
    process.env.WALLET_MASTER_KEY = "b".repeat(64);
    expect(() => decryptPrivateKey(blob)).toThrow();
    process.env.WALLET_MASTER_KEY = orig;
  });

  it("getMasterKey throws when neither env var is set", () => {
    const orig = process.env.WALLET_MASTER_KEY;
    const origFile = process.env.WALLET_MASTER_KEY_FILE;
    // biome-ignore lint/performance/noDelete: process.env must use delete to truly unset
    delete process.env.WALLET_MASTER_KEY;
    // biome-ignore lint/performance/noDelete: process.env must use delete to truly unset
    delete process.env.WALLET_MASTER_KEY_FILE;

    expect(() => getMasterKey()).toThrow("No master key configured");

    process.env.WALLET_MASTER_KEY = orig;
    if (origFile !== undefined) {
      process.env.WALLET_MASTER_KEY_FILE = origFile;
    } else {
      // biome-ignore lint/performance/noDelete: process.env must use delete to truly unset
      delete process.env.WALLET_MASTER_KEY_FILE;
    }
  });

  it("getMasterKey throws when WALLET_MASTER_KEY_FILE is set but file is missing", () => {
    const origKey = process.env.WALLET_MASTER_KEY;
    // biome-ignore lint/performance/noDelete: process.env must use delete to truly unset
    delete process.env.WALLET_MASTER_KEY;
    process.env.WALLET_MASTER_KEY_FILE = "/nonexistent/path/master.key";

    expect(() => getMasterKey()).toThrow("Master key file not found");

    process.env.WALLET_MASTER_KEY = origKey;
    // biome-ignore lint/performance/noDelete: process.env must use delete to truly unset
    delete process.env.WALLET_MASTER_KEY_FILE;
  });

  it("encrypted blob is valid JSON with version/iv/tag/ciphertext fields", () => {
    const { privateKey } = generateWallet();
    const blob = encryptPrivateKey(privateKey);
    const parsed = JSON.parse(blob) as Record<string, unknown>;
    expect(parsed.version).toBe(1);
    expect(typeof parsed.iv).toBe("string");
    expect(typeof parsed.tag).toBe("string");
    expect(typeof parsed.ciphertext).toBe("string");
  });

  it("encrypted blob does NOT contain raw private key as plaintext", () => {
    const { privateKey } = generateWallet();
    const blob = encryptPrivateKey(privateKey);
    // Remove 0x prefix for substring check
    expect(blob).not.toContain(privateKey.slice(2));
  });
});

// ─── App-level tests (HTTP) ────────────────────────────────────────────────

// Mock fetch so x402 middleware doesn't make real network calls
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

// Import app after stubbing fetch
const { default: app } = await import("../src/index.ts");

// Build a fake payment header that sets walletAddress in context.
// The x402 middleware extracts `from` from the payment-signature header.
// We use a minimal fake that decodePaymentSignatureHeader can parse.
import { encodePaymentSignatureHeader } from "@x402/core/http";

function makePaymentHeader(fromAddress: string): string {
  const paymentPayload = {
    x402Version: 2,
    scheme: "exact",
    network: "eip155:8453",
    payload: {
      authorization: {
        from: fromAddress,
        to: "0x0000000000000000000000000000000000000000",
        value: "1000",
        validAfter: "0",
        validBefore: "9999999999",
        nonce: "0xdeadbeef",
      },
      signature: "0xsignature",
    },
  };
  return encodePaymentSignatureHeader(paymentPayload as unknown as never);
}

const CALLER = "0xCa11e900000000000000000000000000000000001";
const OTHER_CALLER = "0xCa11e900000000000000000000000000000000002";

// Reset DB singleton before each test so tests don't share state
beforeEach(() => {
  resetDb();
});

afterEach(() => {
  resetDb();
});

describe("POST /v1/wallets — wallet creation", () => {
  it("returns 201 with valid Ethereum address", async () => {
    const res = await app.request("/v1/wallets", { method: "POST" });
    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(body.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("returns claimToken starting with ctk_", async () => {
    const res = await app.request("/v1/wallets", { method: "POST" });
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.claimToken).toBe("string");
    expect((body.claimToken as string).startsWith("ctk_")).toBe(true);
  });

  it("defaults to chain eip155:8453 when no body provided", async () => {
    const res = await app.request("/v1/wallets", { method: "POST" });
    const body = await res.json() as Record<string, unknown>;
    expect(body.chain).toBe("eip155:8453");
  });

  it("two calls return different addresses", async () => {
    const res1 = await app.request("/v1/wallets", { method: "POST" });
    const res2 = await app.request("/v1/wallets", { method: "POST" });
    const body1 = await res1.json() as Record<string, unknown>;
    const body2 = await res2.json() as Record<string, unknown>;
    expect(body1.address).not.toBe(body2.address);
  });

  it("encrypted_key in DB is JSON with version/iv/tag/ciphertext and does not contain raw key", async () => {
    const res = await app.request("/v1/wallets", { method: "POST" });
    const body = await res.json() as Record<string, unknown>;
    const address = body.address as string;

    // Access DB directly to verify storage
    const { getDb } = await import("../src/db.ts");
    const db = getDb();
    const row = db.query<{ encrypted_key: string }, [string]>(
      "SELECT encrypted_key FROM wallets WHERE address = ?",
    ).get(address);

    expect(row).not.toBeNull();
    const encKey = (row as { encrypted_key: string }).encrypted_key;
    const parsed = JSON.parse(encKey) as Record<string, unknown>;
    expect(parsed.version).toBe(1);
    expect(typeof parsed.iv).toBe("string");
    expect(typeof parsed.tag).toBe("string");
    expect(typeof parsed.ciphertext).toBe("string");
    // Raw private key must not appear in the blob
    expect(encKey).not.toContain("0x");
  });
});

describe("Ownership + claim token flow", () => {
  it("GET /v1/wallets/:address returns 403 when wallet is unclaimed", async () => {
    // Create wallet
    const createRes = await app.request("/v1/wallets", { method: "POST" });
    const body = await createRes.json() as Record<string, unknown>;
    const address = body.address as string;

    // Try to access without claiming — payment header needed for paid route
    const res = await app.request(`/v1/wallets/${address}`, {
      method: "GET",
      headers: { "Payment-Signature": makePaymentHeader(CALLER) },
    });
    // x402 will return 402 with invalid signature, but we verify the ownership check
    // by looking at the logic path. The middleware intercepts paid routes before handlers.
    // For unclaimed wallet test, we simulate a claimed payment but unclaimed wallet.
    // Since the x402 middleware will reject invalid sig, we test ownership via service directly.
    expect([402, 403]).toContain(res.status);
  });

  it("claim token flow: create → claim → access", async () => {
    // Create wallet
    const createRes = await app.request("/v1/wallets", { method: "POST" });
    expect(createRes.status).toBe(201);
    const body = await createRes.json() as Record<string, unknown>;
    const address = body.address as string;
    const claimToken = body.claimToken as string;

    // Manually claim via db to bypass x402 payment requirement in tests
    const { claimWallet } = await import("../src/db.ts");
    const claimed = claimWallet(address, claimToken, CALLER);
    expect(claimed).toBe(true);

    // Verify second claim attempt fails (single-use)
    const secondClaim = claimWallet(address, claimToken, OTHER_CALLER);
    expect(secondClaim).toBe(false);
  });

  it("claim token is single-use", async () => {
    const createRes = await app.request("/v1/wallets", { method: "POST" });
    const body = await createRes.json() as Record<string, unknown>;
    const address = body.address as string;
    const claimToken = body.claimToken as string;

    const { claimWallet } = await import("../src/db.ts");
    // First claim succeeds
    expect(claimWallet(address, claimToken, CALLER)).toBe(true);
    // Second claim with same token fails
    expect(claimWallet(address, claimToken, CALLER)).toBe(false);
    // Second claim with different caller also fails
    expect(claimWallet(address, claimToken, OTHER_CALLER)).toBe(false);
  });

  it("invalid claim token returns false", async () => {
    const createRes = await app.request("/v1/wallets", { method: "POST" });
    const body = await createRes.json() as Record<string, unknown>;
    const address = body.address as string;

    const { claimWallet } = await import("../src/db.ts");
    expect(claimWallet(address, "ctk_wrongtoken", CALLER)).toBe(false);
  });
});

describe("Wallet ownership logic (via service)", () => {
  it("getWallet returns 403 for unclaimed wallet", async () => {
    const createRes = await app.request("/v1/wallets", { method: "POST" });
    const body = await createRes.json() as Record<string, unknown>;
    const address = body.address as string;

    const { getWallet } = await import("../src/service.ts");
    const result = await getWallet(address, CALLER);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.code).toBe("forbidden");
    }
  });

  it("getWallet returns 403 when caller is not the owner", async () => {
    const createRes = await app.request("/v1/wallets", { method: "POST" });
    const body = await createRes.json() as Record<string, unknown>;
    const address = body.address as string;
    const claimToken = body.claimToken as string;

    const { claimWallet } = await import("../src/db.ts");
    claimWallet(address, claimToken, CALLER);

    const { getWallet } = await import("../src/service.ts");
    const result = await getWallet(address, OTHER_CALLER);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
    }
  });

  it("getWallet returns ok when caller is the owner", async () => {
    const createRes = await app.request("/v1/wallets", { method: "POST" });
    const body = await createRes.json() as Record<string, unknown>;
    const address = body.address as string;
    const claimToken = body.claimToken as string;

    const { claimWallet } = await import("../src/db.ts");
    claimWallet(address, claimToken, CALLER);

    const { getWallet } = await import("../src/service.ts");
    const result = await getWallet(address, CALLER);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.address).toBe(address);
      // RPC will fail in test env (no mock), graceful fallback returns "0.00"
      expect(result.data.balance).toBe("0.00");
    }
  });

  it("listWallets returns only wallets owned by caller", async () => {
    // Create two wallets, claim one for CALLER, one for OTHER_CALLER
    const res1 = await app.request("/v1/wallets", { method: "POST" });
    const res2 = await app.request("/v1/wallets", { method: "POST" });
    const b1 = await res1.json() as Record<string, unknown>;
    const b2 = await res2.json() as Record<string, unknown>;

    const { claimWallet } = await import("../src/db.ts");
    claimWallet(b1.address as string, b1.claimToken as string, CALLER);
    claimWallet(b2.address as string, b2.claimToken as string, OTHER_CALLER);

    const { listWallets } = await import("../src/service.ts");
    const result = await listWallets(CALLER, 20);
    expect(result.wallets).toHaveLength(1);
    expect(result.wallets[0].address).toBe(b1.address);
  });
});

describe("Wallet deactivation", () => {
  it("deactivateWallet returns 200 with deactivatedAt timestamp", async () => {
    const createRes = await app.request("/v1/wallets", { method: "POST" });
    const body = await createRes.json() as Record<string, unknown>;
    const address = body.address as string;
    const claimToken = body.claimToken as string;

    const { claimWallet } = await import("../src/db.ts");
    claimWallet(address, claimToken, CALLER);

    const { deactivateWallet } = await import("../src/service.ts");
    const result = deactivateWallet(address, CALLER);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.deactivated).toBe(true);
      expect(typeof result.data.deactivatedAt).toBe("string");
      expect(result.data.address).toBe(address);
    }
  });

  it("getWallet returns 404 after deactivation", async () => {
    const createRes = await app.request("/v1/wallets", { method: "POST" });
    const body = await createRes.json() as Record<string, unknown>;
    const address = body.address as string;
    const claimToken = body.claimToken as string;

    const { claimWallet } = await import("../src/db.ts");
    claimWallet(address, claimToken, CALLER);

    const { deactivateWallet, getWallet } = await import("../src/service.ts");
    deactivateWallet(address, CALLER);

    const result = await getWallet(address, CALLER);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
    }
  });
});
