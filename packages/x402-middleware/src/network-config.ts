export interface NetworkConfig {
  network: string;
  chainId: number;
  rpcUrl: string;
  usdcAddress: string;
  isTestnet: boolean;
}

const NETWORKS: Record<string, NetworkConfig> = {
  "eip155:8453": {
    network: "eip155:8453",
    chainId: 8453,
    rpcUrl: "https://mainnet.base.org",
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    isTestnet: false,
  },
  "eip155:84532": {
    network: "eip155:84532",
    chainId: 84532,
    rpcUrl: "https://sepolia.base.org",
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    isTestnet: true,
  },
};

const DEFAULT_NETWORK = "eip155:8453";

/**
 * Known x402 facilitators that support Base + Base Sepolia.
 * Set FACILITATOR_URL env var to switch. Default is Coinbase CDP.
 */
export const FACILITATORS = {
  cdp: "https://api.cdp.coinbase.com/platform/v2/x402",
  payai: "https://facilitator.payai.network",
  corbits: "https://facilitator.corbits.dev",
  "0xmeta": "https://facilitator.0xmeta.ai/v1",
  dexter: "https://x402.dexter.cash",
  kobaru: "https://gateway.kobaru.io",
} as const;

/**
 * Returns chain-dependent constants for the given network.
 *
 * Resolution order: explicit `network` param > `PRIM_NETWORK` env var > mainnet default.
 */
export function getNetworkConfig(network?: string): NetworkConfig {
  const key = network ?? process.env.PRIM_NETWORK ?? DEFAULT_NETWORK;
  const config = NETWORKS[key];
  if (!config) {
    throw new Error(`Unknown network: ${key}. Supported: ${Object.keys(NETWORKS).join(", ")}`);
  }
  return config;
}
