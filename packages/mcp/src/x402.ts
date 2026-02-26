import { createPrimFetch } from "@primsh/x402-client";
import { getConfig } from "@primsh/keystore";

export interface WalletConfig {
  address?: string;
  passphrase?: string;
}

/**
 * Resolves wallet config and returns a configured primFetch instance.
 *
 * Resolution order:
 * 1. walletAddress arg (from --wallet flag)
 * 2. PRIM_WALLET env var
 * 3. Default wallet from ~/.prim/config.toml (keystore: true)
 */
export async function createMcpFetch(walletAddress?: string): Promise<typeof fetch> {
  const config = await getConfig();
  const resolvedAddress = walletAddress ?? process.env.PRIM_WALLET;

  return createPrimFetch({
    keystore: resolvedAddress ? { address: resolvedAddress } : true,
    maxPayment: process.env.PRIM_MAX_PAYMENT ?? "1.00",
    network: config.network,
  });
}

export function getBaseUrl(primitive: string): string {
  const envKey = `PRIM_${primitive.toUpperCase()}_URL`;
  const envVal = process.env[envKey];
  if (envVal) return envVal;
  return `https://${primitive}.prim.sh`;
}
