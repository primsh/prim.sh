#!/usr/bin/env bun
/**
 * Access Request E2E Smoke Test
 *
 * Proves the full autonomous access flow end-to-end against live services.
 * Generates a fresh wallet each run — no pre-seeding, no manual steps.
 *
 * Flow:
 *   1. Generate fresh wallet keypair
 *   2. Register wallet at wallet.prim.sh (EIP-191)
 *   3. Get testnet USDC from faucet (429 = warn, not fail)
 *   4. Hit paid endpoint → expect 403 + access_url
 *   5. Submit access request via access_url → expect 201
 *   6. Admin approves request → expect 200
 *   7. Retry paid endpoint → expect 200
 *   [cleanup] Remove wallet from allowlist (best-effort)
 *
 * Usage:
 *   export PRIM_NETWORK=eip155:84532 PRIM_ADMIN_KEY=... PRIM_INTERNAL_KEY=...
 *   bun run scripts/smoke-access.ts
 *
 * Env vars:
 *   PRIM_NETWORK       — must be eip155:84532 (Base Sepolia testnet guard)
 *   PRIM_ADMIN_KEY     — admin auth for approve endpoint (required)
 *   PRIM_INTERNAL_KEY  — internal auth for allowlist cleanup (required)
 */

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { getAddress } from "viem";

// ─── Config ──────────────────────────────────────────────────────────────

const WALLET_URL = "https://wallet.prim.sh";
const FAUCET_URL = "https://faucet.prim.sh";
const API_URL = "https://api.prim.sh";

// ─── Preflight ───────────────────────────────────────────────────────────

const network = process.env.PRIM_NETWORK;
if (network !== "eip155:84532") {
  console.error(`\n✗ PRIM_NETWORK must be eip155:84532 (Base Sepolia). Got: ${network ?? "(unset)"}`);
  console.error("  This script refuses to run on mainnet.");
  process.exit(1);
}

const PRIM_ADMIN_KEY = process.env.PRIM_ADMIN_KEY;
if (!PRIM_ADMIN_KEY) {
  console.error("\n✗ PRIM_ADMIN_KEY required for admin approve step.");
  console.error("  Export PRIM_ADMIN_KEY before running.");
  process.exit(1);
}

const PRIM_INTERNAL_KEY = process.env.PRIM_INTERNAL_KEY;
if (!PRIM_INTERNAL_KEY) {
  console.error("\n✗ PRIM_INTERNAL_KEY required for allowlist cleanup.");
  console.error("  Export PRIM_INTERNAL_KEY before running.");
  process.exit(1);
}

// ─── Test helpers ────────────────────────────────────────────────────────

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

// ─── Main ────────────────────────────────────────────────────────────────

let walletAddress = "";
const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);

async function main() {
  // ─── Generate fresh wallet ──────────────────────────────────────────

  console.log("\n─── Access request e2e smoke test ──────────────────────────\n");

  await step("Generate fresh wallet", async () => {
    walletAddress = getAddress(account.address);
    console.log(`(${walletAddress}) `);
  });

  // ─── Register wallet ────────────────────────────────────────────────

  console.log("\n─── Wallet registration ────────────────────────────────────\n");

  await step("Register wallet (EIP-191)", async () => {
    const timestamp = new Date().toISOString();
    const message = `Register ${walletAddress} with prim.sh at ${timestamp}`;
    const signature = await account.signMessage({ message });

    const res = await fetch(`${WALLET_URL}/v1/wallets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: walletAddress, signature, timestamp }),
      signal: AbortSignal.timeout(10_000),
    });

    if (res.status === 409) {
      console.log("(already registered) ");
      return;
    }
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    console.log("(registered) ");
  });

  // ─── Faucet ─────────────────────────────────────────────────────────

  console.log("\n─── Faucet ─────────────────────────────────────────────────\n");

  await step("Faucet USDC drip", async () => {
    const res = await fetch(`${FAUCET_URL}/v1/faucet/usdc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: walletAddress }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 429) {
      console.log("(rate limited — Step 7 may fail without USDC) ");
      return;
    }
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    console.log("(dripped) ");
  });

  // ─── Access request flow ─────────────────────────────────────────────

  console.log("\n─── Access request flow ────────────────────────────────────\n");

  const { createPrimFetch } = await import("../packages/x402-client/src/index.ts");
  const primFetch = createPrimFetch({ privateKey, maxPayment: "1.00" });

  let accessUrl = "";
  let requestId = "";

  await step("Hit paid endpoint → expect 403", async () => {
    const res = await primFetch(`${WALLET_URL}/v1/wallets`);
    if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    const body = (await res.json()) as { error?: string; access_url?: string };
    if (body.error !== "wallet_not_allowed") {
      throw new Error(`Expected error=wallet_not_allowed, got error=${body.error}`);
    }
    if (!body.access_url) throw new Error("Missing access_url in 403 body");
    accessUrl = body.access_url;
    console.log(`(access_url=${accessUrl}) `);
  });

  if (accessUrl) {
    await step("Submit access request", async () => {
      const res = await fetch(accessUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: walletAddress, reason: "e2e smoke test" }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}: ${await res.text()}`);
      const body = (await res.json()) as { status?: string; id?: string };
      if (body.status !== "pending") throw new Error(`Expected status=pending, got status=${body.status}`);
      if (!body.id) throw new Error("Missing id in access request response");
      requestId = body.id;
      console.log(`(request id=${requestId}) `);
    });
  }

  if (requestId) {
    await step("Admin approve request", async () => {
      const res = await fetch(`${API_URL}/api/access/requests/${requestId}/approve`, {
        method: "POST",
        headers: { "x-admin-key": PRIM_ADMIN_KEY as string },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${await res.text()}`);
      const body = (await res.json()) as { status?: string };
      if (body.status !== "approved") throw new Error(`Expected status=approved, got status=${body.status}`);
      console.log("(approved) ");
    });
  }

  await step("Retry paid endpoint → expect 200", async () => {
    const res = await primFetch(`${WALLET_URL}/v1/wallets`);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${await res.text()}`);
    console.log("(access granted) ");
  });
}

// ─── Run ──────────────────────────────────────────────────────────────────

try {
  await main();
} catch (err) {
  console.error("\n✗ Fatal:", err instanceof Error ? err.message : err);
} finally {
  // ─── Cleanup ────────────────────────────────────────────────────────
  if (walletAddress) {
    process.stdout.write("\n─── Cleanup ────────────────────────────────────────────────\n\n");
    process.stdout.write(`  Remove ${walletAddress} from allowlist... `);
    try {
      const res = await fetch(`${WALLET_URL}/internal/allowlist/${walletAddress}`, {
        method: "DELETE",
        headers: { "X-Internal-Key": PRIM_INTERNAL_KEY as string },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        console.log("✓");
      } else {
        console.log(`✗ (${res.status} — stale entry may remain)`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`✗ (${msg} — stale entry may remain)`);
    }
  }

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
