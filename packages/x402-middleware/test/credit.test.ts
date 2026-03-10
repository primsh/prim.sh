// SPDX-License-Identifier: Apache-2.0
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCreditLedger } from "../src/credit.ts";
import type { CreditLedger } from "../src/types.ts";

let tempDir: string;
let ledger: CreditLedger;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "prim-credit-test-"));
  ledger = createCreditLedger(join(tempDir, "credit.db"));
});

afterEach(() => {
  ledger.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("credit ledger", () => {
  // ── getBalance ──────────────────────────────────────────────────────────────
  it("returns zero for unknown wallet", () => {
    expect(ledger.getBalance("0xabc")).toBe("0.000000");
  });

  // ── addCredit ───────────────────────────────────────────────────────────────
  it("adds credit and updates balance", () => {
    ledger.addCredit("0xABC", "0.005");
    expect(ledger.getBalance("0xabc")).toBe("0.005000");
  });

  it("accumulates multiple credits", () => {
    ledger.addCredit("0xabc", "0.003");
    ledger.addCredit("0xabc", "0.002");
    expect(ledger.getBalance("0xabc")).toBe("0.005000");
  });

  // ── deductCredit ────────────────────────────────────────────────────────────
  it("deducts credit from positive balance", () => {
    ledger.addCredit("0xabc", "0.010");
    ledger.deductCredit("0xabc", "0.004");
    expect(ledger.getBalance("0xabc")).toBe("0.006000");
  });

  it("allows balance to go negative", () => {
    ledger.deductCredit("0xabc", "0.030");
    const balance = Number.parseFloat(ledger.getBalance("0xabc"));
    expect(balance).toBeLessThan(0);
  });

  it("caps negative balance at negativeCap", () => {
    const capped = createCreditLedger(join(tempDir, "capped.db"), {
      negativeCap: "0.05",
    });
    capped.deductCredit("0xabc", "0.100");
    expect(capped.getBalance("0xabc")).toBe("-0.050000");
    capped.close();
  });

  // ── settle ──────────────────────────────────────────────────────────────────
  it("credits wallet when estimated > actual (overpayment)", () => {
    ledger.settle("0xabc", "0.010", "0.006", "req-1");
    expect(ledger.getBalance("0xabc")).toBe("0.004000");
  });

  it("debits wallet when estimated < actual (underpayment)", () => {
    ledger.addCredit("0xabc", "0.010");
    ledger.settle("0xabc", "0.006", "0.010", "req-2");
    expect(ledger.getBalance("0xabc")).toBe("0.006000");
  });

  it("no-ops when estimated === actual", () => {
    ledger.settle("0xabc", "0.010", "0.010");
    expect(ledger.getBalance("0xabc")).toBe("0.000000");
  });

  // ── getHistory ──────────────────────────────────────────────────────────────
  it("records transaction history", () => {
    ledger.addCredit("0xabc", "0.005", "req-1");
    ledger.deductCredit("0xabc", "0.002", "req-2");

    const history = ledger.getHistory("0xabc");
    expect(history).toHaveLength(2);
    expect(history[0].reason).toBe("debit");
    expect(history[0].request_id).toBe("req-2");
    expect(history[1].reason).toBe("credit");
    expect(history[1].request_id).toBe("req-1");
  });

  it("limits history results", () => {
    for (let i = 0; i < 10; i++) {
      ledger.addCredit("0xabc", "0.001", `req-${i}`);
    }
    const history = ledger.getHistory("0xabc", 3);
    expect(history).toHaveLength(3);
  });

  // ── expireInactive ──────────────────────────────────────────────────────────
  it("does not expire recently active wallets", () => {
    ledger.addCredit("0xabc", "0.010");
    const expired = ledger.expireInactive(30);
    expect(expired).toBe(0);
    expect(ledger.getBalance("0xabc")).toBe("0.010000");
  });

  // ── wallet address normalization ────────────────────────────────────────────
  it("normalizes wallet addresses to lowercase", () => {
    ledger.addCredit("0xABCDEF", "0.005");
    expect(ledger.getBalance("0xabcdef")).toBe("0.005000");
    expect(ledger.getBalance("0xABCDEF")).toBe("0.005000");
  });

  // ── concurrent access ──────────────────────────────────────────────────────
  it("handles sequential settle calls for same wallet", () => {
    ledger.settle("0xabc", "0.010", "0.006", "req-1");
    ledger.settle("0xabc", "0.010", "0.008", "req-2");
    // 0.004 + 0.002 = 0.006
    expect(ledger.getBalance("0xabc")).toBe("0.006000");
  });

  // ── negative cap edge cases ─────────────────────────────────────────────────
  it("rejects further deductions at negative cap", () => {
    const capped = createCreditLedger(join(tempDir, "cap-edge.db"), {
      negativeCap: "0.05",
    });
    capped.deductCredit("0xabc", "0.050");
    expect(capped.getBalance("0xabc")).toBe("-0.050000");

    // Second deduction should not go below cap
    capped.deductCredit("0xabc", "0.010");
    expect(capped.getBalance("0xabc")).toBe("-0.050000");
    capped.close();
  });

  it("allows partial deduction when near negative cap", () => {
    const capped = createCreditLedger(join(tempDir, "cap-partial.db"), {
      negativeCap: "0.05",
    });
    capped.deductCredit("0xabc", "0.030");
    expect(capped.getBalance("0xabc")).toBe("-0.030000");

    // Request 0.040 more but only 0.020 should be deducted (to reach -0.050)
    capped.deductCredit("0xabc", "0.040");
    expect(capped.getBalance("0xabc")).toBe("-0.050000");
    capped.close();
  });

  it("accepts request after partial repayment from negative cap", () => {
    const capped = createCreditLedger(join(tempDir, "cap-repay.db"), {
      negativeCap: "0.05",
    });
    capped.deductCredit("0xabc", "0.050");
    expect(capped.getBalance("0xabc")).toBe("-0.050000");

    // Repay partially
    capped.addCredit("0xabc", "0.030");
    expect(capped.getBalance("0xabc")).toBe("-0.020000");

    // Can deduct again up to cap
    capped.deductCredit("0xabc", "0.040");
    expect(capped.getBalance("0xabc")).toBe("-0.050000");
    capped.close();
  });
});
