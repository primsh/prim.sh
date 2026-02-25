#!/usr/bin/env bun
/**
 * ST-5: Testnet Integration Test — wallet.sh ↔ store.sh on Base Sepolia
 *
 * Spins up both services as subprocesses, creates a wallet, then exercises
 * store.sh endpoints via x402Fetch (real 402 → sign → retry flow).
 *
 * Usage:
 *   source .env.testnet && bun run scripts/integration-test.ts
 *   source .env.testnet && bun run scripts/integration-test.ts --dry-run
 *
 * --dry-run: Start wallet.sh, create a wallet, check balance, then exit.
 *            Use this to get the wallet address for faucet funding.
 */

import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";

// ─── Config ──────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes("--dry-run");
const WALLET_PORT = Number(process.env.WALLET_PORT ?? "3001");
const STORE_PORT = Number(process.env.STORE_PORT ?? "3002");
const WALLET_URL = `http://localhost:${WALLET_PORT}`;
const STORE_URL = `http://localhost:${STORE_PORT}`;

// ─── Preflight checks ───────────────────────────────────────────────────

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.error(`✗ Missing required env var: ${name}`);
    console.error("  Copy scripts/.env.example to .env.testnet, fill in values, then:");
    console.error("  source .env.testnet && bun run scripts/integration-test.ts");
    process.exit(1);
  }
  return val;
}

const network = requireEnv("PRIM_NETWORK");
if (network !== "eip155:84532") {
  console.error(`✗ PRIM_NETWORK must be eip155:84532 (Base Sepolia). Got: ${network}`);
  console.error("  This script refuses to run on mainnet to prevent real fund usage.");
  process.exit(1);
}

requireEnv("WALLET_MASTER_KEY");

if (DRY_RUN) {
  console.log("✓ Dry-run mode. Only wallet.sh will start.");
} else {
  requireEnv("PRIM_PAY_TO");
  requireEnv("CLOUDFLARE_API_TOKEN");
  requireEnv("CLOUDFLARE_ACCOUNT_ID");
  requireEnv("R2_ACCESS_KEY_ID");
  requireEnv("R2_SECRET_ACCESS_KEY");
  console.log("✓ All env vars present. Network: Base Sepolia (eip155:84532)");
}

// ─── Subprocess management ──────────────────────────────────────────────

const children: ChildProcess[] = [];

function startService(name: string, entrypoint: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("bun", ["run", entrypoint], {
      env: { ...process.env, PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.push(child);

    let started = false;
    const timeout = setTimeout(() => {
      if (!started) reject(new Error(`${name} failed to start within 10s`));
    }, 10_000);

    // Poll for health check
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:${port}/`);
        if (res.ok) {
          clearInterval(poll);
          clearTimeout(timeout);
          started = true;
          console.log(`✓ ${name} running on port ${port}`);
          resolve();
        }
      } catch {
        // Not ready yet
      }
    }, 200);

    child.on("error", (err) => {
      clearInterval(poll);
      clearTimeout(timeout);
      reject(err);
    });

    child.on("exit", (code) => {
      if (!started) {
        clearInterval(poll);
        clearTimeout(timeout);
        reject(new Error(`${name} exited with code ${code} before starting`));
      }
    });
  });
}

function cleanup() {
  for (const child of children) {
    try { child.kill(); } catch { /* already dead */ }
  }
}

// ─── Test helpers ────────────────────────────────────────────────────────

let testBucketId: string | null = null;
let walletAddress: string | null = null;
let claimToken: string | null = null;
const steps: { name: string; passed: boolean; error?: string }[] = [];

async function step(name: string, fn: () => Promise<void>) {
  process.stdout.write(`  ${name}... `);
  try {
    await fn();
    steps.push({ name, passed: true });
    console.log("✓");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    steps.push({ name, passed: false, error: msg });
    console.log(`✗ ${msg}`);
  }
}

// Dynamically import x402Fetch from wallet package (after services start)
async function getX402Fetch() {
  const mod = await import("../packages/wallet/src/x402-client.ts");
  return mod.x402Fetch;
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n─── Starting services ───────────────────────────────────────\n");

  await startService("wallet.sh", "packages/wallet/src/index.ts", WALLET_PORT);
  if (!DRY_RUN) {
    await startService("store.sh", "packages/store/src/index.ts", STORE_PORT);
  }

  console.log("\n─── Running integration tests ──────────────────────────────\n");

  // 1. Create wallet (free route)
  await step("Create wallet", async () => {
    const res = await fetch(`${WALLET_URL}/v1/wallets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) throw new Error(`POST /v1/wallets → ${res.status}: ${await res.text()}`);
    const data = await res.json() as { address: string; claimToken: string };
    walletAddress = data.address;
    claimToken = data.claimToken;
  });

  if (!walletAddress) {
    console.error("\n✗ Cannot continue without a wallet. Exiting.");
    return;
  }

  // 2. Check balance via wallet.sh's balance module
  await step("Check USDC balance", async () => {
    const { getUsdcBalance } = await import("../packages/wallet/src/balance.ts");
    const { balance, funded } = await getUsdcBalance(walletAddress as `0x${string}`);
    console.log(`(${balance} USDC, funded=${funded})`);

    if (!funded) {
      console.log(`\n    ⚠ Wallet has zero USDC. Fund it before running the full test:`);
      console.log(`    1. Test USDC: https://faucet.circle.com/ → Base Sepolia → ${walletAddress}`);
      console.log(`    2. Gas ETH:   https://www.alchemy.com/faucets/base-sepolia → ${walletAddress}`);
      if (DRY_RUN) {
        console.log(`\n    Then run the full test:`);
        console.log(`    source .env.testnet && bun run scripts/integration-test.ts\n`);
      }
    }
  });

  if (DRY_RUN) {
    console.log("\n  Dry-run complete. Address and balance above.");
    return;
  }

  // 3. Create bucket via x402Fetch
  const x402Fetch = await getX402Fetch();

  await step("Create bucket via x402", async () => {
    const res = await x402Fetch(`${STORE_URL}/v1/buckets`, {
      walletAddress: walletAddress!,
      maxPayment: "1.00",
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Claim-Token": claimToken! },
      body: JSON.stringify({ name: `test-${Date.now()}` }),
    });
    if (!res.ok) throw new Error(`POST /v1/buckets → ${res.status}: ${await res.text()}`);
    const data = await res.json() as { id: string; name: string };
    testBucketId = data.id;
    console.log(`(bucket: ${testBucketId})`);
  });

  if (!testBucketId) {
    console.log("  Skipping object tests — no bucket created.");
    return;
  }

  // 4. Upload object
  await step("Upload object via x402", async () => {
    const res = await x402Fetch(
      `${STORE_URL}/v1/buckets/${testBucketId}/objects/test.txt`,
      {
        walletAddress: walletAddress!,
        maxPayment: "1.00",
        method: "PUT",
        headers: { "Content-Type": "text/plain", "Content-Length": "13" },
        body: "hello testnet",
      },
    );
    if (!res.ok) throw new Error(`PUT object → ${res.status}: ${await res.text()}`);
    const data = await res.json() as { key: string };
    if (data.key !== "test.txt") throw new Error(`Expected key "test.txt", got "${data.key}"`);
  });

  // 5. Download object — verify body
  await step("Download object via x402", async () => {
    const res = await x402Fetch(
      `${STORE_URL}/v1/buckets/${testBucketId}/objects/test.txt`,
      {
        walletAddress: walletAddress!,
        maxPayment: "1.00",
        method: "GET",
      },
    );
    if (!res.ok) throw new Error(`GET object → ${res.status}: ${await res.text()}`);
    const body = await res.text();
    if (body !== "hello testnet") throw new Error(`Expected "hello testnet", got "${body}"`);
  });

  // 6. Get quota
  await step("Get quota via x402", async () => {
    const res = await x402Fetch(
      `${STORE_URL}/v1/buckets/${testBucketId}/quota`,
      {
        walletAddress: walletAddress!,
        maxPayment: "1.00",
        method: "GET",
      },
    );
    if (!res.ok) throw new Error(`GET quota → ${res.status}: ${await res.text()}`);
    const data = await res.json() as { usage_bytes: number };
    if (data.usage_bytes !== 13) throw new Error(`Expected usage_bytes=13, got ${data.usage_bytes}`);
  });

  // 7. Delete object
  await step("Delete object via x402", async () => {
    const res = await x402Fetch(
      `${STORE_URL}/v1/buckets/${testBucketId}/objects/test.txt`,
      {
        walletAddress: walletAddress!,
        maxPayment: "1.00",
        method: "DELETE",
      },
    );
    if (!res.ok) throw new Error(`DELETE object → ${res.status}: ${await res.text()}`);
  });

  // 8. Delete bucket
  await step("Delete bucket via x402", async () => {
    const res = await x402Fetch(
      `${STORE_URL}/v1/buckets/${testBucketId}`,
      {
        walletAddress: walletAddress!,
        maxPayment: "1.00",
        method: "DELETE",
      },
    );
    if (!res.ok) throw new Error(`DELETE bucket → ${res.status}: ${await res.text()}`);
    testBucketId = null; // Prevent cleanup from trying to delete again
  });
}

// ─── Run with cleanup ────────────────────────────────────────────────────

try {
  await main();
} catch (err) {
  console.error("\n✗ Fatal error:", err instanceof Error ? err.message : err);
} finally {
  // Cleanup: delete test bucket if still exists
  if (testBucketId && walletAddress) {
    console.log(`\n  Cleaning up test bucket ${testBucketId}...`);
    try {
      const x402Fetch = await getX402Fetch();
      await x402Fetch(`${STORE_URL}/v1/buckets/${testBucketId}`, {
        walletAddress,
        maxPayment: "1.00",
        method: "DELETE",
      });
      console.log("  ✓ Cleaned up");
    } catch {
      console.log("  ✗ Cleanup failed (bucket may still exist)");
    }
  }

  cleanup();

  // Summary
  console.log("\n─── Summary ────────────────────────────────────────────────\n");
  const passed = steps.filter((s) => s.passed).length;
  const failed = steps.filter((s) => !s.passed).length;
  console.log(`  ${passed} passed, ${failed} failed out of ${steps.length} steps`);
  if (failed > 0) {
    console.log("\n  Failures:");
    for (const s of steps.filter((f) => !f.passed)) {
      console.log(`    ✗ ${s.name}: ${s.error}`);
    }
  }
  console.log();

  process.exit(failed > 0 ? 1 : 0);
}
