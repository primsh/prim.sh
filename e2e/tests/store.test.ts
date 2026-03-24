#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * store.sh — Tier 3 e2e-local tests
 *
 * Boots store.sh locally with Bun, sends real HTTP requests with x402 payment
 * on Base Sepolia testnet. Tests the full path: HTTP → x402 → service → R2.
 *
 * Requires .env.testnet sourced: PRIM_NETWORK=eip155:84532, R2 creds,
 * AGENT_PRIVATE_KEY (funded testnet wallet), REVENUE_WALLET.
 *
 * Usage:
 *   source scripts/.env.testnet && bun run e2e/tests/store.test.ts
 *
 * This is a Bun script (not vitest) because it needs:
 *   1. Real bun:sqlite (not Node's experimental SQLite)
 *   2. Real x402 payment signing via @primsh/x402-client
 *   3. A running Bun process for store.sh
 */

import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { createPrimFetch } from "@primsh/x402-client";

// ─── Config ──────────────────────────────────────────────────────────────

const STORE_PORT = Number(process.env.STORE_PORT ?? "3002");
const STORE_URL = `http://localhost:${STORE_PORT}`;
const TEST_PREFIX = `e2e-${Date.now()}`;

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.error(`✗ Missing: ${name}. Source scripts/.env.testnet first.`);
    process.exit(1);
  }
  return val;
}

const network = requireEnv("PRIM_NETWORK");
if (network !== "eip155:84532") {
  console.error(`✗ PRIM_NETWORK must be eip155:84532. Got: ${network}. Refusing to run on mainnet.`);
  process.exit(1);
}

requireEnv("REVENUE_WALLET");
requireEnv("CLOUDFLARE_API_TOKEN");
requireEnv("CLOUDFLARE_ACCOUNT_ID");
requireEnv("R2_ACCESS_KEY_ID");
requireEnv("R2_SECRET_ACCESS_KEY");
const agentKey = requireEnv("AGENT_PRIVATE_KEY");

// ─── Service lifecycle ───────────────────────────────────────────────────

let storeProc: ChildProcess;

async function startStore(): Promise<void> {
  storeProc = spawn("bun", ["run", "packages/store/src/index.ts"], {
    env: { ...process.env, STORE_PORT: String(STORE_PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Wait for health check
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${STORE_URL}/`);
      if (res.ok) return;
    } catch {
      /* not ready yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("store.sh failed to start within 15s");
}

function stopStore(): void {
  if (storeProc) storeProc.kill("SIGTERM");
}

// ─── x402 client ─────────────────────────────────────────────────────────

const primFetch = createPrimFetch({
  privateKey: agentKey as `0x${string}`,
  network,
});

// ─── Test runner ─────────────────────────────────────────────────────────

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

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

// ─── Tests ───────────────────────────────────────────────────────────────

console.log(`\nstore.sh e2e-local (testnet, ${STORE_URL})\n`);

await startStore();

let bucketId = "";
const bucketName = `${TEST_PREFIX}-bucket`;
const objectKey = "e2e-test.txt";
const objectContent = "e2e test content";

try {
  await test("health check", async () => {
    const res = await fetch(`${STORE_URL}/`);
    assert(res.status === 200, `expected 200, got ${res.status}`);
    const body = (await res.json()) as { service: string };
    assert(body.service === "store.sh", `expected store.sh, got ${body.service}`);
  });

  await test("402 without payment", async () => {
    const res = await fetch(`${STORE_URL}/v1/buckets`, { method: "POST", body: "{}" });
    assert(res.status === 402, `expected 402, got ${res.status}`);
  });

  await test("POST /v1/buckets creates bucket (x402 paid)", async () => {
    const res = await primFetch(`${STORE_URL}/v1/buckets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: bucketName }),
    });
    assert(res.status === 201, `expected 201, got ${res.status}`);
    const body = (await res.json()) as { bucket: { id: string } };
    bucketId = body.bucket.id;
    assert(!!bucketId, "bucket ID missing");
  });

  await test("GET /v1/buckets lists buckets", async () => {
    const res = await primFetch(`${STORE_URL}/v1/buckets`);
    assert(res.status === 200, `expected 200, got ${res.status}`);
    const body = (await res.json()) as { items: Array<{ id: string }> };
    assert(
      body.items.some((b) => b.id === bucketId),
      "created bucket not in list",
    );
  });

  await test("PUT /v1/buckets/:id/objects/:key uploads object", async () => {
    const res = await primFetch(`${STORE_URL}/v1/buckets/${bucketId}/objects/${objectKey}`, {
      method: "PUT",
      headers: { "Content-Type": "text/plain", "Content-Length": String(objectContent.length) },
      body: objectContent,
    });
    assert(res.status === 200, `expected 200, got ${res.status}`);
  });

  await test("GET /v1/buckets/:id/objects/:key downloads object", async () => {
    const res = await primFetch(`${STORE_URL}/v1/buckets/${bucketId}/objects/${objectKey}`);
    assert(res.status === 200, `expected 200, got ${res.status}`);
    const text = await res.text();
    assert(text === objectContent, `content mismatch: ${text}`);
  });

  await test("DELETE /v1/buckets/:id/objects/:key removes object", async () => {
    const res = await primFetch(`${STORE_URL}/v1/buckets/${bucketId}/objects/${objectKey}`, {
      method: "DELETE",
    });
    assert(res.status === 200, `expected 200, got ${res.status}`);
  });

  await test("DELETE /v1/buckets/:id removes bucket", async () => {
    const res = await primFetch(`${STORE_URL}/v1/buckets/${bucketId}`, { method: "DELETE" });
    assert(res.status === 200, `expected 200, got ${res.status}`);
    bucketId = "";
  });
} finally {
  // Cleanup: best-effort delete if tests failed mid-way
  if (bucketId) {
    try {
      await primFetch(`${STORE_URL}/v1/buckets/${bucketId}/objects/${objectKey}`, { method: "DELETE" });
    } catch {
      /* ignore */
    }
    try {
      await primFetch(`${STORE_URL}/v1/buckets/${bucketId}`, { method: "DELETE" });
    } catch {
      /* ignore */
    }
  }
  stopStore();
}

// ─── Summary ─────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
