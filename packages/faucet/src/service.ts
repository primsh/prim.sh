import { createWalletClient, http, parseEther } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";
import { getNetworkConfig } from "@primsh/x402-middleware";

export interface DripResult {
  txHash: string;
  amount: string;
  currency: "USDC" | "ETH";
  chain: string;
}

/**
 * Dispense test USDC via the Circle Faucet API.
 * Requires CIRCLE_API_KEY env var (Bearer token).
 * API: POST https://api.circle.com/v1/faucet/drips
 */
export async function dripUsdc(address: string): Promise<DripResult> {
  const apiKey = process.env.CIRCLE_API_KEY;
  if (!apiKey) {
    throw new Error("CIRCLE_API_KEY not configured");
  }

  const netConfig = getNetworkConfig();

  const response = await fetch("https://api.circle.com/v1/faucet/drips", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      address,
      blockchain: "BASE-SEPOLIA",
      usdc: true,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Circle faucet error (${response.status}): ${text}`);
  }

  // Circle returns 204 No Content on success (fire-and-forget, no tx hash)
  let txHash = "pending";
  if (response.status !== 204) {
    try {
      const data = (await response.json()) as Record<string, string>;
      txHash = data.txHash ?? data.transactionHash ?? "pending";
    } catch {
      // Empty body — that's fine
    }
  }

  return {
    txHash,
    amount: "10.00",
    currency: "USDC",
    chain: netConfig.network,
  };
}

/** Dispense test ETH from a pre-funded treasury wallet. */
export async function dripEth(address: string): Promise<DripResult> {
  const treasuryKey = process.env.FAUCET_TREASURY_KEY;
  if (!treasuryKey) {
    throw new Error("FAUCET_TREASURY_KEY not configured");
  }

  const netConfig = getNetworkConfig();
  const rpcUrl = process.env.BASE_RPC_URL ?? netConfig.rpcUrl;
  const dripAmount = process.env.FAUCET_DRIP_ETH ?? "0.01";

  const account = privateKeyToAccount(treasuryKey as Hex);
  const client = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(rpcUrl),
  });

  const txHash = await client.sendTransaction({
    to: address as Address,
    value: parseEther(dripAmount),
  });

  return {
    txHash,
    amount: dripAmount,
    currency: "ETH",
    chain: netConfig.network,
  };
}
