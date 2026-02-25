/**
 * W-8 execution journal tests: tryClaim atomicity, events, dead letters, history endpoint.
 *
 * IMPORTANT: env vars must be set before any module imports that touch keystore/db.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

// Set master key and in-memory DB before any imports
const TEST_MASTER_KEY = "a".repeat(64); // 32 bytes as hex
process.env.WALLET_MASTER_KEY = TEST_MASTER_KEY;
process.env.WALLET_DB_PATH = ":memory:";

// ─── Hoist mock fns ────────────────────────────────────────────────────────

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

import {
  resetDb,
  getDb,
  insertExecution,
  getExecution,
  completeExecution,
  tryClaim,
  markAborted,
  appendEvent,
  getEventsByExecution,
  insertDeadLetter,
  getExecutionsByWallet,
  insertWallet,
  claimWallet,
} from "../src/db.ts";
import { generateWallet, encryptPrivateKey } from "../src/keystore.ts";
import { sendUsdc, getTransactionHistory } from "../src/service.ts";

// ─── Helpers ───────────────────────────────────────────────────────────────

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

function insertTestExecution(key: string, walletAddress: string) {
  insertExecution({
    idempotencyKey: key,
    walletAddress,
    actionType: "send",
    payloadHash: "abc123",
  });
}

beforeEach(() => {
  resetDb();
  mockWriteContract.mockReset();
  mockGetUsdcBalance.mockReset();
});

afterEach(() => {
  resetDb();
});

// ─── insertExecution creates with "queued" status ──────────────────────────

describe("insertExecution", () => {
  it("creates execution with queued status", () => {
    const { address } = makeWallet(CALLER);
    insertTestExecution("key_queued", address);

    const row = getExecution("key_queued");
    expect(row).not.toBeNull();
    expect(row?.status).toBe("queued");
  });
});

// ─── tryClaim ─────────────────────────────────────────────────────────────

describe("tryClaim", () => {
  it("returns true and sets status to running on queued execution", () => {
    const { address } = makeWallet(CALLER);
    insertTestExecution("key_claim1", address);

    const result = tryClaim("key_claim1");
    expect(result).toBe(true);

    const row = getExecution("key_claim1");
    expect(row?.status).toBe("running");
  });

  it("returns false when execution is already running", () => {
    const { address } = makeWallet(CALLER);
    insertTestExecution("key_claim2", address);
    tryClaim("key_claim2"); // first claim succeeds → running

    const result = tryClaim("key_claim2"); // second claim should fail
    expect(result).toBe(false);
  });

  it("returns false when execution is succeeded", () => {
    const { address } = makeWallet(CALLER);
    insertTestExecution("key_claim3", address);
    tryClaim("key_claim3");
    completeExecution("key_claim3", "succeeded", JSON.stringify({ txHash: "0xabc" }));

    const result = tryClaim("key_claim3");
    expect(result).toBe(false);
  });

  it("returns false for nonexistent key", () => {
    const result = tryClaim("key_nonexistent");
    expect(result).toBe(false);
  });
});

// ─── markAborted ──────────────────────────────────────────────────────────

describe("markAborted", () => {
  it("sets status to aborted with reason", () => {
    const { address } = makeWallet(CALLER);
    insertTestExecution("key_abort", address);
    tryClaim("key_abort");

    markAborted("key_abort", "network failure");

    const row = getExecution("key_abort");
    expect(row?.status).toBe("aborted");
    const result = JSON.parse(row?.result ?? "{}") as { reason: string };
    expect(result.reason).toBe("network failure");
  });
});

// ─── appendEvent + getEventsByExecution ───────────────────────────────────

describe("appendEvent / getEventsByExecution", () => {
  it("stores an event retrievable by execution ID", () => {
    const { address } = makeWallet(CALLER);
    insertTestExecution("key_evt1", address);

    appendEvent("key_evt1", "balance_checked", { balance: "100.00" });

    const events = getEventsByExecution("key_evt1");
    expect(events).toHaveLength(1);
    expect(events[0]?.event_type).toBe("balance_checked");
    const payload = JSON.parse(events[0]?.payload ?? "{}") as { balance: string };
    expect(payload.balance).toBe("100.00");
  });

  it("stores multiple events in insertion order", () => {
    const { address } = makeWallet(CALLER);
    insertTestExecution("key_evt2", address);

    appendEvent("key_evt2", "balance_checked", { balance: "50.00" });
    appendEvent("key_evt2", "tx_sent", { to: RECIPIENT, amount: "10.00" });
    appendEvent("key_evt2", "tx_confirmed", { txHash: "0xabc" });

    const events = getEventsByExecution("key_evt2");
    expect(events).toHaveLength(3);
    expect(events[0]?.event_type).toBe("balance_checked");
    expect(events[1]?.event_type).toBe("tx_sent");
    expect(events[2]?.event_type).toBe("tx_confirmed");
  });

  it("stores event with no payload", () => {
    const { address } = makeWallet(CALLER);
    insertTestExecution("key_evt3", address);

    appendEvent("key_evt3", "noop_event");

    const events = getEventsByExecution("key_evt3");
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toBeNull();
  });

  it("returns empty array for execution with no events", () => {
    const { address } = makeWallet(CALLER);
    insertTestExecution("key_evt4", address);

    const events = getEventsByExecution("key_evt4");
    expect(events).toHaveLength(0);
  });
});

// ─── insertDeadLetter ─────────────────────────────────────────────────────

describe("insertDeadLetter", () => {
  it("stores a dead letter with reason and payload", () => {
    const { address } = makeWallet(CALLER);
    insertTestExecution("key_dl1", address);

    insertDeadLetter("key_dl1", "RPC timeout", { to: RECIPIENT, amount: "5.00" });

    const db = getDb();
    type DlRow = { execution_id: string; reason: string; payload: string };
    const row = db
      .query<DlRow, [string]>(
        "SELECT execution_id, reason, payload FROM dead_letters WHERE execution_id = ?",
      )
      .get<DlRow>("key_dl1");

    expect(row).not.toBeNull();
    expect(row?.reason).toBe("RPC timeout");
    const payload = JSON.parse(row?.payload ?? "{}") as { to: string; amount: string };
    expect(payload.to).toBe(RECIPIENT);
  });

  it("stores a dead letter with null execution_id", () => {
    insertDeadLetter(null, "orphan error");

    const db = getDb();
    type DlNullRow = { execution_id: string | null; reason: string };
    const rows = db
      .query<DlNullRow, []>(
        "SELECT execution_id, reason FROM dead_letters WHERE execution_id IS NULL",
      )
      .all<DlNullRow>();

    expect(rows.length).toBeGreaterThanOrEqual(1);
    const dlRow = rows.find((r) => r.reason === "orphan error");
    expect(dlRow).toBeDefined();
    expect(dlRow?.execution_id).toBeNull();
  });
});

// ─── sendUsdc journal integration ─────────────────────────────────────────

describe("sendUsdc — journal events", () => {
  it("creates balance_checked, tx_sent, tx_confirmed events on success", async () => {
    const { address } = makeWallet(CALLER);
    mockGetUsdcBalance.mockResolvedValue({ balance: "100.00", funded: true });
    mockWriteContract.mockResolvedValue("0xJournalTx1");

    const result = await sendUsdc(
      address,
      { to: RECIPIENT, amount: "10.00", idempotencyKey: "idk_journal_evt" },
      CALLER,
    );

    expect(result.ok).toBe(true);

    const events = getEventsByExecution("idk_journal_evt");
    const types = events.map((e) => e.event_type);
    expect(types).toContain("balance_checked");
    expect(types).toContain("tx_sent");
    expect(types).toContain("tx_confirmed");
  });

  it("creates balance_checked, tx_sent, tx_failed events on RPC failure", async () => {
    const { address } = makeWallet(CALLER);
    mockGetUsdcBalance.mockResolvedValue({ balance: "100.00", funded: true });
    mockWriteContract.mockRejectedValue(new Error("RPC timeout"));

    await sendUsdc(
      address,
      { to: RECIPIENT, amount: "5.00", idempotencyKey: "idk_journal_fail" },
      CALLER,
    );

    const events = getEventsByExecution("idk_journal_fail");
    const types = events.map((e) => e.event_type);
    expect(types).toContain("balance_checked");
    expect(types).toContain("tx_sent");
    expect(types).toContain("tx_failed");
    expect(types).not.toContain("tx_confirmed");
  });

  it("inserts dead letter on RPC failure", async () => {
    const { address } = makeWallet(CALLER);
    mockGetUsdcBalance.mockResolvedValue({ balance: "100.00", funded: true });
    mockWriteContract.mockRejectedValue(new Error("connection refused"));

    await sendUsdc(
      address,
      { to: RECIPIENT, amount: "5.00", idempotencyKey: "idk_deadletter" },
      CALLER,
    );

    const db = getDb();
    const row = db
      .query<{ execution_id: string; reason: string }, [string]>(
        "SELECT execution_id, reason FROM dead_letters WHERE execution_id = ?",
      )
      .get("idk_deadletter");

    expect(row).not.toBeNull();
    expect(row?.reason).toContain("connection refused");
  });

  it("execution status is succeeded after successful send", async () => {
    const { address } = makeWallet(CALLER);
    mockGetUsdcBalance.mockResolvedValue({ balance: "100.00", funded: true });
    mockWriteContract.mockResolvedValue("0xSuccessTx");

    await sendUsdc(
      address,
      { to: RECIPIENT, amount: "1.00", idempotencyKey: "idk_status_check" },
      CALLER,
    );

    const db = getDb();
    const row = db
      .query<{ status: string }, [string]>("SELECT status FROM executions WHERE idempotency_key = ?")
      .get("idk_status_check");

    expect(row?.status).toBe("succeeded");
  });
});

// ─── getExecutionsByWallet ─────────────────────────────────────────────────

describe("getExecutionsByWallet", () => {
  it("returns executions for the given wallet", () => {
    const { address } = makeWallet(CALLER);
    insertTestExecution("key_hist1", address);
    insertTestExecution("key_hist2", address);

    const rows = getExecutionsByWallet(address, 10);
    expect(rows.length).toBe(2);
    const keys = rows.map((r) => r.idempotency_key);
    expect(keys).toContain("key_hist1");
    expect(keys).toContain("key_hist2");
  });

  it("does not return executions from other wallets", () => {
    const { address: addr1 } = makeWallet(CALLER);
    const { address: addr2 } = makeWallet(OTHER_CALLER);
    insertTestExecution("key_othwallet", addr2);

    const rows = getExecutionsByWallet(addr1, 10);
    expect(rows.length).toBe(0);
  });

  it("respects limit", () => {
    const { address } = makeWallet(CALLER);
    for (let i = 0; i < 5; i++) {
      insertTestExecution(`key_limit_${i}`, address);
    }

    const rows = getExecutionsByWallet(address, 3);
    expect(rows).toHaveLength(3);
  });
});

// ─── getTransactionHistory service function ───────────────────────────────

describe("getTransactionHistory", () => {
  it("returns empty transactions for wallet with no history", () => {
    const { address } = makeWallet(CALLER);

    const result = getTransactionHistory(address, CALLER, 20);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.transactions).toHaveLength(0);
      expect(result.data.cursor).toBeNull();
    }
  });

  it("returns 403 for wrong owner", () => {
    const { address } = makeWallet(CALLER);

    const result = getTransactionHistory(address, OTHER_CALLER, 20);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
    }
  });

  it("returns 404 for nonexistent wallet", () => {
    const result = getTransactionHistory(
      "0xDeadBeef00000000000000000000000000000001",
      CALLER,
      20,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
    }
  });

  it("returns transactions after a successful send", async () => {
    const { address } = makeWallet(CALLER);
    mockGetUsdcBalance.mockResolvedValue({ balance: "100.00", funded: true });
    mockWriteContract.mockResolvedValue("0xHistTx1");

    await sendUsdc(
      address,
      { to: RECIPIENT, amount: "10.00", idempotencyKey: "idk_hist_svc" },
      CALLER,
    );

    const result = getTransactionHistory(address, CALLER, 20);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.transactions).toHaveLength(1);
      expect(result.data.transactions[0]?.txHash).toBe("0xHistTx1");
    }
  });

  it("returns cursor when results fill limit", async () => {
    const { address } = makeWallet(CALLER);
    mockGetUsdcBalance.mockResolvedValue({ balance: "999.00", funded: true });

    for (let i = 0; i < 3; i++) {
      mockWriteContract.mockResolvedValue(`0xPagTx${i}` as `0x${string}`);
      await sendUsdc(
        address,
        { to: RECIPIENT, amount: "1.00", idempotencyKey: `idk_page_svc_${i}` },
        CALLER,
      );
    }

    const result = getTransactionHistory(address, CALLER, 2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.transactions).toHaveLength(2);
      expect(result.data.cursor).not.toBeNull();
    }
  });
});

