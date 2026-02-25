/**
 * W-10 wallet registration tests: signature-based registration, ownership, deactivation.
 *
 * IMPORTANT: env vars must be set before any module import that touches db.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { getAddress } from "viem";

// Set in-memory DB before any imports
process.env.WALLET_DB_PATH = ":memory:";

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

// Import modules after env/mocks are set
import { resetDb } from "../src/db.ts";
import { registerWallet, getWallet, deactivateWallet, listWallets } from "../src/service.ts";
import { registerTestWallet } from "./helpers.ts";

const CALLER = "0xCa11e900000000000000000000000000000000001";
const OTHER_CALLER = "0xCa11e900000000000000000000000000000000002";

// Reset DB singleton before each test
beforeEach(() => {
  resetDb();
});

afterEach(() => {
  resetDb();
});

// ─── Registration via signature ─────────────────────────────────────────

describe("registerWallet — valid signature", () => {
  it("returns 201 with registered address and chain", async () => {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const timestamp = new Date().toISOString();
    const message = `Register ${getAddress(account.address)} with prim.sh at ${timestamp}`;
    const signature = await account.signMessage({ message });

    const result = await registerWallet({
      address: account.address,
      signature,
      timestamp,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.address).toBe(getAddress(account.address));
      expect(result.data.chain).toBe("eip155:8453");
      expect(typeof result.data.registeredAt).toBe("string");
    }
  });

  it("accepts custom chain", async () => {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const timestamp = new Date().toISOString();
    const message = `Register ${getAddress(account.address)} with prim.sh at ${timestamp}`;
    const signature = await account.signMessage({ message });

    const result = await registerWallet({
      address: account.address,
      signature,
      timestamp,
      chain: "eip155:84532",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.chain).toBe("eip155:84532");
    }
  });

  it("accepts optional label", async () => {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const timestamp = new Date().toISOString();
    const message = `Register ${getAddress(account.address)} with prim.sh at ${timestamp}`;
    const signature = await account.signMessage({ message });

    const result = await registerWallet({
      address: account.address,
      signature,
      timestamp,
      label: "my-agent-wallet",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.label).toBe("my-agent-wallet");
    }
  });
});

describe("registerWallet — invalid inputs", () => {
  it("returns 400 for invalid address", async () => {
    const result = await registerWallet({
      address: "not-an-address",
      signature: "0x00",
      timestamp: new Date().toISOString(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.code).toBe("invalid_request");
    }
  });

  it("returns 400 for expired timestamp (>5 minutes)", async () => {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const oldTimestamp = new Date(Date.now() - 6 * 60 * 1000).toISOString(); // 6 minutes ago
    const message = `Register ${getAddress(account.address)} with prim.sh at ${oldTimestamp}`;
    const signature = await account.signMessage({ message });

    const result = await registerWallet({
      address: account.address,
      signature,
      timestamp: oldTimestamp,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.code).toBe("signature_expired");
    }
  });

  it("returns 403 for invalid signature", async () => {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const timestamp = new Date().toISOString();

    // Sign with one key, register with a different address
    const otherKey = generatePrivateKey();
    const otherAccount = privateKeyToAccount(otherKey);
    const message = `Register ${getAddress(otherAccount.address)} with prim.sh at ${timestamp}`;
    const signature = await account.signMessage({ message }); // wrong signer

    const result = await registerWallet({
      address: otherAccount.address,
      signature,
      timestamp,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.code).toBe("invalid_signature");
    }
  });

  it("returns 409 for already registered address", async () => {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const timestamp = new Date().toISOString();
    const message = `Register ${getAddress(account.address)} with prim.sh at ${timestamp}`;
    const signature = await account.signMessage({ message });

    // First registration succeeds
    const first = await registerWallet({ address: account.address, signature, timestamp });
    expect(first.ok).toBe(true);

    // Second registration fails
    const timestamp2 = new Date().toISOString();
    const message2 = `Register ${getAddress(account.address)} with prim.sh at ${timestamp2}`;
    const signature2 = await account.signMessage({ message: message2 });
    const second = await registerWallet({ address: account.address, signature: signature2, timestamp: timestamp2 });

    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.status).toBe(409);
      expect(second.code).toBe("already_registered");
    }
  });
});

// ─── Ownership logic ──────────────────────────────────────────────────────

describe("Wallet ownership logic (via service)", () => {
  it("getWallet returns 403 when caller is not the owner", async () => {
    const { address } = registerTestWallet(CALLER);

    const result = await getWallet(address, OTHER_CALLER);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
    }
  });

  it("getWallet returns ok when caller is the owner", async () => {
    const { address } = registerTestWallet(CALLER);

    const result = await getWallet(address, CALLER);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.address).toBe(address);
      expect(result.data.balance).toBe("0.00");
    }
  });

  it("listWallets returns only wallets owned by caller", async () => {
    registerTestWallet(CALLER);
    registerTestWallet(OTHER_CALLER);

    const result = await listWallets(CALLER, 20);
    expect(result.wallets).toHaveLength(1);
  });
});

// ─── Deactivation ──────────────────────────────────────────────────────────

describe("Wallet deactivation", () => {
  it("deactivateWallet returns 200 with deactivatedAt timestamp", () => {
    const { address } = registerTestWallet(CALLER);

    const result = deactivateWallet(address, CALLER);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.deactivated).toBe(true);
      expect(typeof result.data.deactivatedAt).toBe("string");
      expect(result.data.address).toBe(address);
    }
  });

  it("getWallet returns 404 after deactivation", async () => {
    const { address } = registerTestWallet(CALLER);

    deactivateWallet(address, CALLER);
    const result = await getWallet(address, CALLER);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
    }
  });
});
