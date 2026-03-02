// SPDX-License-Identifier: Apache-2.0
import { getNetworkConfig } from "@primsh/x402-middleware";
import {
  http,
  createPublicClient,
  createWalletClient,
  formatEther,
  formatUnits,
  parseEther,
  parseUnits,
} from "viem";
import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import type { RefillResult, TreasuryStatus } from "./api.ts";

export interface DripResult {
  tx_hash: string;
  amount: string;
  currency: "USDC" | "ETH";
  chain: string;
  source?: "cdp" | "treasury";
}

// ─── Nonce queue ──────────────────────────────────────────────────────────
// Assigns explicit sequential nonces so concurrent treasury txs don't collide.

class NonceQueue {
  private current: number | null = null;
  private pending: Promise<void> = Promise.resolve();

  async next(
    publicClient: { getTransactionCount: (args: { address: Address }) => Promise<number> },
    address: Address,
  ): Promise<number> {
    // Serialize nonce assignment — each caller waits for the previous one
    const prev = this.pending;
    let resolve: (() => void) | undefined;
    this.pending = new Promise((r) => {
      resolve = r;
    });

    await prev;

    if (this.current === null) {
      this.current = await publicClient.getTransactionCount({ address });
    } else {
      this.current++;
    }

    const nonce = this.current;
    resolve?.();
    return nonce;
  }

  /** Reset after errors so next call re-fetches from chain. */
  reset(): void {
    this.current = null;
  }
}

const nonceQueue = new NonceQueue();

// Minimal ERC-20 ABI (transfer + balanceOf)
const ERC20_ABI = [
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
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// ─── CDP singleton ────────────────────────────────────────────────────────

interface CdpFaucetClient {
  evm: {
    requestFaucet: (args: {
      address: string;
      network: "base-sepolia" | "ethereum-sepolia";
      token: "eth" | "usdc" | "eurc" | "cbbtc";
    }) => Promise<{ transactionHash: string }>;
  };
}

let cdpInstance: CdpFaucetClient | null = null;

async function getCdpClient(): Promise<CdpFaucetClient> {
  if (cdpInstance) return cdpInstance;

  const cdpKeyId = process.env.CDP_API_KEY_ID;
  const cdpKeySecret = process.env.CDP_API_KEY_SECRET;
  if (!cdpKeyId || !cdpKeySecret) {
    throw new Error("CDP_API_KEY_ID and CDP_API_KEY_SECRET required");
  }

  const { CdpClient } = await import("@coinbase/cdp-sdk");
  cdpInstance = new CdpClient({ apiKeyId: cdpKeyId, apiKeySecret: cdpKeySecret });
  return cdpInstance as CdpFaucetClient;
}

/** Drip tokens via CDP faucet directly to an address. */
async function cdpDrip(
  address: string,
  token: "usdc" | "eth",
): Promise<{ tx_hash: string } | null> {
  try {
    const cdp = await getCdpClient();
    const result = await cdp.evm.requestFaucet({
      address,
      network: "base-sepolia",
      token,
    });
    return { tx_hash: result.transactionHash };
  } catch {
    return null;
  }
}

// ─── Reserve floor helpers ────────────────────────────────────────────────

const USDC_DECIMALS = 6;
const USDC_DRIP_AMOUNT = 10_000_000n; // 10.00 USDC
const DEFAULT_RESERVE_USDC = "10.00";
const DEFAULT_RESERVE_ETH = "0.005";

function getReserveUsdc(): bigint {
  const str = process.env.FAUCET_RESERVE_USDC ?? DEFAULT_RESERVE_USDC;
  return parseUnits(str, USDC_DECIMALS);
}

function getReserveEth(): bigint {
  const str = process.env.FAUCET_RESERVE_ETH ?? DEFAULT_RESERVE_ETH;
  return parseEther(str);
}

// ─── Public API ───────────────────────────────────────────────────────────

/** Check testnet wallet ETH + USDC balance and whether it needs refill. */
export async function getTreasuryBalance(): Promise<TreasuryStatus> {
  const walletKey = process.env.TESTNET_WALLET;
  if (!walletKey) {
    throw new Error("TESTNET_WALLET not configured");
  }

  const netConfig = getNetworkConfig();
  const rpcUrl = process.env.BASE_RPC_URL ?? netConfig.rpcUrl;
  const account = privateKeyToAccount(walletKey as Hex);

  const client = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  });

  const [ethBalance, usdcBalance] = await Promise.all([
    client.getBalance({ address: account.address }),
    client.readContract({
      address: netConfig.usdcAddress as Address,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [account.address],
    }),
  ]);

  const thresholdStr = process.env.FAUCET_REFILL_THRESHOLD_ETH ?? "0.02";

  return {
    address: account.address,
    eth_balance: formatEther(ethBalance),
    usdc_balance: formatUnits(usdcBalance, USDC_DECIMALS),
    needs_refill: ethBalance < parseEther(thresholdStr),
  };
}

/** Claim testnet ETH + USDC from Coinbase CDP faucet in batch. */
export async function refillTreasury(
  batchSize?: number,
  usdcBatchSize?: number,
): Promise<RefillResult> {
  const walletKey = process.env.TESTNET_WALLET;
  if (!walletKey) {
    throw new Error("TESTNET_WALLET not configured");
  }

  // Validate CDP env vars early (getCdpClient caches, so won't re-check after first call)
  if (!process.env.CDP_API_KEY_ID || !process.env.CDP_API_KEY_SECRET) {
    throw new Error("CDP_API_KEY_ID and CDP_API_KEY_SECRET required for refill");
  }

  const cdp = await getCdpClient();
  const account = privateKeyToAccount(walletKey as Hex);
  const ethSize = Math.min(batchSize ?? 100, 200);
  const usdcSize = Math.min(usdcBatchSize ?? batchSize ?? 10, 200);

  const ethTxHashes: string[] = [];
  let ethFailed = 0;
  const usdcTxHashes: string[] = [];
  let usdcFailed = 0;

  // ETH claims
  for (let i = 0; i < ethSize; i++) {
    try {
      const result = await cdp.evm.requestFaucet({
        address: account.address,
        network: "base-sepolia",
        token: "eth",
      });
      ethTxHashes.push(result.transactionHash);
    } catch {
      ethFailed++;
    }
    if (i + 1 < ethSize) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }

  // USDC claims
  for (let i = 0; i < usdcSize; i++) {
    try {
      const result = await cdp.evm.requestFaucet({
        address: account.address,
        network: "base-sepolia",
        token: "usdc",
      });
      usdcTxHashes.push(result.transactionHash);
    } catch {
      usdcFailed++;
    }
    if (i + 1 < usdcSize) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }

  return {
    claimed: ethTxHashes.length,
    failed: ethFailed,
    estimated_eth: (ethTxHashes.length * 0.0001).toFixed(4),
    usdc_claimed: usdcTxHashes.length,
    usdc_failed: usdcFailed,
    estimated_usdc: (usdcTxHashes.length * 10).toFixed(2),
    tx_hashes: [...ethTxHashes, ...usdcTxHashes],
  };
}

/**
 * Dispense test USDC via CDP faucet (primary) with treasury fallback.
 * Treasury fallback respects reserve floor — refuses if balance would drop below reserve.
 */
export async function dripUsdc(address: string): Promise<DripResult> {
  const netConfig = getNetworkConfig();

  // ── Attempt 1: CDP faucet (drip directly to agent) ──────────────────────
  const cdpResult = await cdpDrip(address, "usdc");
  if (cdpResult) {
    return {
      tx_hash: cdpResult.tx_hash,
      amount: "10.00",
      currency: "USDC",
      chain: netConfig.network,
      source: "cdp",
    };
  }

  // ── Attempt 2: Treasury ERC-20 transfer (with reserve floor) ────────────
  const walletKey = process.env.TESTNET_WALLET;
  if (!walletKey) {
    throw new Error("CDP drip failed and TESTNET_WALLET not configured");
  }

  const rpcUrl = process.env.BASE_RPC_URL ?? netConfig.rpcUrl;
  const account = privateKeyToAccount(walletKey as Hex);
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  });

  // Reserve floor check
  const usdcBalance = await publicClient.readContract({
    address: netConfig.usdcAddress as Address,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [account.address],
  });

  const reserveFloor = getReserveUsdc();
  if (usdcBalance < USDC_DRIP_AMOUNT + reserveFloor) {
    throw new Error(
      "CDP drip failed and treasury USDC below reserve floor. Call POST /v1/faucet/refill.",
    );
  }

  try {
    const client = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(rpcUrl),
    });

    const nonce = await nonceQueue.next(publicClient, account.address);
    const txHash = await client.writeContract({
      address: netConfig.usdcAddress as Address,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [address as Address, USDC_DRIP_AMOUNT],
      nonce,
    });

    return {
      tx_hash: txHash,
      amount: "10.00",
      currency: "USDC",
      chain: netConfig.network,
      source: "treasury",
    };
  } catch (treasuryErr) {
    nonceQueue.reset();
    const treasuryMsg = treasuryErr instanceof Error ? treasuryErr.message : String(treasuryErr);
    throw new Error(`CDP drip failed; direct transfer also failed: ${treasuryMsg}`);
  }
}

/**
 * Dispense test ETH via CDP faucet (primary) with treasury fallback.
 * Treasury fallback respects reserve floor — refuses if balance would drop below reserve.
 */
export async function dripEth(address: string): Promise<DripResult> {
  const netConfig = getNetworkConfig();

  // ── Attempt 1: CDP faucet (drip directly to agent) ──────────────────────
  const cdpResult = await cdpDrip(address, "eth");
  if (cdpResult) {
    return {
      tx_hash: cdpResult.tx_hash,
      amount: "0.01",
      currency: "ETH",
      chain: netConfig.network,
      source: "cdp",
    };
  }

  // ── Attempt 2: Treasury ETH transfer (with reserve floor) ──────────────
  const walletKey = process.env.TESTNET_WALLET;
  if (!walletKey) {
    throw new Error("CDP drip failed and TESTNET_WALLET not configured");
  }

  const rpcUrl = process.env.BASE_RPC_URL ?? netConfig.rpcUrl;
  const dripAmount = process.env.FAUCET_DRIP_ETH ?? "0.01";
  const account = privateKeyToAccount(walletKey as Hex);

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  });
  const balance = await publicClient.getBalance({ address: account.address });
  const dripValue = parseEther(dripAmount);
  const gasBuffer = parseEther("0.001");
  const reserveFloor = getReserveEth();

  if (balance < dripValue + gasBuffer + reserveFloor) {
    const err = new Error(
      "CDP drip failed and TESTNET_WALLET ETH below reserve floor. Call POST /v1/faucet/refill.",
    );
    (err as Error & { code: string }).code = "treasury_low";
    throw err;
  }

  const client = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(rpcUrl),
  });

  try {
    const nonce = await nonceQueue.next(publicClient, account.address);
    const txHash = await client.sendTransaction({
      to: address as Address,
      value: dripValue,
      nonce,
    });

    return {
      tx_hash: txHash,
      amount: dripAmount,
      currency: "ETH",
      chain: netConfig.network,
      source: "treasury",
    };
  } catch (err) {
    nonceQueue.reset();
    throw err;
  }
}
