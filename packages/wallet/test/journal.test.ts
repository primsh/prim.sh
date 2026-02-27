/**
 * W-8 execution journal tests: tryClaim atomicity, events, dead letters, getExecutionsByWallet.
 *
 * sendUsdc was removed in W-10 (non-custodial refactor), so journal integration
 * tests only cover DB-level primitives.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";

process.env.WALLET_DB_PATH = ":memory:";

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
} from "../src/db.ts";
import { registerTestWallet } from "./helpers.ts";

// ─── Helpers ───────────────────────────────────────────────────────────────

const CALLER = "0xCa11e900000000000000000000000000000000001";
const OTHER_CALLER = "0xCa11e900000000000000000000000000000000002";

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
});

afterEach(() => {
  resetDb();
});

// ─── insertExecution creates with "queued" status ──────────────────────────

describe("insertExecution", () => {
  it("creates execution with queued status", () => {
    const { address } = registerTestWallet(CALLER);
    insertTestExecution("key_queued", address);

    const row = getExecution("key_queued");
    expect(row).not.toBeNull();
    expect(row?.status).toBe("queued");
  });
});

// ─── tryClaim ─────────────────────────────────────────────────────────────

describe("tryClaim", () => {
  it("returns true and sets status to running on queued execution", () => {
    const { address } = registerTestWallet(CALLER);
    insertTestExecution("key_claim1", address);

    const result = tryClaim("key_claim1");
    expect(result).toBe(true);

    const row = getExecution("key_claim1");
    expect(row?.status).toBe("running");
  });

  it("returns false when execution is already running", () => {
    const { address } = registerTestWallet(CALLER);
    insertTestExecution("key_claim2", address);
    tryClaim("key_claim2"); // first claim succeeds → running

    const result = tryClaim("key_claim2"); // second claim should fail
    expect(result).toBe(false);
  });

  it("returns false when execution is succeeded", () => {
    const { address } = registerTestWallet(CALLER);
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
    const { address } = registerTestWallet(CALLER);
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
    const { address } = registerTestWallet(CALLER);
    insertTestExecution("key_evt1", address);

    appendEvent("key_evt1", "balance_checked", { balance: "100.00" });

    const events = getEventsByExecution("key_evt1");
    expect(events).toHaveLength(1);
    expect(events[0]?.event_type).toBe("balance_checked");
    const payload = JSON.parse(events[0]?.payload ?? "{}") as { balance: string };
    expect(payload.balance).toBe("100.00");
  });

  it("stores multiple events in insertion order", () => {
    const { address } = registerTestWallet(CALLER);
    insertTestExecution("key_evt2", address);

    appendEvent("key_evt2", "balance_checked", { balance: "50.00" });
    appendEvent("key_evt2", "tx_sent", { to: "0xRecipient", amount: "10.00" });
    appendEvent("key_evt2", "tx_confirmed", { txHash: "0xabc" });

    const events = getEventsByExecution("key_evt2");
    expect(events).toHaveLength(3);
    expect(events[0]?.event_type).toBe("balance_checked");
    expect(events[1]?.event_type).toBe("tx_sent");
    expect(events[2]?.event_type).toBe("tx_confirmed");
  });

  it("stores event with no payload", () => {
    const { address } = registerTestWallet(CALLER);
    insertTestExecution("key_evt3", address);

    appendEvent("key_evt3", "noop_event");

    const events = getEventsByExecution("key_evt3");
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toBeNull();
  });

  it("returns empty array for execution with no events", () => {
    const { address } = registerTestWallet(CALLER);
    insertTestExecution("key_evt4", address);

    const events = getEventsByExecution("key_evt4");
    expect(events).toHaveLength(0);
  });
});

// ─── insertDeadLetter ─────────────────────────────────────────────────────

describe("insertDeadLetter", () => {
  it("stores a dead letter with reason and payload", () => {
    const { address } = registerTestWallet(CALLER);
    insertTestExecution("key_dl1", address);

    insertDeadLetter("key_dl1", "RPC timeout", { to: "0xRecipient", amount: "5.00" });

    const db = getDb();
    type DlRow = { execution_id: string; reason: string; payload: string };
    const row = db
      .query<DlRow, [string]>(
        "SELECT execution_id, reason, payload FROM dead_letters WHERE execution_id = ?",
      )
      .get("key_dl1");

    expect(row).not.toBeNull();
    expect(row?.reason).toBe("RPC timeout");
    const payload = JSON.parse(row?.payload ?? "{}") as { to: string; amount: string };
    expect(payload.to).toBe("0xRecipient");
  });

  it("stores a dead letter with null execution_id", () => {
    insertDeadLetter(null, "orphan error");

    const db = getDb();
    type DlNullRow = { execution_id: string | null; reason: string };
    const rows = db
      .query<DlNullRow, []>(
        "SELECT execution_id, reason FROM dead_letters WHERE execution_id IS NULL",
      )
      .all();

    expect(rows.length).toBeGreaterThanOrEqual(1);
    const dlRow = rows.find((r) => r.reason === "orphan error");
    expect(dlRow).toBeDefined();
    expect(dlRow?.execution_id).toBeNull();
  });
});

// ─── getExecutionsByWallet ─────────────────────────────────────────────────

describe("getExecutionsByWallet", () => {
  it("returns executions for the given wallet", () => {
    const { address } = registerTestWallet(CALLER);
    insertTestExecution("key_hist1", address);
    insertTestExecution("key_hist2", address);

    const rows = getExecutionsByWallet(address, 10);
    expect(rows.length).toBe(2);
    const keys = rows.map((r) => r.idempotency_key);
    expect(keys).toContain("key_hist1");
    expect(keys).toContain("key_hist2");
  });

  it("does not return executions from other wallets", () => {
    const { address: addr1 } = registerTestWallet(CALLER);
    const { address: addr2 } = registerTestWallet(OTHER_CALLER);
    insertTestExecution("key_othwallet", addr2);

    const rows = getExecutionsByWallet(addr1, 10);
    expect(rows.length).toBe(0);
  });

  it("respects limit", () => {
    const { address } = registerTestWallet(CALLER);
    for (let i = 0; i < 5; i++) {
      insertTestExecution(`key_limit_${i}`, address);
    }

    const rows = getExecutionsByWallet(address, 3);
    expect(rows).toHaveLength(3);
  });
});
