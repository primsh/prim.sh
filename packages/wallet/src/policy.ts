import {
  getPolicy,
  resetDailySpentIfNeeded,
  incrementDailySpent,
} from "./db.ts";

type PolicyCheckOk = { ok: true };
type PolicyCheckFail = { ok: false; code: string; message: string };
type PolicyCheckResult = PolicyCheckOk | PolicyCheckFail;

/**
 * checkPolicy — run before every send operation.
 *
 * Order of checks:
 * 1. If no policy row, allow (no limits set).
 * 2. Reset daily_spent if past midnight UTC.
 * 3. If paused with scope "all" or "send" → wallet_paused (403).
 * 4. maxPerTx: if amount > limit → policy_violation (422).
 * 5. maxPerDay: if dailySpent + amount > limit → policy_violation (422).
 */
export function checkPolicy(walletAddress: string, amount: string): PolicyCheckResult {
  const policy = getPolicy(walletAddress);
  if (!policy) return { ok: true };

  // Reset daily spent if past reset time (mutates DB)
  resetDailySpentIfNeeded(walletAddress);
  // Re-fetch after potential reset
  const p = getPolicy(walletAddress);
  if (!p) return { ok: true };

  const amountNum = Number.parseFloat(amount);

  // Pause check
  if (p.pause_scope === "all" || p.pause_scope === "send") {
    return { ok: false, code: "wallet_paused", message: "Wallet is paused" };
  }

  // maxPerTx check
  if (p.max_per_tx !== null) {
    const limit = Number.parseFloat(p.max_per_tx);
    if (amountNum > limit) {
      return {
        ok: false,
        code: "policy_violation",
        message: `Amount ${amount} exceeds per-transaction limit of ${p.max_per_tx}`,
      };
    }
  }

  // maxPerDay check
  if (p.max_per_day !== null) {
    const dailyLimit = Number.parseFloat(p.max_per_day);
    const dailySpent = Number.parseFloat(p.daily_spent);
    if (dailySpent + amountNum > dailyLimit) {
      return {
        ok: false,
        code: "policy_violation",
        message: `Amount would exceed daily limit of ${p.max_per_day} (already spent ${p.daily_spent})`,
      };
    }
  }

  return { ok: true };
}

/**
 * recordSpend — called after a successful send to increment daily_spent.
 */
export function recordSpend(walletAddress: string, amount: string): void {
  incrementDailySpent(walletAddress, amount);
}
