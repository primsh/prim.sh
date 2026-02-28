#!/usr/bin/env bun
/**
 * CLI Smoke Test (L-36) — exercises the full prim workflow through the CLI binary.
 *
 * Creates an ephemeral PRIM_HOME (isolated from real ~/.prim/) and runs:
 *   1. prim wallet create
 *   2. prim wallet register     (EIP-191 registration with wallet.prim.sh)
 *   3. prim faucet usdc         (429 rate-limit is non-fatal; continue if already funded)
 *   4. Poll prim wallet balance until funded (≤60s)
 *   5. prim store create-bucket
 *   6. prim store put
 *   7. prim store get           (verify content round-trips correctly)
 *   8. prim store rm            (cleanup — also in finally trap)
 *   9. prim store rm-bucket     (cleanup — also in finally trap)
 *
 * Note: this script runs against packages/cli/src/cli.ts via `bun run`.
 * Once L-11 (compiled binary) is done, swap CLI_PATH → path to compiled `prim` binary.
 *
 * Run from VPS (public DNS resolves *.prim.sh):
 *   PATH=/home/prim/.bun/bin:$PATH bun run scripts/smoke-cli.ts
 *
 * URL overrides (forwarded to prim subprocesses via env):
 *   PRIM_WALLET_URL  — override wallet URL (default: https://wallet.prim.sh)
 *   PRIM_FAUCET_URL  — override faucet URL (default: https://faucet.prim.sh)
 *   PRIM_STORE_URL   — override store URL  (default: https://store.prim.sh)
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ─── Ephemeral keystore ──────────────────────────────────────────────────────

const PRIM_HOME = mkdtempSync(join(tmpdir(), "prim-smoke-cli-"));
mkdirSync(join(PRIM_HOME, "keys"), { recursive: true });
// Set Base Sepolia — smoke test is testnet-only
writeFileSync(join(PRIM_HOME, "config.toml"), 'network = "eip155:84532"\n', "utf-8");

// ─── CLI runner ──────────────────────────────────────────────────────────────

const CLI_PATH = join(import.meta.dir, "..", "packages", "keystore", "src", "cli.ts");
const CLI = ["bun", "run", CLI_PATH];

const ENV: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
  ),
  PRIM_HOME,
};

async function prim(...args: string[]): Promise<string> {
  const proc = Bun.spawn([...CLI, ...args], {
    env: ENV,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(err.trim() || out.trim());
  return out.trim();
}

// ─── Step runner ─────────────────────────────────────────────────────────────

const steps: { name: string; passed: boolean; error?: string }[] = [];

async function step(name: string, fn: () => Promise<void>): Promise<void> {
  process.stdout.write(`  ${name}... `);
  try {
    await fn();
    steps.push({ name, passed: true });
    console.log("✓");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    steps.push({ name, passed: false, error: msg });
    console.log(`✗  ${msg}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Main ────────────────────────────────────────────────────────────────────

let walletAddress = "";
let bucketId = "";

try {
  console.log("\n─── prim CLI smoke test (L-36) ─────────────────────────────\n");
  console.log(`  PRIM_HOME: ${PRIM_HOME}\n`);

  // 1. Wallet create
  await step("prim wallet create", async () => {
    const out = await prim("wallet", "create");
    const match = out.match(/Created wallet: (0x[0-9a-fA-F]{40})/);
    if (!match?.[1]) throw new Error(`Unexpected output: ${out}`);
    walletAddress = match[1];
    process.stdout.write(`(${walletAddress}) `);
  });

  if (!walletAddress) {
    console.error("\nFatal: wallet address not captured, cannot continue.");
    process.exit(1);
  }

  // 2. Register with wallet.prim.sh (required before x402 payments)
  await step("prim wallet register", async () => {
    const out = await prim("wallet", "register");
    process.stdout.write(`(${out}) `);
  });

  // 3. Faucet USDC — rate-limit (429) is non-fatal; balance poll handles the rest
  await step("prim faucet usdc", async () => {
    try {
      const txHash = await prim("faucet", "usdc", "--quiet");
      if (!txHash.startsWith("0x")) throw new Error(`Expected tx hash, got: ${txHash}`);
      process.stdout.write(`(${txHash.slice(0, 18)}...) `);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("rate_limited") || msg.includes("rate limited")) {
        process.stdout.write("(rate-limited — will check balance) ");
        return; // non-fatal: continue to balance poll
      }
      throw err;
    }
  });

  // 4. Poll balance until funded
  await step("poll balance until funded (≤60s)", async () => {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const out = await prim("wallet", "balance");
      if (!out.includes("(unfunded)")) {
        const match = out.match(/([\d.]+) USDC/);
        process.stdout.write(`(${match?.[1] ?? "?"} USDC) `);
        return;
      }
      await sleep(5_000);
    }
    throw new Error("Wallet still unfunded after 60s — faucet may be slow or rate-limited");
  });

  // 5. Create bucket
  await step("prim store create-bucket", async () => {
    const name = `smoke-${Date.now()}`;
    bucketId = await prim("store", "create-bucket", `--name=${name}`, "--quiet");
    if (!bucketId) throw new Error("Empty bucket ID returned");
    process.stdout.write(`(${bucketId}) `);
  });

  if (bucketId) {
    const PAYLOAD = "prim smoke test content";
    const tmpFile = join(PRIM_HOME, "smoke.txt");
    writeFileSync(tmpFile, PAYLOAD, "utf-8");

    // 6. Put object
    await step("prim store put", async () => {
      await prim("store", "put", bucketId, "smoke.txt", `--file=${tmpFile}`, "--quiet");
    });

    // 7. Get object and verify round-trip
    await step("prim store get (verify content)", async () => {
      const content = await prim("store", "get", bucketId, "smoke.txt");
      if (content !== PAYLOAD) {
        throw new Error(`Content mismatch: expected "${PAYLOAD}", got "${content}"`);
      }
    });

    // 8. Cleanup: object
    await step("prim store rm (cleanup)", async () => {
      await prim("store", "rm", bucketId, "smoke.txt", "--quiet");
    });

    // 9. Cleanup: bucket
    await step("prim store rm-bucket (cleanup)", async () => {
      await prim("store", "rm-bucket", bucketId, "--quiet");
      bucketId = "";
    });
  }
} finally {
  // Cleanup trap: delete bucket even if killed mid-run
  if (bucketId) {
    try {
      await prim("store", "rm", bucketId, "smoke.txt", "--quiet");
    } catch {
      /* object may not exist */
    }
    try {
      await prim("store", "rm-bucket", bucketId, "--quiet");
    } catch {
      /* bucket may not exist */
    }
  }

  rmSync(PRIM_HOME, { recursive: true, force: true });

  console.log("\n─── Summary ─────────────────────────────────────────────────\n");
  const passed = steps.filter((s) => s.passed).length;
  const failed = steps.filter((s) => !s.passed).length;
  console.log(`  ${passed} passed, ${failed} failed out of ${steps.length} steps`);
  if (failed > 0) {
    console.log("\n  Failures:");
    for (const s of steps.filter((s) => !s.passed)) {
      console.log(`    ✗ ${s.name}: ${s.error}`);
    }
    console.log();
    process.exit(1);
  }
  console.log();
}
