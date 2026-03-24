#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Regenerate: pnpm gen:tests
/**
 * wallet.sh — Tier 3 e2e-local test
 *
 * Boots wallet.sh locally, sends real HTTP requests with x402 on testnet.
 * Usage: source scripts/.env.testnet && bun e2e/tests/wallet.generated.ts
 */

import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { createPrimFetch } from "@primsh/x402-client";

const PORT = 3001;
const URL = `http://localhost:${PORT}`;

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) { console.error(`Missing: ${name}`); process.exit(1); }
  return val;
}

const network = requireEnv("PRIM_NETWORK");
if (network !== "eip155:84532") {
  console.error("PRIM_NETWORK must be eip155:84532 (testnet)");
  process.exit(1);
}
const agentKey = requireEnv("AGENT_PRIVATE_KEY");

let proc: ChildProcess;

async function start(): Promise<void> {
  proc = spawn("bun", ["run", "packages/wallet/src/index.ts"], {
    env: { ...process.env, WALLET_PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${URL}/`);
      if (res.ok) return;
    } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("wallet.sh failed to start within 15s");
}

function stop(): void { if (proc) proc.kill("SIGTERM"); }

const primFetch = createPrimFetch({
  privateKey: agentKey as `0x${string}`,
  network,
});

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (err) { console.error(`  ✗ ${name}`); console.error(`    ${err instanceof Error ? err.message : err}`); failed++; }
}

function assert(cond: boolean, msg: string): void { if (!cond) throw new Error(msg); }

console.log(`\nwallet.sh e2e-local (testnet, ${URL})\n`);

await start();

try {
  await test("GET / → 200 health", async () => {
    const res = await fetch(`${URL}/`);
    assert(res.status === 200, `expected 200, got ${res.status}`);
    const body = await res.json() as { service: string };
    assert(body.service === "wallet.sh", `expected wallet.sh, got ${body.service}`);
  });

  await test("POST /v1/wallets → 402 without payment", async () => {
    const res = await fetch(`${URL}/v1/wallets`, { method: "POST", body: "{}" });
    assert(res.status === 402, `expected 402, got ${res.status}`);
  });

  await test("POST /v1/wallets → paid request", async () => {
    const res = await primFetch(`${URL}/v1/wallets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: "0x0000000000000000000000000000000000000001", signature: "test", timestamp: "test" }),
    });
    assert(res.status >= 200 && res.status < 300, `expected 2xx, got ${res.status}`);
  });
} finally {
  stop();
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);