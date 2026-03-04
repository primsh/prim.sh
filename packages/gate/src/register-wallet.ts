// SPDX-License-Identifier: Apache-2.0
import { createLogger } from "@primsh/x402-middleware";

const log = createLogger("gate.sh", { module: "register-wallet" });

const WALLET_SERVICE_URL = process.env.WALLET_SERVICE_URL ?? "http://localhost:3001";
const INTERNAL_KEY = process.env.PRIM_INTERNAL_KEY;

/**
 * Register a wallet on wallet.sh via the internal endpoint.
 * Non-blocking — returns false on any error so redeem still succeeds.
 */
export async function registerWalletOnService(wallet: string): Promise<boolean> {
  try {
    const res = await fetch(`${WALLET_SERVICE_URL}/internal/wallets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(INTERNAL_KEY ? { "x-internal-key": INTERNAL_KEY } : {}),
      },
      body: JSON.stringify({ address: wallet }),
    });
    if (res.ok || res.status === 409) {
      log.info("Wallet registered on wallet.sh", { wallet, status: res.status });
      return true;
    }
    log.warn("Wallet registration failed", { wallet, status: res.status });
    return false;
  } catch (err) {
    log.warn("Wallet registration error", { wallet, error: String(err) });
    return false;
  }
}
