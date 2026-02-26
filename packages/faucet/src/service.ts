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
  source?: "circle" | "treasury";
}

// Minimal ERC-20 transfer ABI
const ERC20_TRANSFER_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

/**
 * Dispense test USDC via the Circle Faucet API.
 * Falls back to treasury wallet transfer if Circle returns an error (e.g. 429 rate-limited).
 * Requires CIRCLE_API_KEY env var for the Circle path.
 * Requires FAUCET_TREASURY_KEY env var for the fallback path.
 * API: POST https://api.circle.com/v1/faucet/drips
 */
export async function dripUsdc(address: string): Promise<DripResult> {
  const netConfig = getNetworkConfig();

  // ── Attempt 1: Circle Faucet API ──────────────────────────────────────────
  const apiKey = process.env.CIRCLE_API_KEY;
  let circleError: string | null = null;

  if (apiKey) {
    try {
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

      if (response.ok) {
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
          source: "circle",
        };
      }

      const text = await response.text();
      circleError = `Circle faucet error (${response.status}): ${text}`;
    } catch (err) {
      circleError = err instanceof Error ? err.message : String(err);
    }
  } else {
    circleError = "CIRCLE_API_KEY not configured";
  }

  // ── Attempt 2: Treasury wallet ERC-20 transfer ────────────────────────────
  const treasuryKey = process.env.FAUCET_TREASURY_KEY;
  if (!treasuryKey) {
    // Neither path is available — surface the original Circle error
    throw new Error(circleError ?? "CIRCLE_API_KEY not configured");
  }

  try {
    const rpcUrl = process.env.BASE_RPC_URL ?? netConfig.rpcUrl;
    // USDC has 6 decimals; Circle gives 10 USDC, so treasury matches that
    const USDC_DRIP_AMOUNT = 10_000_000n; // 10.00 USDC

    const account = privateKeyToAccount(treasuryKey as Hex);
    const client = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(rpcUrl),
    });

    const txHash = await client.writeContract({
      address: netConfig.usdcAddress as Address,
      abi: ERC20_TRANSFER_ABI,
      functionName: "transfer",
      args: [address as Address, USDC_DRIP_AMOUNT],
    });

    return {
      txHash,
      amount: "10.00",
      currency: "USDC",
      chain: netConfig.network,
      source: "treasury",
    };
  } catch (treasuryErr) {
    const treasuryMsg = treasuryErr instanceof Error ? treasuryErr.message : String(treasuryErr);
    throw new Error(
      `Circle failed (${circleError}); treasury also failed: ${treasuryMsg}`,
    );
  }
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
