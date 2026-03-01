// SPDX-License-Identifier: Apache-2.0
import { getNetworkConfig } from "@primsh/x402-middleware";
import {
  http,
  createPublicClient,
  createWalletClient,
  parseEther,
  parseUnits,
} from "viem";
import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";

function getViemChain(chainId: number) {
  if (chainId === 84532) return baseSepolia;
  return base;
}

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

export interface FundResult {
  usdc_tx: string;
  eth_tx: string;
  usdc_amount: string;
  eth_amount: string;
}

/**
 * Send USDC + ETH from the gate fund wallet to a target address.
 * Uses the same viem pattern as faucet.sh treasury transfers.
 */
export async function fundWallet(address: string): Promise<FundResult> {
  const fundKey = process.env.GATE_FUND_KEY;
  if (!fundKey) {
    throw new Error("GATE_FUND_KEY not configured");
  }

  const usdcAmount = process.env.GATE_USDC_AMOUNT ?? "5.00";
  const ethAmount = process.env.GATE_ETH_AMOUNT ?? "0.001";

  const netConfig = getNetworkConfig();
  const rpcUrl = process.env.BASE_RPC_URL ?? netConfig.rpcUrl;
  const chain = getViemChain(netConfig.chainId);

  const account = privateKeyToAccount(fundKey as Hex);
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });

  // Send USDC (6 decimals)
  const usdcAtoms = parseUnits(usdcAmount, 6);
  const usdcNonce = await publicClient.getTransactionCount({ address: account.address });
  const usdcTx = await walletClient.writeContract({
    address: netConfig.usdcAddress as Address,
    abi: ERC20_TRANSFER_ABI,
    functionName: "transfer",
    args: [address as Address, usdcAtoms],
    nonce: usdcNonce,
  });

  // Send ETH for gas
  const ethTx = await walletClient.sendTransaction({
    to: address as Address,
    value: parseEther(ethAmount),
    nonce: usdcNonce + 1,
  });

  return {
    usdc_tx: usdcTx,
    eth_tx: ethTx,
    usdc_amount: usdcAmount,
    eth_amount: ethAmount,
  };
}
