// SPDX-License-Identifier: Apache-2.0
import { createLogger } from "@primsh/x402-middleware";

const log = createLogger("gate.sh", { module: "seed-credit" });

const INFER_SERVICE_URL = process.env.INFER_SERVICE_URL ?? "http://localhost:3012";
const INTERNAL_KEY = process.env.PRIM_INTERNAL_KEY;

/** Default credit seed amount (USDC) for new users. */
const SEED_AMOUNT = process.env.GATE_INFER_CREDIT_AMOUNT ?? "0.10";

/**
 * Seed infer.sh credit for a newly redeemed wallet.
 * Non-blocking — returns false on any error so redeem still succeeds.
 */
export async function seedInferCredit(wallet: string): Promise<boolean> {
  try {
    const res = await fetch(`${INFER_SERVICE_URL}/internal/credit/add`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(INTERNAL_KEY ? { "x-internal-key": INTERNAL_KEY } : {}),
      },
      body: JSON.stringify({ wallet, amount: SEED_AMOUNT }),
    });
    if (res.ok) {
      log.info("Infer credit seeded", { wallet, amount: SEED_AMOUNT, status: res.status });
      return true;
    }
    log.warn("Infer credit seed failed", { wallet, status: res.status });
    return false;
  } catch (err) {
    log.warn("Infer credit seed error", { wallet, error: String(err) });
    return false;
  }
}
