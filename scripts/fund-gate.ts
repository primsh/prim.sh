#!/usr/bin/env bun
/**
 * fund-gate.ts — Transfer USDC + ETH from TESTNET_WALLET to GATE_WALLET.
 *
 * Usage:
 *   TESTNET_WALLET=0x... bun scripts/fund-gate.ts [--usdc 5] [--eth 0.001]
 */
import { createPublicClient, createWalletClient, http, parseEther, parseUnits, formatEther, formatUnits } from "viem";
import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { parseArgs } from "node:util";

const GATE_ADDR = "0xa9D8307305F4a6B49231C22eFe621Eb26cA40A65" as Address;
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address;
const RPC = "https://sepolia.base.org";

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

const { values: args } = parseArgs({
  options: {
    usdc: { type: "string", default: "5" },
    eth: { type: "string", default: "0.001" },
  },
  strict: true,
});

const key = process.env.TESTNET_WALLET;
if (!key) {
  console.error("Set TESTNET_WALLET (private key) in env");
  process.exit(1);
}

const account = privateKeyToAccount(key as Hex);
const pub = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
const wallet = createWalletClient({ account, chain: baseSepolia, transport: http(RPC) });

// Show balances before
const [srcEth, srcUsdc, dstEth, dstUsdc] = await Promise.all([
  pub.getBalance({ address: account.address }),
  pub.readContract({ address: USDC, abi: ERC20_ABI, functionName: "balanceOf", args: [account.address] }),
  pub.getBalance({ address: GATE_ADDR }),
  pub.readContract({ address: USDC, abi: ERC20_ABI, functionName: "balanceOf", args: [GATE_ADDR] }),
]);

console.log(`TESTNET  ${account.address}  ${formatEther(srcEth)} ETH / ${formatUnits(srcUsdc, 6)} USDC`);
console.log(`GATE     ${GATE_ADDR}  ${formatEther(dstEth)} ETH / ${formatUnits(dstUsdc, 6)} USDC`);
console.log();

const usdcAmount = args.usdc!;
const ethAmount = args.eth!;

const nonce = await pub.getTransactionCount({ address: account.address });

console.log(`Sending ${usdcAmount} USDC...`);
const usdcTx = await wallet.writeContract({
  address: USDC,
  abi: ERC20_ABI,
  functionName: "transfer",
  args: [GATE_ADDR, parseUnits(usdcAmount, 6)],
  nonce,
});
console.log(`  tx: ${usdcTx}`);

console.log(`Sending ${ethAmount} ETH...`);
const ethTx = await wallet.sendTransaction({
  to: GATE_ADDR,
  value: parseEther(ethAmount),
  nonce: nonce + 1,
});
console.log(`  tx: ${ethTx}`);

// Wait a moment, show final balances
await new Promise((r) => setTimeout(r, 3000));

const [finalSrcEth, finalSrcUsdc, finalDstEth, finalDstUsdc] = await Promise.all([
  pub.getBalance({ address: account.address }),
  pub.readContract({ address: USDC, abi: ERC20_ABI, functionName: "balanceOf", args: [account.address] }),
  pub.getBalance({ address: GATE_ADDR }),
  pub.readContract({ address: USDC, abi: ERC20_ABI, functionName: "balanceOf", args: [GATE_ADDR] }),
]);

console.log();
console.log(`TESTNET  ${formatEther(finalSrcEth)} ETH / ${formatUnits(finalSrcUsdc, 6)} USDC`);
console.log(`GATE     ${formatEther(finalDstEth)} ETH / ${formatUnits(finalDstUsdc, 6)} USDC`);
