/**
 * W-7 policy engine tests: CRUD, daily reset, pause/resume, wallet detail/list showing policy state.
 *
 * sendUsdc enforcement tests removed in W-10 (non-custodial refactor).
 * Policy engine still exists for agent-side spending visibility.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

process.env.WALLET_DB_PATH = ":memory:";

// ─── Hoist mock fns ───────────────────────────────────────────────────────

const { mockGetUsdcBalance } = vi.hoisted(() => ({
  mockGetUsdcBalance: vi.fn<[string], Promise<{ balance: string; funded: boolean }>>(),
}));

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
  getPolicy,
  upsertPolicy,
  setPauseState,
  incrementDailySpent,
  resetDailySpentIfNeeded,
} from "../src/db.ts";
import { getSpendingPolicy, updateSpendingPolicy, pauseWallet, resumeWallet, listWallets, getWallet } from "../src/service.ts";
import { recordSpend } from "../src/policy.ts";
import { registerTestWallet } from "./helpers.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────

const CALLER = "0xCa11e900000000000000000000000000000000001";

beforeEach(() => {
  resetDb();
  mockGetUsdcBalance.mockReset();
});

afterEach(() => {
  resetDb();
});

// ─── Policy CRUD ──────────────────────────────────────────────────────────

describe("getSpendingPolicy — no policy set", () => {
  it("returns 200 with null limits and paused=false", () => {
    const { address } = registerTestWallet(CALLER);
    const result = getSpendingPolicy(address, CALLER);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.max_per_tx).toBeNull();
      expect(result.data.max_per_day).toBeNull();
      expect(result.data.daily_spent).toBe("0.00");
      expect(result.data.allowed_primitives).toBeNull();
    }
  });
});

describe("updateSpendingPolicy — set maxPerTx", () => {
  it("returns updated policy with maxPerTx", () => {
    const { address } = registerTestWallet(CALLER);
    const result = updateSpendingPolicy(address, CALLER, { maxPerTx: "50.00" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.max_per_tx).toBe("50.00");
      expect(result.data.max_per_day).toBeNull();
    }
  });

  it("returns 400 for non-positive maxPerTx", () => {
    const { address } = registerTestWallet(CALLER);
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
    const { address } = registerTestWallet(CALLER);
    const result = updateSpendingPolicy(address, CALLER, { maxPerDay: "200.00" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.max_per_day).toBe("200.00");
    }
  });
});

// ─── Daily reset ──────────────────────────────────────────────────────────

describe("daily reset", () => {
  it("resets daily_spent to 0 after past reset time", () => {
    const { address } = registerTestWallet(CALLER);
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
    const { address } = registerTestWallet(CALLER);
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
    const { address } = registerTestWallet(CALLER);
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
    const { address } = registerTestWallet(CALLER);
    const result = pauseWallet(address, CALLER, "all");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.paused).toBe(true);
      expect(result.data.scope).toBe("all");
      expect(typeof result.data.paused_at).toBe("string");
    }
  });

  it("resumeWallet clears pause state", () => {
    const { address } = registerTestWallet(CALLER);
    setPauseState(address, "all", new Date().toISOString());

    const result = resumeWallet(address, CALLER, "all");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.paused).toBe(false);
    }

    const p = getPolicy(address);
    expect(p?.pause_scope).toBeNull();
  });
});

// ─── Wallet detail / list show paused state ───────────────────────────────

describe("wallet detail and list reflect paused state", () => {
  it("getWallet shows paused=true when paused", async () => {
    const { address } = registerTestWallet(CALLER);
    mockGetUsdcBalance.mockResolvedValue({ balance: "0.00", funded: false });
    setPauseState(address, "all", new Date().toISOString());

    const result = await getWallet(address, CALLER);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.paused).toBe(true);
    }
  });

  it("getWallet shows paused=false when not paused", async () => {
    const { address } = registerTestWallet(CALLER);
    mockGetUsdcBalance.mockResolvedValue({ balance: "0.00", funded: false });

    const result = await getWallet(address, CALLER);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.paused).toBe(false);
    }
  });

  it("listWallets shows paused=true for paused wallet", async () => {
    const { address } = registerTestWallet(CALLER);
    mockGetUsdcBalance.mockResolvedValue({ balance: "0.00", funded: false });
    setPauseState(address, "send", new Date().toISOString());

    const result = await listWallets(CALLER, 20);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].paused).toBe(true);
  });

  it("listWallets shows paused=false for active wallet", async () => {
    const { address: _addr } = registerTestWallet(CALLER);
    mockGetUsdcBalance.mockResolvedValue({ balance: "0.00", funded: false });

    const result = await listWallets(CALLER, 20);
    expect(result.data[0].paused).toBe(false);
  });

  it("getWallet shows policy when set", async () => {
    const { address } = registerTestWallet(CALLER);
    mockGetUsdcBalance.mockResolvedValue({ balance: "0.00", funded: false });
    upsertPolicy(address, { max_per_tx: "100.00", max_per_day: "500.00" });

    const result = await getWallet(address, CALLER);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.policy).not.toBeNull();
      expect(result.data.policy?.max_per_tx).toBe("100.00");
      expect(result.data.policy?.max_per_day).toBe("500.00");
    }
  });
});

// ─── HRD-4: corrupted JSON safety ──────────────────────────────────────

describe("policyRowToResponse — corrupted allowed_primitives JSON", () => {
  it("returns allowed_primitives: null and warns on invalid JSON", () => {
    const { address } = registerTestWallet(CALLER);
    upsertPolicy(address, { allowed_primitives: "not-json{" });

    const writtenLines: string[] = [];
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      writtenLines.push(String(chunk));
      return true;
    });

    const result = getSpendingPolicy(address, CALLER);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.allowed_primitives).toBeNull();
    }
    expect(writtenLines.some((line) => line.includes("corrupted allowed_primitives JSON"))).toBe(true);

    stdoutSpy.mockRestore();
  });

  it("returns valid allowedPrimitives when JSON is well-formed", () => {
    const { address } = registerTestWallet(CALLER);
    upsertPolicy(address, { allowed_primitives: JSON.stringify(["email.sh", "spawn.sh"]) });

    const result = getSpendingPolicy(address, CALLER);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.allowed_primitives).toEqual(["email.sh", "spawn.sh"]);
    }
  });
});
