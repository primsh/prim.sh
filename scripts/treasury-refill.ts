#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * treasury-refill.ts — Keep the faucet treasury funded.
 *
 * Phase 1: Drip USDC + ETH from Circle faucet to all drip wallets.
 * Phase 2: Sweep USDC from drip wallets back to the main treasury.
 *
 * Circle rate-limits to 1 drip/token/chain/24h per key×wallet pair.
 * N keys × M wallets = N×M×10 USDC/day.
 *
 * Usage:
 *   bun scripts/treasury-refill.ts              # Drip + sweep
 *   bun scripts/treasury-refill.ts --dry-run    # Show balances only
 *
 * Env:
 *   CIRCLE_API_KEYS        — Comma-separated Circle API keys (preferred)
 *   CIRCLE_API_KEY         — Single key fallback
 *   DRIP_WALLET_KEYS       — Comma-separated private keys for drip wallets
 *   FAUCET_TREASURY_KEY    — Main treasury private key (sweep destination)
 *   AGENT_PRIVATE_KEY      — Fallback for treasury key
 *   BASE_RPC_URL           — Base Sepolia RPC (default: https://sepolia.base.org)
 */

import { parseArgs } from "node:util";
import { http, createPublicClient, createWalletClient, formatEther, formatUnits } from "viem";
import type { Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

// ── CLI Args ──────────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
  },
  strict: true,
});

// ── Config ────────────────────────────────────────────────────────────────

const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
const USDC_DECIMALS = 6;
const MIN_SWEEP_USDC = 1_000_000n; // 1 USDC — don't sweep dust

const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
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

// ── Colors ────────────────────────────────────────────────────────────────

const c = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

// ── Resolve Keys + Wallets ───────────────────────────────────────────────

function getApiKeys(): string[] {
  const multi = process.env.CIRCLE_API_KEYS;
  if (multi)
    return multi
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
  const single = process.env.CIRCLE_API_KEY;
  if (single) return [single];
  return [];
}

function getTreasuryKey(): string {
  const key = process.env.FAUCET_TREASURY_KEY ?? process.env.AGENT_PRIVATE_KEY;
  if (!key) throw new Error("FAUCET_TREASURY_KEY or AGENT_PRIVATE_KEY required");
  return key;
}

interface DripWallet {
  address: string;
  privateKey: string;
}

function getDripWallets(): DripWallet[] {
  const keys = process.env.DRIP_WALLET_KEYS;
  if (!keys) return [];
  return keys
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k) => ({
      address: privateKeyToAccount(k as `0x${string}`).address,
      privateKey: k,
    }));
}

// ── RPC Client ───────────────────────────────────────────────────────────

const rpcUrl = process.env.BASE_RPC_URL ?? "https://sepolia.base.org";
const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(rpcUrl),
});

async function getUsdcBalance(address: string): Promise<bigint> {
  return publicClient.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address as Address],
  });
}

async function getBalanceFormatted(
  address: string,
): Promise<{ usdc: string; eth: string; usdcRaw: bigint }> {
  const [eth, usdc] = await Promise.all([
    publicClient.getBalance({ address: address as Address }),
    getUsdcBalance(address),
  ]);
  return {
    usdc: formatUnits(usdc, USDC_DECIMALS),
    eth: formatEther(eth),
    usdcRaw: usdc,
  };
}

// ── Circle Faucet ─────────────────────────────────────────────────────────

async function circleDrip(
  apiKey: string,
  address: string,
  token: "usdc" | "native",
): Promise<{ ok: boolean; dripped: boolean; note: string }> {
  const body: Record<string, unknown> = {
    address,
    blockchain: "BASE-SEPOLIA",
  };
  if (token === "usdc") body.usdc = true;
  if (token === "native") body.native = true;

  try {
    const res = await fetch("https://api.circle.com/v1/faucet/drips", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (res.ok) return { ok: true, dripped: true, note: "dripped" };

    const text = await res.text().catch(() => "(unreadable)");
    if (res.status === 429 || text.includes("rate limit")) {
      return { ok: true, dripped: false, note: "rate-limited" };
    }
    return { ok: false, dripped: false, note: `HTTP ${res.status}: ${text.slice(0, 100)}` };
  } catch (err) {
    return { ok: false, dripped: false, note: err instanceof Error ? err.message : String(err) };
  }
}

// ── Sweep ─────────────────────────────────────────────────────────────────

async function sweepUsdc(wallet: DripWallet, treasuryAddress: string): Promise<string | null> {
  const balance = await getUsdcBalance(wallet.address);
  if (balance < MIN_SWEEP_USDC) return null;

  const account = privateKeyToAccount(wallet.privateKey as `0x${string}`);
  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(rpcUrl),
  });

  const txHash = await walletClient.writeContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [treasuryAddress as Address, balance],
  });

  return txHash;
}

// ── Main ──────────────────────────────────────────────────────────────────

const apiKeys = getApiKeys();
const treasuryKey = getTreasuryKey();
const treasuryAccount = privateKeyToAccount(treasuryKey as `0x${string}`);
const treasuryAddress = treasuryAccount.address;
const dripWallets = getDripWallets();

// All addresses that receive drips: treasury + drip wallets
const allDripAddresses = [treasuryAddress, ...dripWallets.map((w) => w.address)];
// Deduplicate in case treasury is also in drip wallets
const uniqueDripAddresses = [...new Set(allDripAddresses)];

if (apiKeys.length === 0) {
  console.error(c.red("No Circle API keys. Set CIRCLE_API_KEYS or CIRCLE_API_KEY."));
  process.exit(1);
}

const ts = new Date().toISOString().slice(0, 19);
console.log(`${c.dim(ts)} Treasury Refill`);
console.log(
  `  Keys: ${apiKeys.length}  Wallets: ${uniqueDripAddresses.length}  Max daily: ${apiKeys.length * uniqueDripAddresses.length * 10} USDC`,
);
console.log(`  Treasury: ${c.dim(treasuryAddress)}`);
if (dripWallets.length > 0) {
  console.log(`  Drip wallets: ${dripWallets.length} (sweep → treasury)\n`);
} else {
  console.log();
}

// Show balances
const treasuryBal = await getBalanceFormatted(treasuryAddress);
console.log(
  `  ${c.bold(treasuryAddress.slice(0, 10))}…  ${treasuryBal.usdc.padStart(10)} USDC  ${treasuryBal.eth.slice(0, 10).padStart(10)} ETH  ${c.dim("(treasury)")}`,
);
for (const dw of dripWallets) {
  const bal = await getBalanceFormatted(dw.address);
  console.log(
    `  ${c.dim(dw.address.slice(0, 10))}…  ${bal.usdc.padStart(10)} USDC  ${bal.eth.slice(0, 10).padStart(10)} ETH`,
  );
}
console.log();

if (args["dry-run"]) {
  console.log(c.dim("  Dry run — no drips"));
  process.exit(0);
}

// ── Phase 1: Drip ────────────────────────────────────────────────────────

console.log(c.bold("  Phase 1: Drip"));
let totalDripped = 0;
let totalRateLimited = 0;
let totalFailed = 0;

for (const [ki, apiKey] of apiKeys.entries()) {
  const keyLabel = `key${ki + 1}/${apiKeys.length}`;

  for (const wallet of uniqueDripAddresses) {
    const walletLabel = wallet.slice(0, 10);

    for (const token of ["usdc", "native"] as const) {
      const label = token === "usdc" ? "USDC" : "ETH";
      const result = await circleDrip(apiKey, wallet, token);

      if (result.dripped) {
        totalDripped++;
        console.log(c.green(`  ${keyLabel} → ${walletLabel}… ${label}: dripped`));
      } else if (result.ok) {
        totalRateLimited++;
        console.log(c.dim(`  ${keyLabel} → ${walletLabel}… ${label}: ${result.note}`));
      } else {
        totalFailed++;
        console.log(c.red(`  ${keyLabel} → ${walletLabel}… ${label}: ${result.note}`));
      }
    }
  }
}

console.log(
  `\n  Drip: ${totalDripped} dripped, ${totalRateLimited} rate-limited, ${totalFailed} failed\n`,
);

// ── Phase 2: Sweep drip wallets → treasury ───────────────────────────────

if (dripWallets.length > 0) {
  console.log(c.bold("  Phase 2: Sweep → treasury"));

  // Wait for drips to settle (Circle drips are async)
  if (totalDripped > 0) {
    console.log(c.dim("  Waiting 15s for drips to settle…"));
    await new Promise((r) => setTimeout(r, 15_000));
  }

  for (const dw of dripWallets) {
    try {
      const txHash = await sweepUsdc(dw, treasuryAddress);
      if (txHash) {
        console.log(c.green(`  ${dw.address.slice(0, 10)}… → treasury: ${txHash.slice(0, 14)}…`));
      } else {
        console.log(c.dim(`  ${dw.address.slice(0, 10)}… → skip (< 1 USDC)`));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Most likely: drip wallet has no ETH for gas
      if (msg.includes("insufficient")) {
        console.log(c.dim(`  ${dw.address.slice(0, 10)}… → skip (no ETH for gas)`));
      } else {
        console.log(c.red(`  ${dw.address.slice(0, 10)}… → failed: ${msg.slice(0, 80)}`));
      }
    }
  }

  // Final treasury balance
  const finalBal = await getBalanceFormatted(treasuryAddress);
  console.log(`\n  Treasury: ${finalBal.usdc} USDC  ${finalBal.eth.slice(0, 10)} ETH`);
}
