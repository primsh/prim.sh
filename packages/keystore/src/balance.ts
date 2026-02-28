import { getNetworkConfig } from "@primsh/x402-middleware";
import { http, createPublicClient, formatUnits } from "viem";
import type { Address } from "viem";
import { base, baseSepolia } from "viem/chains";

const USDC_DECIMALS = 6;

const BALANCE_OF_ABI = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
] as const;

export interface BalanceResult {
  address: string;
  balance: string;
  funded: boolean;
  network: string;
}

function getViemChain(chainId: number) {
  if (chainId === 84532) return baseSepolia;
  return base;
}

/**
 * Fetch live on-chain USDC balance via viem readContract.
 * On RPC failure, returns { balance: "0.00", funded: false } rather than throwing.
 */
export async function getUsdcBalance(address: string): Promise<BalanceResult> {
  const netConfig = getNetworkConfig();
  const rpcUrl = process.env.BASE_RPC_URL ?? netConfig.rpcUrl;

  const client = createPublicClient({
    chain: getViemChain(netConfig.chainId),
    transport: http(rpcUrl),
  });

  try {
    const raw = (await client.readContract({
      address: netConfig.usdcAddress as Address,
      abi: BALANCE_OF_ABI,
      functionName: "balanceOf",
      args: [address as Address],
    })) as bigint;

    const funded = raw > 0n;
    const balance = Number(formatUnits(raw, USDC_DECIMALS)).toFixed(2);

    return { address, balance, funded, network: netConfig.network };
  } catch {
    return { address, balance: "0.00", funded: false, network: netConfig.network };
  }
}
