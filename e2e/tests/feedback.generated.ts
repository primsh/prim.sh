#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Regenerate: pnpm gen:tests
/**
 * feedback.sh — Tier 3 e2e-local test
 *
 * Boots feedback.sh locally, sends real HTTP requests with x402 on testnet.
 * Usage: source scripts/.env.testnet && bun e2e/tests/feedback.generated.ts
 */

import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";

const PORT = 3014;
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

let proc: ChildProcess;

async function start(): Promise<void> {
  const { mkdirSync } = await import("node:fs");
  const tmpHome = `/tmp/prim-e2e-feedback-${Date.now()}`;
  mkdirSync(tmpHome, { recursive: true });
  mkdirSync(`${tmpHome}/data`, { recursive: true });
  proc = spawn("bun", ["run", "packages/feedback/src/index.ts"], {
    env: {
      ...process.env,
      PORT: String(PORT),
      BUN_PORT: String(PORT),
      PRIM_HOME: tmpHome,
      PRIM_DATA_DIR: `${tmpHome}/data`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${URL}/`);
      if (res.ok) return;
    } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (stderr) console.error("Service stderr:", stderr.slice(0, 500));
  throw new Error("feedback.sh failed to start within 15s");
}

function stop(): void { if (proc) proc.kill("SIGTERM"); }

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err instanceof Error ? err.message : err}`);
    failed++;
  }
}

function assert(cond: boolean, msg: string): void { if (!cond) throw new Error(msg); }

console.log(`\nfeedback.sh e2e-local (testnet, ${URL})\n`);

await start();

try {
  await test("GET / → 200 health", async () => {
    const res = await fetch(`${URL}/`);
    assert(res.status === 200, `expected 200, got ${res.status}`);
    const body = await res.json() as { service: string };
    assert(body.service === "feedback.sh", `expected feedback.sh, got ${body.service}`);
  });

} finally {
  stop();
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
