// SPDX-License-Identifier: Apache-2.0
import { Database } from "bun:sqlite";
import type { CreditLedger, CreditTx } from "./types.js";

export type { CreditLedger, CreditTx };

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS credit_balance (
  wallet_address TEXT PRIMARY KEY,
  balance_usdc TEXT NOT NULL DEFAULT '0',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS credit_tx (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  amount_usdc TEXT NOT NULL,
  reason TEXT NOT NULL,
  request_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_credit_tx_wallet ON credit_tx(wallet_address);
CREATE INDEX IF NOT EXISTS idx_credit_tx_created ON credit_tx(created_at);
`;

function subtract(a: string, b: string): string {
  // Use integer arithmetic on micro-cents (6 decimal places) to avoid float issues
  const scale = 1_000_000;
  const ai = Math.round(Number.parseFloat(a) * scale);
  const bi = Math.round(Number.parseFloat(b) * scale);
  return ((ai - bi) / scale).toFixed(6);
}

function add(a: string, b: string): string {
  const scale = 1_000_000;
  const ai = Math.round(Number.parseFloat(a) * scale);
  const bi = Math.round(Number.parseFloat(b) * scale);
  return ((ai + bi) / scale).toFixed(6);
}

function isNegative(v: string): boolean {
  return Number.parseFloat(v) < 0;
}

function isPositive(v: string): boolean {
  return Number.parseFloat(v) > 0;
}

export function createCreditLedger(
  dbPath: string,
  options?: { negativeCap?: string },
): CreditLedger {
  const db = new Database(dbPath, { create: true });
  db.exec("PRAGMA journal_mode=WAL;");
  db.exec(INIT_SQL);

  const negativeCap = options?.negativeCap ?? "0.05";

  const getBalanceStmt = db.prepare<{ balance_usdc: string }, [string]>(
    "SELECT balance_usdc FROM credit_balance WHERE wallet_address = ?",
  );

  const upsertBalanceStmt = db.prepare(
    `INSERT INTO credit_balance (wallet_address, balance_usdc, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(wallet_address) DO UPDATE SET
       balance_usdc = excluded.balance_usdc,
       updated_at = excluded.updated_at`,
  );

  const insertTxStmt = db.prepare(
    `INSERT INTO credit_tx (wallet_address, amount_usdc, reason, request_id)
     VALUES (?, ?, ?, ?)`,
  );

  const historyStmt = db.prepare<CreditTx, [string, number]>(
    "SELECT * FROM credit_tx WHERE wallet_address = ? ORDER BY id DESC LIMIT ?",
  );

  function getBalance(wallet: string): string {
    const row = getBalanceStmt.get(wallet.toLowerCase());
    return row?.balance_usdc ?? "0.000000";
  }

  function addCredit(wallet: string, amount: string, requestId?: string): void {
    const addr = wallet.toLowerCase();
    db.exec("BEGIN IMMEDIATE");
    try {
      const current = getBalance(addr);
      const updated = add(current, amount);
      upsertBalanceStmt.run(addr, updated);
      insertTxStmt.run(addr, amount, "credit", requestId ?? null);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }

  function deductCredit(wallet: string, amount: string, requestId?: string): void {
    const addr = wallet.toLowerCase();
    db.exec("BEGIN IMMEDIATE");
    try {
      const current = getBalance(addr);
      let deduction = amount;
      const projected = subtract(current, amount);

      // Cap negative balance
      const negLimit = subtract("0", negativeCap);
      if (Number.parseFloat(projected) < Number.parseFloat(negLimit)) {
        deduction = add(current, negativeCap);
        if (isNegative(deduction)) deduction = "0.000000";
      }

      const updated = subtract(current, deduction);
      upsertBalanceStmt.run(addr, updated);
      insertTxStmt.run(addr, `-${deduction}`, "debit", requestId ?? null);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }

  function settle(wallet: string, estimated: string, actual: string, requestId?: string): void {
    const delta = subtract(estimated, actual);
    if (isPositive(delta)) {
      addCredit(wallet, delta, requestId);
    } else if (isNegative(delta)) {
      // delta is negative, deduct the absolute value
      deductCredit(wallet, subtract("0", delta), requestId);
    }
    // delta === 0: no-op
  }

  function expireInactive(days: number): number {
    const result = db
      .prepare(
        `DELETE FROM credit_balance
       WHERE updated_at < datetime('now', ? || ' days')
         AND CAST(balance_usdc AS REAL) > 0`,
      )
      .run(`-${days}`);
    return result.changes;
  }

  function getHistory(wallet: string, limit = 50): CreditTx[] {
    return historyStmt.all(wallet.toLowerCase(), limit);
  }

  function close(): void {
    db.close();
  }

  return {
    getBalance,
    addCredit,
    deductCredit,
    settle,
    expireInactive,
    getHistory,
    close,
  };
}
