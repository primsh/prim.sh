/**
 * W-7 policy engine tests: CRUD, maxPerTx, maxPerDay, daily reset, pause/resume.
 *
 * IMPORTANT: env vars must be set before any module imports that touch keystore/db.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

const TEST_MASTER_KEY = "a".repeat(64);
process.env.WALLET_MASTER_KEY = TEST_MASTER_KEY;
process.env.WALLET_DB_PATH = ":memory:";

// ─── Hoist mock fns ───────────────────────────────────────────────────────

const { mockWriteContract, mockGetUsdcBalance } = vi.hoisted(() => ({
  mockWriteContract: vi.fn<[], Promise<`0x${string}`>>(),
  mockGetUsdcBalance: vi.fn<[string], Promise<{ balance: string; funded: boolean }>>(),
}));

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createWalletClient: vi.fn(() => ({
      writeContract: mockWriteContract,
    })),
  };
});

vi.mock("../src/balance.ts", () => ({
  getUsdcBalance: mockGetUsdcBalance,
}));

// Stub fetch for x402 middleware
vi.stubGlobal(
  "fetch",
  vi.fn(async (input: RequestInfo | URL) => {
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
  }),
);

import {
  resetDb,
  getDb,
  insertWallet,
  claimWallet,
  getPolicy,
  upsertPolicy,
  setPauseState,
  incrementDailySpent,
  resetDailySpentIfNeeded,
} from "../src/db.ts";
import { generateWallet, encryptPrivateKey } from "../src/keystore.ts";
import { sendUsdc, getSpendingPolicy, updateSpendingPolicy, pauseWallet, resumeWallet, listWallets, getWallet } from "../src/service.ts";
import { checkPolicy, recordSpend } from "../src/policy.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────

const CALLER = "0xCa11e900000000000000000000000000000000001";
const RECIPIENT = "0xRec1p1ent0000000000000000000000000000001";

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

// ─── Policy CRUD ──────────────────────────────────────────────────────────

describe("getSpendingPolicy — no policy set", () => {
  it("returns 200 with null limits and paused=false", () => {
    const { address } = makeWallet(CALLER);
    const result = getSpendingPolicy(address, CALLER);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.maxPerTx).toBeNull();
      expect(result.data.maxPerDay).toBeNull();
      expect(result.data.dailySpent).toBe("0.00");
      expect(result.data.allowedPrimitives).toBeNull();
    }
  });
});

describe("updateSpendingPolicy — set maxPerTx", () => {
  it("returns updated policy with maxPerTx", () => {
    const { address } = makeWallet(CALLER);
    const result = updateSpendingPolicy(address, CALLER, { maxPerTx: "50.00" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.maxPerTx).toBe("50.00");
      expect(result.data.maxPerDay).toBeNull();
    }
  });

  it("returns 400 for non-positive maxPerTx", () => {
    const { address } = makeWallet(CALLER);
    const result = updateSpendingPolicy(address, CALLER, { maxPerTx: "-10" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.code).toBe("invalid_request");
    }
  });
});

describe("updateSpendingPolicy — set maxPerDay", () => {
  it("returns updated policy with maxPerDay", () => {
    const { address } = makeWallet(CALLER);
    const result = updateSpendingPolicy(address, CALLER, { maxPerDay: "200.00" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.maxPerDay).toBe("200.00");
    }
  });
});

// ─── Policy enforcement — maxPerTx ───────────────────────────────────────

describe("sendUsdc — maxPerTx policy enforcement", () => {
  it("allows send within maxPerTx", async () => {
    const { address } = makeWallet(CALLER);
    upsertPolicy(address, { max_per_tx: "50.00" });
    mockGetUsdcBalance.mockResolvedValue({ balance: "100.00", funded: true });
    mockWriteContract.mockResolvedValue("0xTxHash" as `0x${string}`);

    const result = await sendUsdc(address, { to: RECIPIENT, amount: "30.00", idempotencyKey: "idk_within_tx" }, CALLER);
    expect(result.ok).toBe(true);
  });

  it("blocks send exceeding maxPerTx with 422 policy_violation", async () => {
    const { address } = makeWallet(CALLER);
    upsertPolicy(address, { max_per_tx: "50.00" });
    mockGetUsdcBalance.mockResolvedValue({ balance: "100.00", funded: true });

    const result = await sendUsdc(address, { to: RECIPIENT, amount: "60.00", idempotencyKey: "idk_exceed_tx" }, CALLER);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(422);
      expect(result.code).toBe("policy_violation");
    }
    expect(mockWriteContract).not.toHaveBeenCalled();
  });
});

// ─── Policy enforcement — maxPerDay ──────────────────────────────────────

describe("sendUsdc — maxPerDay policy enforcement", () => {
  it("blocks send when cumulative exceeds daily limit", async () => {
    const { address } = makeWallet(CALLER);
    upsertPolicy(address, { max_per_day: "100.00" });

    // Manually set daily_spent near the limit
    incrementDailySpent(address, "90.00");

    mockGetUsdcBalance.mockResolvedValue({ balance: "200.00", funded: true });

    const result = await sendUsdc(address, { to: RECIPIENT, amount: "20.00", idempotencyKey: "idk_exceed_day" }, CALLER);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(422);
      expect(result.code).toBe("policy_violation");
    }
    expect(mockWriteContract).not.toHaveBeenCalled();
  });

  it("allows send when cumulative is within daily limit", async () => {
    const { address } = makeWallet(CALLER);
    upsertPolicy(address, { max_per_day: "100.00" });
    incrementDailySpent(address, "50.00");
    mockGetUsdcBalance.mockResolvedValue({ balance: "200.00", funded: true });
    mockWriteContract.mockResolvedValue("0xTxHash2" as `0x${string}`);

    const result = await sendUsdc(address, { to: RECIPIENT, amount: "40.00", idempotencyKey: "idk_within_day" }, CALLER);
    expect(result.ok).toBe(true);
  });
});

// ─── Daily reset ──────────────────────────────────────────────────────────

describe("daily reset", () => {
  it("resets daily_spent to 0 after past reset time", () => {
    const { address } = makeWallet(CALLER);
    // Set daily_reset_at to past (yesterday)
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    upsertPolicy(address, { daily_spent: "80.00", daily_reset_at: yesterday });

    resetDailySpentIfNeeded(address);

    const p = getPolicy(address);
    expect(p?.daily_spent).toBe("0.00");
    // New reset time should be in the future
    expect(new Date(p?.daily_reset_at ?? "").getTime()).toBeGreaterThan(Date.now());
  });

  it("does not reset when reset time is in the future", () => {
    const { address } = makeWallet(CALLER);
    const future = new Date(Date.now() + 86400000).toISOString();
    upsertPolicy(address, { daily_spent: "80.00", daily_reset_at: future });

    resetDailySpentIfNeeded(address);

    const p = getPolicy(address);
    expect(p?.daily_spent).toBe("80.00");
  });
});

// ─── recordSpend ──────────────────────────────────────────────────────────

describe("recordSpend", () => {
  it("increments daily_spent after successful send", () => {
    const { address } = makeWallet(CALLER);
    upsertPolicy(address, { daily_spent: "10.00" });

    recordSpend(address, "25.00");

    const p = getPolicy(address);
    // 10.00 + 25.00 = 35.000000
    expect(Number.parseFloat(p?.daily_spent ?? "0")).toBeCloseTo(35, 4);
  });
});

// ─── Pause / Resume ───────────────────────────────────────────────────────

describe("pauseWallet + resumeWallet", () => {
  it("pauseWallet returns paused=true with given scope", () => {
    const { address } = makeWallet(CALLER);
    const result = pauseWallet(address, CALLER, "all");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.paused).toBe(true);
      expect(result.data.scope).toBe("all");
      expect(typeof result.data.pausedAt).toBe("string");
    }
  });

  it("sends blocked with 403 wallet_paused when paused", async () => {
    const { address } = makeWallet(CALLER);
    setPauseState(address, "all", new Date().toISOString());
    mockGetUsdcBalance.mockResolvedValue({ balance: "100.00", funded: true });

    const result = await sendUsdc(address, { to: RECIPIENT, amount: "10.00", idempotencyKey: "idk_paused" }, CALLER);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.code).toBe("wallet_paused");
    }
    expect(mockWriteContract).not.toHaveBeenCalled();
  });

  it("send blocked with scope=send", async () => {
    const { address } = makeWallet(CALLER);
    setPauseState(address, "send", new Date().toISOString());
    mockGetUsdcBalance.mockResolvedValue({ balance: "100.00", funded: true });

    const result = await sendUsdc(address, { to: RECIPIENT, amount: "10.00", idempotencyKey: "idk_paused_send" }, CALLER);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.code).toBe("wallet_paused");
    }
  });

  it("send NOT blocked when paused with scope=swap", async () => {
    const { address } = makeWallet(CALLER);
    setPauseState(address, "swap", new Date().toISOString());
    mockGetUsdcBalance.mockResolvedValue({ balance: "100.00", funded: true });
    mockWriteContract.mockResolvedValue("0xTxHashSwapPause" as `0x${string}`);

    const result = await sendUsdc(address, { to: RECIPIENT, amount: "10.00", idempotencyKey: "idk_swap_scope" }, CALLER);
    expect(result.ok).toBe(true);
  });

  it("resumeWallet clears pause state", () => {
    const { address } = makeWallet(CALLER);
    setPauseState(address, "all", new Date().toISOString());

    const result = resumeWallet(address, CALLER, "all");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.paused).toBe(false);
    }

    const p = getPolicy(address);
    expect(p?.pause_scope).toBeNull();
  });

  it("send succeeds after resume", async () => {
    const { address } = makeWallet(CALLER);
    setPauseState(address, "all", new Date().toISOString());
    resumeWallet(address, CALLER, "all");

    mockGetUsdcBalance.mockResolvedValue({ balance: "100.00", funded: true });
    mockWriteContract.mockResolvedValue("0xAfterResume" as `0x${string}`);

    const result = await sendUsdc(address, { to: RECIPIENT, amount: "10.00", idempotencyKey: "idk_after_resume" }, CALLER);
    expect(result.ok).toBe(true);
  });
});

// ─── Wallet detail / list show paused state ───────────────────────────────

describe("wallet detail and list reflect paused state", () => {
  it("getWallet shows paused=true when paused", async () => {
    const { address } = makeWallet(CALLER);
    mockGetUsdcBalance.mockResolvedValue({ balance: "0.00", funded: false });
    setPauseState(address, "all", new Date().toISOString());

    const result = await getWallet(address, CALLER);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.paused).toBe(true);
    }
  });

  it("getWallet shows paused=false when not paused", async () => {
    const { address } = makeWallet(CALLER);
    mockGetUsdcBalance.mockResolvedValue({ balance: "0.00", funded: false });

    const result = await getWallet(address, CALLER);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.paused).toBe(false);
    }
  });

  it("listWallets shows paused=true for paused wallet", async () => {
    const { address } = makeWallet(CALLER);
    mockGetUsdcBalance.mockResolvedValue({ balance: "0.00", funded: false });
    setPauseState(address, "send", new Date().toISOString());

    const result = await listWallets(CALLER, 20);
    expect(result.wallets).toHaveLength(1);
    expect(result.wallets[0].paused).toBe(true);
  });

  it("listWallets shows paused=false for active wallet", async () => {
    const { address: _addr } = makeWallet(CALLER);
    mockGetUsdcBalance.mockResolvedValue({ balance: "0.00", funded: false });

    const result = await listWallets(CALLER, 20);
    expect(result.wallets[0].paused).toBe(false);
  });

  it("getWallet shows policy when set", async () => {
    const { address } = makeWallet(CALLER);
    mockGetUsdcBalance.mockResolvedValue({ balance: "0.00", funded: false });
    upsertPolicy(address, { max_per_tx: "100.00", max_per_day: "500.00" });

    const result = await getWallet(address, CALLER);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.policy).not.toBeNull();
      expect(result.data.policy?.maxPerTx).toBe("100.00");
      expect(result.data.policy?.maxPerDay).toBe("500.00");
    }
  });
});
