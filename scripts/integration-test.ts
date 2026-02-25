#!/usr/bin/env bun
/**
 * Testnet Integration Test — wallet.sh + faucet.sh + store.sh on Base Sepolia
 *
 * Non-custodial flow (W-10):
 *   1. Generate private key locally (agent-side)
 *   2. Register wallet via EIP-191 signature
 *   3. Fund via faucet.sh (Circle USDC drip)
 *   4. Exercise store.sh endpoints via @prim/x402-client
 *
 * Usage:
 *   source .env.testnet && bun run scripts/integration-test.ts
 *   source .env.testnet && bun run scripts/integration-test.ts --dry-run
 *
 * --dry-run: Start wallet.sh + faucet.sh, register wallet, fund, check balance, then exit.
 *            Use this to verify the non-custodial flow without store.sh.
 */

import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { getAddress } from "viem";

// ─── Config ──────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes("--dry-run");
const WALLET_PORT = Number(process.env.WALLET_PORT ?? "3001");
const FAUCET_PORT = Number(process.env.FAUCET_PORT ?? "3003");
const STORE_PORT = Number(process.env.STORE_PORT ?? "3002");
const WALLET_URL = `http://localhost:${WALLET_PORT}`;
const FAUCET_URL = `http://localhost:${FAUCET_PORT}`;
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

if (DRY_RUN) {
  console.log("✓ Dry-run mode. wallet.sh + faucet.sh will start.");
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
let agentPrivateKey: `0x${string}` | null = null;
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

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n─── Starting services ───────────────────────────────────────\n");

  await startService("wallet.sh", "packages/wallet/src/index.ts", WALLET_PORT);
  await startService("faucet.sh", "packages/faucet/src/index.ts", FAUCET_PORT);
  if (!DRY_RUN) {
    await startService("store.sh", "packages/store/src/index.ts", STORE_PORT);
  }

  console.log("\n─── Running integration tests ──────────────────────────────\n");

  // 1. Load or generate agent key, then register wallet via EIP-191 signature
  await step("Register wallet (EIP-191 signature)", async () => {
    // Reuse AGENT_PRIVATE_KEY from env if set, otherwise generate + persist
    const existingKey = process.env.AGENT_PRIVATE_KEY;
    if (existingKey) {
      agentPrivateKey = existingKey as `0x${string}`;
      console.log("(reusing AGENT_PRIVATE_KEY) ");
    } else {
      agentPrivateKey = generatePrivateKey();
      // Persist to .env.testnet so the key survives across runs
      const envFile = ".env.testnet";
      if (existsSync(envFile)) {
        appendFileSync(envFile, `\nAGENT_PRIVATE_KEY=${agentPrivateKey}\n`);
        console.log(`(new key saved to ${envFile}) `);
      } else {
        console.log(`(new key — set AGENT_PRIVATE_KEY=${agentPrivateKey} to reuse) `);
      }
    }

    const account = privateKeyToAccount(agentPrivateKey);
    walletAddress = getAddress(account.address);
    const timestamp = new Date().toISOString();
    const message = `Register ${walletAddress} with prim.sh at ${timestamp}`;
    const signature = await account.signMessage({ message });

    const res = await fetch(`${WALLET_URL}/v1/wallets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: walletAddress, signature, timestamp }),
    });

    // 409 = already registered (reusing key from previous run) — that's fine
    if (res.status === 409) {
      console.log(`(${walletAddress} — already registered)`);
      return;
    }
    if (!res.ok) throw new Error(`POST /v1/wallets → ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { address: string; chain: string };
    if (data.address !== walletAddress) throw new Error(`Expected ${walletAddress}, got ${data.address}`);
    console.log(`(${walletAddress})`);
  });

  if (!walletAddress || !agentPrivateKey) {
    console.error("\n✗ Cannot continue without a wallet. Exiting.");
    return;
  }

  // 2. Fund wallet via faucet.sh (USDC) — requires CIRCLE_API_KEY
  let faucetOk = false;
  if (process.env.CIRCLE_API_KEY) {
    await step("Fund wallet via faucet.sh (USDC)", async () => {
      const res = await fetch(`${FAUCET_URL}/v1/faucet/usdc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: walletAddress }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`POST /v1/faucet/usdc → ${res.status}: ${text}`);
      }
      const data = (await res.json()) as { amount: string; currency: string };
      faucetOk = true;
      console.log(`(${data.amount} ${data.currency})`);
    });
  } else {
    console.log("  Fund wallet via faucet.sh... ⊘ skipped (no CIRCLE_API_KEY)");
    console.log(`    Fund manually: https://faucet.circle.com/ → Base Sepolia → ${walletAddress}`);
  }

  // 3. Check USDC balance (poll if faucet was used)
  await step("Check USDC balance", async () => {
    const { getUsdcBalance } = await import("../packages/wallet/src/balance.ts");

    if (faucetOk) {
      // Poll for up to 60s for faucet funds to arrive
      const maxWait = 60_000;
      const start = Date.now();
      while (Date.now() - start < maxWait) {
        const { balance, funded } = await getUsdcBalance(walletAddress as `0x${string}`);
        if (funded) {
          console.log(`(${balance} USDC)`);
          return;
        }
        await sleep(3000);
      }
    }

    // Single check (or final check after timeout)
    const { balance, funded } = await getUsdcBalance(walletAddress as `0x${string}`);
    console.log(`(${balance} USDC, funded=${funded})`);

    if (!funded) {
      console.log(`\n    ⚠ Wallet not funded. Full test (store.sh x402) requires USDC.`);
      console.log(`    Fund manually: https://faucet.circle.com/ → Base Sepolia → ${walletAddress}`);
    }
  });

  if (DRY_RUN) {
    console.log("\n  Dry-run complete. Wallet registered and funded.");
    return;
  }

  // 4. Create x402 fetch using @prim/x402-client
  const { createPrimFetch } = await import("../packages/x402-client/src/index.ts");
  const primFetch = createPrimFetch({
    privateKey: agentPrivateKey,
    maxPayment: "1.00",
  });

  // 5. Create bucket via x402
  await step("Create bucket via x402", async () => {
    const res = await primFetch(`${STORE_URL}/v1/buckets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `test-${Date.now()}` }),
    });
    if (!res.ok) throw new Error(`POST /v1/buckets → ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { id: string; name: string };
    testBucketId = data.id;
    console.log(`(bucket: ${testBucketId})`);
  });

  if (!testBucketId) {
    console.log("  Skipping object tests — no bucket created.");
    return;
  }

  // 6. Upload object
  await step("Upload object via x402", async () => {
    const res = await primFetch(
      `${STORE_URL}/v1/buckets/${testBucketId}/objects/test.txt`,
      {
        method: "PUT",
        headers: { "Content-Type": "text/plain", "Content-Length": "13" },
        body: "hello testnet",
      },
    );
    if (!res.ok) throw new Error(`PUT object → ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { key: string };
    if (data.key !== "test.txt") throw new Error(`Expected key "test.txt", got "${data.key}"`);
  });

  // 7. Download object — verify body
  await step("Download object via x402", async () => {
    const res = await primFetch(
      `${STORE_URL}/v1/buckets/${testBucketId}/objects/test.txt`,
      { method: "GET" },
    );
    if (!res.ok) throw new Error(`GET object → ${res.status}: ${await res.text()}`);
    const body = await res.text();
    if (body !== "hello testnet") throw new Error(`Expected "hello testnet", got "${body}"`);
  });

  // 8. Get quota
  await step("Get quota via x402", async () => {
    const res = await primFetch(
      `${STORE_URL}/v1/buckets/${testBucketId}/quota`,
      { method: "GET" },
    );
    if (!res.ok) throw new Error(`GET quota → ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { usage_bytes: number };
    if (data.usage_bytes !== 13) throw new Error(`Expected usage_bytes=13, got ${data.usage_bytes}`);
  });

  // 9. Delete object
  await step("Delete object via x402", async () => {
    const res = await primFetch(
      `${STORE_URL}/v1/buckets/${testBucketId}/objects/test.txt`,
      { method: "DELETE" },
    );
    if (!res.ok) throw new Error(`DELETE object → ${res.status}: ${await res.text()}`);
  });

  // 10. Delete bucket
  await step("Delete bucket via x402", async () => {
    const res = await primFetch(
      `${STORE_URL}/v1/buckets/${testBucketId}`,
      { method: "DELETE" },
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
  if (testBucketId && agentPrivateKey) {
    console.log(`\n  Cleaning up test bucket ${testBucketId}...`);
    try {
      const { createPrimFetch } = await import("../packages/x402-client/src/index.ts");
      const primFetch = createPrimFetch({ privateKey: agentPrivateKey, maxPayment: "1.00" });
      await primFetch(`${STORE_URL}/v1/buckets/${testBucketId}`, { method: "DELETE" });
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
