#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * cdp-refill.ts — Keep the faucet treasury funded via CDP faucet.
 *
 * Batch-claims ETH + USDC from Coinbase CDP faucet into TESTNET_WALLET.
 * Designed to run as a systemd timer (every 6 hours) or manually.
 *
 * Usage:
 *   bun scripts/cdp-refill.ts              # Claim ETH + USDC
 *   bun scripts/cdp-refill.ts --dry-run    # Show balances only
 *
 * Env:
 *   CDP_API_KEY_ID        — Coinbase CDP API key ID
 *   CDP_API_KEY_SECRET    — Coinbase CDP API key secret
 *   TESTNET_WALLET        — Treasury private key (derives address)
 *   REFILL_BATCH_SIZE     — Claims per token (default: 10)
 *   BASE_RPC_URL          — Base Sepolia RPC (default: https://sepolia.base.org)
 */

import { parseArgs } from "node:util";
import { http, createPublicClient, formatEther, formatUnits } from "viem";
import type { Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const { values: args } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
  },
  strict: true,
});

// ── Config ────────────────────────────────────────────────────────────────

const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
const USDC_DECIMALS = 6;

const ERC20_BALANCE_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const cdpKeyId = process.env.CDP_API_KEY_ID;
const cdpKeySecret = process.env.CDP_API_KEY_SECRET;
if (!cdpKeyId || !cdpKeySecret) {
  console.error("CDP_API_KEY_ID and CDP_API_KEY_SECRET required");
  process.exit(1);
}

const walletKey = process.env.TESTNET_WALLET;
if (!walletKey) {
  console.error("TESTNET_WALLET required");
  process.exit(1);
}

const account = privateKeyToAccount(walletKey as `0x${string}`);
const treasuryAddress = account.address;
const batchSize = Math.min(Number(process.env.REFILL_BATCH_SIZE ?? "10"), 50);
const rpcUrl = process.env.BASE_RPC_URL ?? "https://sepolia.base.org";

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(rpcUrl),
});

// ── Helpers ───────────────────────────────────────────────────────────────

async function getBalances(): Promise<{ eth: string; usdc: string }> {
  const [ethBal, usdcBal] = await Promise.all([
    publicClient.getBalance({ address: treasuryAddress }),
    publicClient.readContract({
      address: USDC_ADDRESS,
      abi: ERC20_BALANCE_ABI,
      functionName: "balanceOf",
      args: [treasuryAddress as Address],
    }),
  ]);
  return {
    eth: formatEther(ethBal),
    usdc: formatUnits(usdcBal, USDC_DECIMALS),
  };
}

// ── Main ──────────────────────────────────────────────────────────────────

const ts = new Date().toISOString().slice(0, 19);
console.log(`${ts} CDP Treasury Refill`);
console.log(`  Treasury: ${treasuryAddress}`);
console.log(`  Batch size: ${batchSize} per token\n`);

const preBal = await getBalances();
console.log(`  Pre-refill:  ${preBal.eth} ETH  ${preBal.usdc} USDC`);

if (args["dry-run"]) {
  console.log("\n  Dry run — no claims made");
  process.exit(0);
}

const { CdpClient } = await import("@coinbase/cdp-sdk");
const cdp = new CdpClient({ apiKeyId: cdpKeyId, apiKeySecret: cdpKeySecret });

let ethClaimed = 0;
let ethFailed = 0;
let usdcClaimed = 0;
let usdcFailed = 0;

// ETH claims
console.log(`\n  Claiming ETH (${batchSize} requests)...`);
for (let i = 0; i < batchSize; i++) {
  try {
    await cdp.evm.requestFaucet({
      address: treasuryAddress,
      network: "base-sepolia",
      token: "eth",
    });
    ethClaimed++;
  } catch {
    ethFailed++;
  }
  if (i + 1 < batchSize) {
    await new Promise((r) => setTimeout(r, 1200));
  }
}
console.log(`  ETH: ${ethClaimed} claimed, ${ethFailed} failed`);

// USDC claims
console.log(`\n  Claiming USDC (${batchSize} requests)...`);
for (let i = 0; i < batchSize; i++) {
  try {
    await cdp.evm.requestFaucet({
      address: treasuryAddress,
      network: "base-sepolia",
      token: "usdc",
    });
    usdcClaimed++;
  } catch {
    usdcFailed++;
  }
  if (i + 1 < batchSize) {
    await new Promise((r) => setTimeout(r, 1200));
  }
}
console.log(`  USDC: ${usdcClaimed} claimed, ${usdcFailed} failed`);

// Post-refill balances (wait for settlement)
console.log("\n  Waiting 10s for settlement...");
await new Promise((r) => setTimeout(r, 10_000));

const postBal = await getBalances();
console.log(`  Post-refill: ${postBal.eth} ETH  ${postBal.usdc} USDC\n`);
