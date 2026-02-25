import { createPublicClient, http, formatUnits } from "viem";
import { base, baseSepolia } from "viem/chains";
import type { Address } from "viem";
import { getNetworkConfig } from "@agentstack/x402-middleware";

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

function getViemChain(chainId: number) {
  if (chainId === 84532) return baseSepolia;
  return base;
}

/** Live on-chain USDC balance via viem readContract. */
export async function getUsdcBalance(
  address: string,
): Promise<{ balance: string; funded: boolean }> {
  const netConfig = getNetworkConfig();
  const rpcUrl = process.env.BASE_RPC_URL ?? netConfig.rpcUrl;

  const client = createPublicClient({
    chain: getViemChain(netConfig.chainId),
    transport: http(rpcUrl),
  });

  const raw = (await client.readContract({
    address: netConfig.usdcAddress as Address,
    abi: BALANCE_OF_ABI,
    functionName: "balanceOf",
    args: [address as Address],
  })) as bigint;

  const funded = raw > 0n;
  const balance = Number(formatUnits(raw, USDC_DECIMALS)).toFixed(2);

  return { balance, funded };
}
