/**
 * W-4 send endpoint tests: USDC transfer, idempotency, ownership, balance checks.
 *
 * IMPORTANT: env vars must be set before any module imports that touch keystore/db.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

// Set master key and in-memory DB before any imports
const TEST_MASTER_KEY = "a".repeat(64); // 32 bytes as hex
process.env.WALLET_MASTER_KEY = TEST_MASTER_KEY;
process.env.WALLET_DB_PATH = ":memory:";

// ─── Hoist mock fns so vi.mock factories can reference them ───────────────

const { mockWriteContract, mockGetUsdcBalance } = vi.hoisted(() => ({
  mockWriteContract: vi.fn<[], Promise<`0x${string}`>>(),
  mockGetUsdcBalance: vi.fn<[string], Promise<{ balance: string; funded: boolean }>>(),
}));

// ─── Mock viem wallet client ───────────────────────────────────────────────

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createWalletClient: vi.fn(() => ({
      writeContract: mockWriteContract,
    })),
  };
});

// ─── Mock balance check ────────────────────────────────────────────────────

vi.mock("../src/balance.ts", () => ({
  getUsdcBalance: mockGetUsdcBalance,
}));

// ─── Mock fetch for x402 middleware ───────────────────────────────────────

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

// Import modules after mocks are set up
import { resetDb, getDb, insertWallet, claimWallet } from "../src/db.ts";
import { generateWallet, encryptPrivateKey } from "../src/keystore.ts";
import { sendUsdc } from "../src/service.ts";

// ─── Test helpers ─────────────────────────────────────────────────────────

const CALLER = "0xCa11e900000000000000000000000000000000001";
const OTHER_CALLER = "0xCa11e900000000000000000000000000000000002";
const RECIPIENT = "0xRecipient0000000000000000000000000000001";

function makeWallet(owner?: string): { address: string; claimToken: string } {
  const { address, privateKey } = generateWallet();
  const encryptedKey = encryptPrivateKey(privateKey);
  const claimToken = `ctk_${"a".repeat(64)}`;
  insertWallet({ address, chain: "eip155:8453", encryptedKey, claimToken });
  if (owner) {
    claimWallet(address, claimToken, owner);
  }
  return { address, claimToken };
}

beforeEach(() => {
  resetDb();
  mockWriteContract.mockReset();
  mockGetUsdcBalance.mockReset();
});

afterEach(() => {
  resetDb();
});

// ─── Successful send ───────────────────────────────────────────────────────

describe("sendUsdc — successful send", () => {
  it("returns 200 with txHash and status pending", async () => {
    const { address } = makeWallet(CALLER);
    mockGetUsdcBalance.mockResolvedValue({ balance: "100.00", funded: true });
    mockWriteContract.mockResolvedValue("0xTxHash123");

    const result = await sendUsdc(
      address,
      { to: RECIPIENT, amount: "10.00", idempotencyKey: "idk_1" },
      CALLER,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.txHash).toBe("0xTxHash123");
      expect(result.data.status).toBe("pending");
      expect(result.data.from).toBe(address);
      expect(result.data.to).toBe(RECIPIENT);
      expect(result.data.amount).toBe("10.00");
      expect(result.data.confirmedAt).toBeNull();
    }
  });

  it("records execution in DB as succeeded", async () => {
    const { address } = makeWallet(CALLER);
    mockGetUsdcBalance.mockResolvedValue({ balance: "50.00", funded: true });
    mockWriteContract.mockResolvedValue("0xTxHash456");

    await sendUsdc(
      address,
      { to: RECIPIENT, amount: "5.00", idempotencyKey: "idk_journal" },
      CALLER,
    );

    const db = getDb();
    const row = db
      .query<{ status: string; result: string }, [string]>(
        "SELECT status, result FROM executions WHERE idempotency_key = ?",
      )
      .get("idk_journal");

    expect(row).not.toBeNull();
    expect(row?.status).toBe("succeeded");
    const parsed = JSON.parse(String(row?.result ?? "{}")) as { txHash: string };
    expect(parsed.txHash).toBe("0xTxHash456");
  });
});

// ─── Insufficient balance ──────────────────────────────────────────────────

describe("sendUsdc — insufficient balance", () => {
  it("returns 422 insufficient_balance when balance < amount", async () => {
    const { address } = makeWallet(CALLER);
    mockGetUsdcBalance.mockResolvedValue({ balance: "5.00", funded: true });

    const result = await sendUsdc(
      address,
      { to: RECIPIENT, amount: "10.00", idempotencyKey: "idk_insuf" },
      CALLER,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(422);
      expect(result.code).toBe("insufficient_balance");
    }
    expect(mockWriteContract).not.toHaveBeenCalled();
  });
});

// ─── Ownership checks ──────────────────────────────────────────────────────

describe("sendUsdc — ownership", () => {
  it("returns 403 forbidden when caller is not the owner", async () => {
    const { address } = makeWallet(CALLER);
    mockGetUsdcBalance.mockResolvedValue({ balance: "100.00", funded: true });

    const result = await sendUsdc(
      address,
      { to: RECIPIENT, amount: "10.00", idempotencyKey: "idk_notowner" },
      OTHER_CALLER,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.code).toBe("forbidden");
    }
  });

  it("returns 404 when wallet does not exist", async () => {
    const result = await sendUsdc(
      "0xDeadBeef00000000000000000000000000000001",
      { to: RECIPIENT, amount: "10.00", idempotencyKey: "idk_notwallet" },
      CALLER,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.code).toBe("not_found");
    }
  });

  it("returns 403 for unclaimed wallet", async () => {
    const { address } = makeWallet(); // no owner
    const result = await sendUsdc(
      address,
      { to: RECIPIENT, amount: "10.00", idempotencyKey: "idk_unclaimed" },
      CALLER,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.code).toBe("forbidden");
    }
  });
});

// ─── Idempotency ───────────────────────────────────────────────────────────

describe("sendUsdc — idempotency", () => {
  it("replays same key + same payload → returns cached txHash", async () => {
    const { address } = makeWallet(CALLER);
    mockGetUsdcBalance.mockResolvedValue({ balance: "100.00", funded: true });
    mockWriteContract.mockResolvedValue("0xOriginalTxHash");

    const first = await sendUsdc(
      address,
      { to: RECIPIENT, amount: "10.00", idempotencyKey: "idk_replay" },
      CALLER,
    );

    expect(first.ok).toBe(true);

    // Second call — writeContract should NOT be called again
    mockWriteContract.mockReset();
    const second = await sendUsdc(
      address,
      { to: RECIPIENT, amount: "10.00", idempotencyKey: "idk_replay" },
      CALLER,
    );

    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.data.txHash).toBe("0xOriginalTxHash");
    }
    expect(mockWriteContract).not.toHaveBeenCalled();
  });

  it("same key + different payload → 409 duplicate_request", async () => {
    const { address } = makeWallet(CALLER);
    mockGetUsdcBalance.mockResolvedValue({ balance: "100.00", funded: true });
    mockWriteContract.mockResolvedValue("0xFirstTxHash");

    await sendUsdc(
      address,
      { to: RECIPIENT, amount: "10.00", idempotencyKey: "idk_conflict" },
      CALLER,
    );

    const result = await sendUsdc(
      address,
      { to: RECIPIENT, amount: "20.00", idempotencyKey: "idk_conflict" }, // different amount
      CALLER,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.code).toBe("duplicate_request");
    }
  });
});

// ─── RPC failure ───────────────────────────────────────────────────────────

describe("sendUsdc — RPC failure", () => {
  it("returns 502 rpc_error and marks execution failed when writeContract throws", async () => {
    const { address } = makeWallet(CALLER);
    mockGetUsdcBalance.mockResolvedValue({ balance: "100.00", funded: true });
    mockWriteContract.mockRejectedValue(new Error("RPC timeout"));

    const result = await sendUsdc(
      address,
      { to: RECIPIENT, amount: "5.00", idempotencyKey: "idk_rpcfail" },
      CALLER,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(502);
      expect(result.code).toBe("rpc_error");
    }

    // Execution journal should record failure
    const db = getDb();
    const row = db
      .query<{ status: string }, [string]>(
        "SELECT status FROM executions WHERE idempotency_key = ?",
      )
      .get("idk_rpcfail");
    expect(row?.status).toBe("failed");
  });
});

// ─── Input validation (via service) ───────────────────────────────────────

describe("sendUsdc — amount validation", () => {
  it("returns 400 when amount is zero", async () => {
    const { address } = makeWallet(CALLER);
    mockGetUsdcBalance.mockResolvedValue({ balance: "100.00", funded: true });

    const result = await sendUsdc(
      address,
      { to: RECIPIENT, amount: "0", idempotencyKey: "idk_zeroamt" },
      CALLER,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.code).toBe("invalid_request");
    }
  });

  it("returns 400 when amount is negative", async () => {
    const { address } = makeWallet(CALLER);
    mockGetUsdcBalance.mockResolvedValue({ balance: "100.00", funded: true });

    const result = await sendUsdc(
      address,
      { to: RECIPIENT, amount: "-5.00", idempotencyKey: "idk_negamt" },
      CALLER,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.code).toBe("invalid_request");
    }
  });
});
