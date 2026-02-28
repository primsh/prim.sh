import { addToAllowlist } from "@primsh/x402-middleware/allowlist-db";
import { createLogger } from "@primsh/x402-middleware";
import type { RedeemResponse } from "./api.ts";
import { validateAndBurn } from "./db.ts";
import { fundWallet } from "./fund.ts";

const log = createLogger("gate.sh", { module: "service" });

type RedeemResult =
  | { ok: true; data: RedeemResponse }
  | { ok: false; status: number; code: string; message: string };

/**
 * Redeem an invite code: validate → allowlist → fund.
 *
 * @param code - Invite code to redeem
 * @param wallet - Checksummed EVM wallet address
 * @param allowlistDbPath - Path to shared allowlist SQLite DB
 */
export async function redeemInvite(
  code: string,
  wallet: string,
  allowlistDbPath: string,
): Promise<RedeemResult> {
  // 1. Validate and burn the code
  const validation = validateAndBurn(code, wallet);
  if (!validation.ok) {
    const messages = {
      invalid_code: "Invite code not recognized",
      code_redeemed: "Invite code already used",
    } as const;
    const status = validation.reason === "code_redeemed" ? 409 : 400;
    return { ok: false, status, code: validation.reason, message: messages[validation.reason] };
  }

  // 2. Add wallet to allowlist
  addToAllowlist(allowlistDbPath, wallet, "gate.sh", `invite:${code}`);
  log.info("Wallet allowlisted", { wallet, code });

  // 3. Fund the wallet
  try {
    const funded = await fundWallet(wallet);
    log.info("Wallet funded", { wallet, usdc: funded.usdc_amount, eth: funded.eth_amount });

    return {
      ok: true,
      data: {
        status: "redeemed",
        wallet,
        funded: {
          usdc: funded.usdc_amount,
          eth: funded.eth_amount,
          usdc_tx: funded.usdc_tx,
          eth_tx: funded.eth_tx,
        },
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("Funding failed (wallet is allowlisted but unfunded)", { wallet, error: message });
    return { ok: false, status: 502, code: "fund_error", message: `Funding failed: ${message}` };
  }
}
