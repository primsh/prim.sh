import { createPublicClient, http, formatUnits } from "viem";
import { base } from "viem/chains";
import type { Address } from "viem";

const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
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

// biome-ignore lint/suspicious/noExplicitAny: lazy-init holder for viem PublicClient avoids complex generic type annotation
let _client: any; // eslint-disable-line @typescript-eslint/no-explicit-any

function getClient() {
  if (!_client) {
    _client = createPublicClient({
      chain: base,
      transport: http(process.env.BASE_RPC_URL ?? "https://mainnet.base.org"),
    });
  }
  return _client as ReturnType<typeof createPublicClient>;
}

export async function getUsdcBalance(address: Address): Promise<{ balance: string; funded: boolean }> {
  try {
    const raw = (await getClient().readContract({
      address: USDC_ADDRESS,
      abi: BALANCE_OF_ABI,
      functionName: "balanceOf",
      args: [address],
    })) as bigint;

    const funded = raw > 0n;
    const full = formatUnits(raw, USDC_DECIMALS);
    const balance = Number(full).toFixed(2);

    return { balance, funded };
  } catch (err) {
    console.warn("[balance] RPC query failed for", address, err);
    return { balance: "0.00", funded: false };
  }
}
