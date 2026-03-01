#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Live Smoke Test — Core 4 services at *.prim.sh
 *
 * Runs against live HTTPS endpoints (not localhost). Verifies:
 *   1. Health checks for all 4 services
 *   2. Wallet registration via EIP-191 signature
 *   3. Store CRUD with on-chain x402 settlement
 *   4. Faucet USDC drip (if CIRCLE_API_KEY set)
 *   5. Spawn SSH key + server lifecycle (if DO_API_TOKEN set)
 *
 * Usage:
 *   set -a && source scripts/.env.testnet && set +a && bun run scripts/smoke-live.ts
 *   bun run scripts/smoke-live.ts --health-only   # Just check health endpoints
 *
 * Env vars:
 *   AGENT_PRIVATE_KEY   — agent wallet private key (required for x402 tests)
 *   PRIM_NETWORK        — must be eip155:84532 (Base Sepolia)
 *   CIRCLE_API_KEY      — enables faucet test (optional)
 *   DO_API_TOKEN        — enables spawn test (optional)
 */

import { getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// ─── Config ──────────────────────────────────────────────────────────────

const HEALTH_ONLY = process.argv.includes("--health-only");

const WALLET_URL = "https://wallet.prim.sh";
const STORE_URL = "https://store.prim.sh";
const FAUCET_URL = "https://faucet.prim.sh";
const SPAWN_URL = "https://spawn.prim.sh";
const SEARCH_URL = "https://search.prim.sh";
const EMAIL_URL = "https://email.prim.sh";

const HAS_DO_TOKEN = !!process.env.DO_API_TOKEN;
const HAS_CIRCLE_KEY = !!process.env.CIRCLE_API_KEY;

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

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n─── Health checks ──────────────────────────────────────────\n");

  for (const [name, url] of [
    ["wallet.prim.sh", WALLET_URL],
    ["store.prim.sh", STORE_URL],
    ["faucet.prim.sh", FAUCET_URL],
    ["spawn.prim.sh", SPAWN_URL],
    ["search.prim.sh", SEARCH_URL],
    ["email.prim.sh", EMAIL_URL],
  ] as const) {
    await step(`Health: ${name}`, async () => {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = (await res.json()) as { status: string };
      if (data.status !== "ok") throw new Error(`status=${data.status}`);
    });
  }

  if (HEALTH_ONLY) return;

  // ─── Preflight ──────────────────────────────────────────────────────

  const network = process.env.PRIM_NETWORK;
  if (network !== "eip155:84532") {
    console.error(
      `\n✗ PRIM_NETWORK must be eip155:84532 (Base Sepolia). Got: ${network ?? "(unset)"}`,
    );
    console.error("  This script refuses to run on mainnet.");
    process.exit(1);
  }

  const agentKey = process.env.AGENT_PRIVATE_KEY as `0x${string}` | undefined;
  if (!agentKey) {
    console.error("\n✗ AGENT_PRIVATE_KEY required for x402 tests.");
    console.error("  source scripts/.env.testnet first, or pass --health-only");
    process.exit(1);
  }

  const account = privateKeyToAccount(agentKey);
  const walletAddress = getAddress(account.address);
  console.log(`\n  Agent: ${walletAddress}`);
  if (!HAS_CIRCLE_KEY) console.log("  ⚠ CIRCLE_API_KEY not set — faucet test skipped");
  if (!HAS_DO_TOKEN) console.log("  ⚠ DO_API_TOKEN not set — spawn tests skipped");

  // ─── Wallet ─────────────────────────────────────────────────────────

  console.log("\n─── Wallet registration ────────────────────────────────────\n");

  await step("Register wallet (EIP-191)", async () => {
    const timestamp = new Date().toISOString();
    const message = `Register ${walletAddress} with prim.sh at ${timestamp}`;
    const signature = await account.signMessage({ message });

    const res = await fetch(`${WALLET_URL}/v1/wallets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: walletAddress, signature, timestamp }),
    });

    if (res.status === 409) {
      console.log("(already registered) ");
      return;
    }
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    console.log("(registered) ");
  });

  // ─── Faucet ─────────────────────────────────────────────────────────

  if (HAS_CIRCLE_KEY) {
    console.log("\n─── Faucet ─────────────────────────────────────────────────\n");

    await step("Faucet USDC drip", async () => {
      const res = await fetch(`${FAUCET_URL}/v1/faucet/usdc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: walletAddress }),
      });
      if (!res.ok) {
        const text = await res.text();
        // 429 = rate limited, not a service failure
        if (res.status === 429) {
          console.log("(rate limited — OK) ");
          return;
        }
        throw new Error(`${res.status}: ${text}`);
      }
      console.log("(dripped) ");
    });
  }

  // ─── Balance check ──────────────────────────────────────────────────

  console.log("\n─── Balance ────────────────────────────────────────────────\n");

  await step("Check USDC balance", async () => {
    const { getUsdcBalance } = await import("../packages/wallet/src/balance.ts");
    const { balance, funded } = await getUsdcBalance(walletAddress as `0x${string}`);
    console.log(`(${balance} USDC, funded=${funded}) `);
    if (!funded) {
      console.log("\n    ⚠ Wallet not funded. Store x402 tests will fail.");
    }
  });

  // ─── Store CRUD via x402 ────────────────────────────────────────────

  console.log("\n─── Store (x402) ───────────────────────────────────────────\n");

  const { createPrimFetch } = await import("../packages/x402-client/src/index.ts");
  const primFetch = createPrimFetch({ privateKey: agentKey, maxPayment: "1.00" });

  let bucketId: string | null = null;

  await step("Create bucket via x402", async () => {
    const res = await primFetch(`${STORE_URL}/v1/buckets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `smoke-${Date.now()}` }),
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { bucket: { id: string; name: string } };
    bucketId = data.bucket.id;
    console.log(`(bucket: ${bucketId}) `);
  });

  if (bucketId) {
    await step("Upload object via x402", async () => {
      const res = await primFetch(`${STORE_URL}/v1/buckets/${bucketId}/objects/smoke.txt`, {
        method: "PUT",
        headers: { "Content-Type": "text/plain", "Content-Length": "10" },
        body: "smoke test",
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    });

    await step("Download object via x402", async () => {
      const res = await primFetch(`${STORE_URL}/v1/buckets/${bucketId}/objects/smoke.txt`);
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      const body = await res.text();
      if (body !== "smoke test") throw new Error(`Expected "smoke test", got "${body}"`);
    });

    await step("Get quota via x402", async () => {
      const res = await primFetch(`${STORE_URL}/v1/buckets/${bucketId}/quota`);
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      const data = (await res.json()) as { usage_bytes: number };
      if (data.usage_bytes !== 10)
        throw new Error(`Expected usage_bytes=10, got ${data.usage_bytes}`);
    });

    await step("Delete object via x402", async () => {
      const res = await primFetch(`${STORE_URL}/v1/buckets/${bucketId}/objects/smoke.txt`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    });

    await step("Delete bucket via x402", async () => {
      const res = await primFetch(`${STORE_URL}/v1/buckets/${bucketId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      bucketId = null;
    });
  }

  // ─── Search via x402 ───────────────────────────────────

  console.log("\n─── Search (x402) ──────────────────────────────────────────\n");

  await step("Web search via x402", async () => {
    const res = await primFetch(`${SEARCH_URL}/v1/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "TypeScript programming language", max_results: 3 }),
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { results: { title: string; url: string }[] };
    if (!data.results?.length) throw new Error("No search results returned");
    console.log(`(${data.results.length} results) `);
  });

  await step("News search via x402", async () => {
    const res = await primFetch(`${SEARCH_URL}/v1/search/news`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "artificial intelligence", max_results: 3 }),
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { results: { title: string; url: string }[] };
    if (!data.results?.length) throw new Error("No news results returned");
    console.log(`(${data.results.length} results) `);
  });

  await step("URL extract via x402", async () => {
    const res = await primFetch(`${SEARCH_URL}/v1/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: "https://www.typescriptlang.org", format: "markdown" }),
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { results: { url: string; content: string }[] };
    if (!data.results?.length) throw new Error("No extract results returned");
    if (!data.results[0].content) throw new Error("Extract content is empty");
    console.log(`(${data.results[0].content.length} chars) `);
  });

  // ─── Email via x402 ─────────────────────────────────────────────────

  console.log("\n─── Email (x402) ───────────────────────────────────────────\n");

  let mailboxId: string | null = null;

  await step("Create mailbox via x402", async () => {
    const res = await primFetch(`${EMAIL_URL}/v1/mailboxes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { id: string; address: string };
    mailboxId = data.id;
    console.log(`(mailbox: ${data.address}) `);
  });

  if (mailboxId) {
    await step("List mailboxes via x402", async () => {
      const res = await primFetch(`${EMAIL_URL}/v1/mailboxes`);
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      const data = (await res.json()) as { mailboxes: { id: string }[]; total: number };
      if (!data.mailboxes?.length) throw new Error("No mailboxes returned");
      console.log(`(${data.total} total) `);
    });

    await step("Get mailbox via x402", async () => {
      const res = await primFetch(`${EMAIL_URL}/v1/mailboxes/${mailboxId}`);
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    });

    await step("List messages via x402", async () => {
      const res = await primFetch(`${EMAIL_URL}/v1/mailboxes/${mailboxId}/messages`);
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      const data = (await res.json()) as { messages: unknown[]; total: number };
      console.log(`(${data.total} messages) `);
    });

    await step("Delete mailbox via x402", async () => {
      const res = await primFetch(`${EMAIL_URL}/v1/mailboxes/${mailboxId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      mailboxId = null;
    });
  }

  // Cleanup on failure
  if (mailboxId) {
    console.log("\n  Cleaning up email resources...");
    try {
      await primFetch(`${EMAIL_URL}/v1/mailboxes/${mailboxId}`, { method: "DELETE" });
      console.log("  ✓ Cleaned up mailbox");
    } catch {
      console.log("  ✗ Mailbox cleanup failed");
    }
  }

  // ─── Spawn (optional) ──────────────────────────────────────────────

  if (!HAS_DO_TOKEN) {
    console.log("\n  Skipping spawn.sh tests — no DO_API_TOKEN");
  } else {
    console.log("\n─── Spawn (x402) ───────────────────────────────────────────\n");

    let sshKeyId: string | null = null;
    let serverId: string | null = null;

    await step("Register SSH key via x402", async () => {
      const { execSync } = await import("node:child_process");
      const { mkdtempSync, readFileSync, rmSync } = await import("node:fs");
      const { join } = await import("node:path");
      const { tmpdir } = await import("node:os");

      const dir = mkdtempSync(join(tmpdir(), "prim-smoke-"));
      const keyPath = join(dir, "id_ed25519");
      execSync(`ssh-keygen -t ed25519 -f ${keyPath} -N "" -q`);
      const pubKey = readFileSync(`${keyPath}.pub`, "utf-8").trim();
      rmSync(dir, { recursive: true });

      const res = await primFetch(`${SPAWN_URL}/v1/ssh-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `smoke-${Date.now()}`, public_key: pubKey }),
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      const data = (await res.json()) as { id: string };
      sshKeyId = data.id;
      console.log(`(key: ${sshKeyId}) `);
    });

    await step("Create server via x402", async () => {
      const res = await primFetch(`${SPAWN_URL}/v1/servers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `smoke-${Date.now()}`,
          type: "small",
          image: "ubuntu-24.04",
          location: "nyc3",
          ssh_keys: sshKeyId ? [sshKeyId] : [],
        }),
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      const data = (await res.json()) as { server: { id: string } };
      serverId = data.server.id;
      console.log(`(server: ${serverId}) `);
    });

    if (serverId) {
      await step("Poll server until active (up to 120s)", async () => {
        const deadline = Date.now() + 120_000;
        while (Date.now() < deadline) {
          const res = await primFetch(`${SPAWN_URL}/v1/servers/${serverId}`);
          if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
          const data = (await res.json()) as {
            status: string;
            public_net?: { ipv4?: { ip?: string } };
          };
          if (data.status === "active") {
            console.log(`(ip: ${data.public_net?.ipv4?.ip}) `);
            return;
          }
          await sleep(5_000);
        }
        throw new Error("Server did not become active within 120s");
      });

      await step("Delete server via x402", async () => {
        const res = await primFetch(`${SPAWN_URL}/v1/servers/${serverId}`, { method: "DELETE" });
        if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
        serverId = null;
      });
    }

    if (sshKeyId) {
      await step("Delete SSH key via x402", async () => {
        const res = await primFetch(`${SPAWN_URL}/v1/ssh-keys/${sshKeyId}`, { method: "DELETE" });
        if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
        sshKeyId = null;
      });
    }

    // Cleanup on failure
    if (serverId || sshKeyId) {
      console.log("\n  Cleaning up spawn resources...");
      if (serverId) {
        try {
          await primFetch(`${SPAWN_URL}/v1/servers/${serverId}`, { method: "DELETE" });
          console.log("  ✓ Cleaned up server");
        } catch {
          console.log("  ✗ Server cleanup failed");
        }
      }
      if (sshKeyId) {
        try {
          await primFetch(`${SPAWN_URL}/v1/ssh-keys/${sshKeyId}`, { method: "DELETE" });
          console.log("  ✓ Cleaned up SSH key");
        } catch {
          console.log("  ✗ SSH key cleanup failed");
        }
      }
    }
  }
}

// ─── Run ──────────────────────────────────────────────────────────────────

try {
  await main();
} catch (err) {
  console.error("\n✗ Fatal:", err instanceof Error ? err.message : err);
} finally {
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
