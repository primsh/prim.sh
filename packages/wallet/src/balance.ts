// SPDX-License-Identifier: Apache-2.0
import { createLogger, getNetworkConfig } from "@primsh/x402-middleware";
import { http, createPublicClient, formatUnits } from "viem";
import type { Address } from "viem";
import { base, baseSepolia } from "viem/chains";

const log = createLogger("wallet.sh", { module: "balance" });

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

// biome-ignore lint/suspicious/noExplicitAny: lazy-init holder for viem PublicClient avoids complex generic type annotation
let _client: any; // eslint-disable-line @typescript-eslint/no-explicit-any
let _clientChainId: number | null = null;

function getClient() {
  const config = getNetworkConfig();
  if (!_client || _clientChainId !== config.chainId) {
    _client = createPublicClient({
      chain: getViemChain(config.chainId),
      transport: http(process.env.BASE_RPC_URL ?? config.rpcUrl),
    });
    _clientChainId = config.chainId;
  }
  return _client as ReturnType<typeof createPublicClient>;
}

export async function getUsdcBalance(
  address: Address,
): Promise<{ balance: string; funded: boolean }> {
  try {
    const { usdcAddress } = getNetworkConfig();
    const raw = (await getClient().readContract({
      address: usdcAddress as Address,
      abi: BALANCE_OF_ABI,
      functionName: "balanceOf",
      args: [address],
    })) as bigint;

    const funded = raw > 0n;
    const full = formatUnits(raw, USDC_DECIMALS);
    const balance = Number(full).toFixed(2);

    return { balance, funded };
  } catch (err) {
    log.warn("RPC query failed", { address, error: String(err) });
    return { balance: "0.00", funded: false };
  }
}
