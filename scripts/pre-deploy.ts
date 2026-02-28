#!/usr/bin/env bun
/**
 * Pre-deployment Readiness Check
 *
 * Verifies a primitive is ready to deploy to the VPS:
 *   1. Package exists — packages/<primitive>/src/index.ts present
 *   2. Unit tests pass — pnpm --filter @primsh/<primitive> test exits 0
 *   3. Required env vars — non-empty in current environment
 *   4. x402 config valid — PRIM_NETWORK and PRIM_PAY_TO well-formed
 *   5. Port not allocated — localhost:<port> not already in use
 *   6. External deps reachable — Qdrant / Stalwart / Base RPC health checks
 *   7. DNS resolves to VPS — <primitive>.prim.sh → <VPS_IP>
 *
 * Usage:
 *   bun scripts/pre-deploy.ts <primitive>
 *
 * Exit 0 = go
 * Exit 1 = no-go (failing checks listed)
 */

import { execSync } from "node:child_process";
import { resolve4 } from "node:dns/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadPrimitives } from "./lib/primitives.js";

// ─── Config ──────────────────────────────────────────────────────────────────

const VPS_IP = process.env.VPS_IP;
if (!VPS_IP) {
  console.error("Error: VPS_IP not set. Add it to .env or pass as env var.");
  process.exit(1);
}

const _prims = loadPrimitives();
const PRIMITIVES = _prims.filter((p) => p.port).map((p) => p.id);
const PORTS: Record<string, number> = Object.fromEntries(
  _prims
    .filter((p) => p.port)
    // biome-ignore lint/style/noNonNullAssertion: filtered by p.port truthiness check
    .map((p) => [p.id, p.port!]),
);

type Primitive = string;

// BEGIN:PRIM:ENV
const REQUIRED_ENV: Record<Primitive, string[]> = {
  wallet: ["PRIM_PAY_TO", "PRIM_NETWORK", "PRIM_INTERNAL_KEY"],
  faucet: ["PRIM_NETWORK", "CIRCLE_API_KEY", "CDP_API_KEY_ID", "CDP_API_KEY_SECRET", "FAUCET_REFILL_THRESHOLD_ETH", "FAUCET_REFILL_BATCH_SIZE"],
  gate: ["PRIM_NETWORK", "GATE_FUND_KEY", "GATE_CODES", "GATE_USDC_AMOUNT", "GATE_ETH_AMOUNT", "PRIM_ALLOWLIST_DB", "PRIM_INTERNAL_KEY"],
  store: ["PRIM_PAY_TO", "PRIM_NETWORK", "CLOUDFLARE_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "WALLET_INTERNAL_URL"],
  search: ["PRIM_PAY_TO", "PRIM_NETWORK", "TAVILY_API_KEY", "WALLET_INTERNAL_URL"],
  spawn: ["PRIM_PAY_TO", "PRIM_NETWORK", "DO_API_TOKEN", "WALLET_INTERNAL_URL"],
  email: ["PRIM_PAY_TO", "PRIM_NETWORK", "STALWART_URL", "STALWART_API_KEY", "EMAIL_DEFAULT_DOMAIN", "WALLET_INTERNAL_URL"],
  token: ["PRIM_PAY_TO", "PRIM_NETWORK", "TOKEN_MASTER_KEY", "TOKEN_DEPLOYER_ENCRYPTED_KEY", "BASE_RPC_URL", "WALLET_INTERNAL_URL"],
  mem: ["PRIM_PAY_TO", "PRIM_NETWORK", "QDRANT_URL", "GOOGLE_API_KEY", "WALLET_INTERNAL_URL"],
  domain: ["PRIM_PAY_TO", "PRIM_NETWORK", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ZONE_ID", "NAMESILO_API_KEY", "WALLET_INTERNAL_URL"],
  track: ["PRIM_PAY_TO", "PRIM_NETWORK", "TRACKINGMORE_API_KEY", "WALLET_INTERNAL_URL"],
  feedback: ["PRIM_INTERNAL_KEY", "FEEDBACK_DB_PATH"],
  infer: ["PRIM_PAY_TO", "PRIM_NETWORK", "OPENROUTER_API_KEY", "WALLET_INTERNAL_URL"],
  create: ["PRIM_NETWORK", "WALLET_INTERNAL_URL"],
  imagine: ["PRIM_PAY_TO", "PRIM_NETWORK", "GEMINI_API_KEY", "WALLET_INTERNAL_URL"],
};
// END:PRIM:ENV

// ─── Helpers ─────────────────────────────────────────────────────────────────

let failures = 0;

function pass(label: string, detail?: string) {
  console.log(`  \u2713 ${label}${detail ? ` (${detail})` : ""}`);
}

function fail(label: string, detail?: string) {
  console.log(`  \u2717 ${label}${detail ? ` — ${detail}` : ""}`);
  failures++;
}

function warn(label: string, detail?: string) {
  console.log(`  \u26A0 ${label}${detail ? ` — ${detail}` : ""}`);
}

function header(title: string) {
  console.log(`\n--- ${title} ${"─".repeat(56 - title.length)}\n`);
}

// ─── 1. Package exists ────────────────────────────────────────────────────────

function checkPackageExists(primitive: Primitive) {
  header("Package");
  const dir = resolve(process.cwd(), "packages", primitive);
  const entry = resolve(dir, "src", "index.ts");

  if (!existsSync(dir)) {
    fail(`packages/${primitive}/`, "directory not found");
    return false;
  }
  if (!existsSync(entry)) {
    fail(`packages/${primitive}/src/index.ts`, "file not found");
    return false;
  }
  pass(`packages/${primitive}/src/index.ts`);
  return true;
}

// ─── 2. Unit tests ───────────────────────────────────────────────────────────

function checkTests(primitive: Primitive) {
  header("Unit Tests");
  const filter = `@primsh/${primitive}`;
  try {
    const output = execSync(`pnpm --filter "${filter}" test 2>&1`, {
      cwd: process.cwd(),
      timeout: 120_000,
      encoding: "utf-8",
    });

    const passMatch = output.match(/Tests\s+(\d+) passed/);
    const fileMatch = output.match(/Test Files\s+(\d+) passed/);

    if (fileMatch && passMatch) {
      pass(`${passMatch[1]} tests in ${fileMatch[1]} files`);
    } else if (output.includes("no tests") || output.includes("No test files")) {
      warn("no tests found", "add vitest tests before deploying");
    } else {
      pass("pnpm test completed");
    }
  } catch (err) {
    const stdout =
      typeof (err as { stdout?: string }).stdout === "string"
        ? (err as { stdout: string }).stdout
        : err instanceof Error
          ? err.message
          : String(err);

    const failMatch = stdout.match(/(\d+) failed/);
    const passMatch = stdout.match(/(\d+) passed/);
    if (failMatch) {
      fail(`${failMatch[1]} test(s) failed`, passMatch ? `${passMatch[1]} passed` : undefined);
    } else {
      fail("pnpm test", stdout.slice(0, 120));
    }
  }
}

// ─── 3. Required env vars ─────────────────────────────────────────────────────

function checkEnvVars(primitive: Primitive) {
  header("Required Env Vars");
  const required = REQUIRED_ENV[primitive];
  let allPresent = true;

  for (const key of required) {
    const val = process.env[key];
    if (!val) {
      fail(key, "not set or empty");
      allPresent = false;
    } else {
      pass(key);
    }
  }

  return allPresent;
}

// ─── 4. x402 config ──────────────────────────────────────────────────────────

function checkX402Config(primitive: Primitive) {
  header("x402 Config");

  const network = process.env.PRIM_NETWORK;
  const validNetworks = ["eip155:8453", "eip155:84532"];

  if (!validNetworks.includes(network ?? "")) {
    fail(
      "PRIM_NETWORK",
      `must be eip155:8453 (mainnet) or eip155:84532 (testnet), got: ${network ?? "(unset)"}`,
    );
  } else {
    const label = network === "eip155:8453" ? "mainnet" : "testnet";
    pass("PRIM_NETWORK", `${network} (${label})`);
  }

  // faucet has no PRIM_PAY_TO requirement
  if (primitive === "faucet") {
    pass("PRIM_PAY_TO", "skipped for faucet");
    return;
  }

  const payTo = process.env.PRIM_PAY_TO ?? "";
  const ethAddressPattern = /^0x[0-9a-fA-F]{40}$/;
  if (!ethAddressPattern.test(payTo)) {
    fail("PRIM_PAY_TO", `not a valid 0x address, got: ${payTo || "(unset)"}`);
  } else {
    pass("PRIM_PAY_TO", payTo);
  }
}

// ─── 5. Port not allocated ────────────────────────────────────────────────────

async function checkPort(primitive: Primitive) {
  header("Port");
  const port = PORTS[primitive];

  try {
    const res = await fetch(`http://localhost:${port}/`, {
      signal: AbortSignal.timeout(1_000),
    });
    // Got a response — something is already listening
    if (res.ok) {
      warn(`port ${port}`, "already in use — OK if this is a redeploy");
    } else {
      warn(`port ${port}`, `already in use (HTTP ${res.status}) — OK if redeploy`);
    }
  } catch {
    // Connection refused or timeout = port is free
    pass(`port ${port}`, "available");
  }
}

// ─── 6. External deps reachable ──────────────────────────────────────────────

async function checkExternalDeps(primitive: Primitive) {
  if (!["mem", "email", "token"].includes(primitive)) return;

  header("External Dependencies");

  if (primitive === "mem") {
    const qdrantUrl = process.env.QDRANT_URL;
    if (!qdrantUrl) {
      fail("Qdrant", "QDRANT_URL not set — cannot check reachability");
      return;
    }
    try {
      // Try /healthz first, fall back to /
      let url = `${qdrantUrl.replace(/\/$/, "")}/healthz`;
      let res: Response;
      try {
        res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      } catch {
        url = `${qdrantUrl.replace(/\/$/, "")}/`;
        res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      }
      if (res.ok) {
        pass("Qdrant", `${qdrantUrl} reachable`);
      } else {
        fail("Qdrant", `HTTP ${res.status} from ${qdrantUrl}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fail("Qdrant", msg.slice(0, 100));
    }
  }

  if (primitive === "email") {
    const stalwartUrl = process.env.STALWART_URL;
    if (!stalwartUrl) {
      fail("Stalwart", "STALWART_URL not set — cannot check reachability");
      return;
    }
    try {
      const res = await fetch(`${stalwartUrl.replace(/\/$/, "")}/`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok || res.status === 401 || res.status === 404) {
        // 401/404 means the server is up but rejected our anon request — still reachable
        pass("Stalwart", `${stalwartUrl} reachable (HTTP ${res.status})`);
      } else {
        fail("Stalwart", `HTTP ${res.status} from ${stalwartUrl}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fail("Stalwart", msg.slice(0, 100));
    }
  }

  if (primitive === "token") {
    const rpcUrl = process.env.BASE_RPC_URL;
    if (!rpcUrl) {
      fail("Base RPC", "BASE_RPC_URL not set — cannot check reachability");
      return;
    }
    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_blockNumber",
          params: [],
          id: 1,
        }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) {
        fail("Base RPC", `HTTP ${res.status} from ${rpcUrl}`);
        return;
      }
      const data = (await res.json()) as { result?: string; error?: { message: string } };
      if (data.error) {
        fail("Base RPC", data.error.message);
      } else if (data.result) {
        const block = Number.parseInt(data.result, 16);
        pass("Base RPC", `${rpcUrl} reachable, block #${block}`);
      } else {
        fail("Base RPC", "unexpected response shape");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fail("Base RPC", msg.slice(0, 100));
    }
  }
}

// ─── 7. DNS ──────────────────────────────────────────────────────────────────

async function checkDns(primitive: Primitive) {
  header("DNS");
  const host = `${primitive}.prim.sh`;

  try {
    const addrs = await resolve4(host);
    if (addrs.includes(VPS_IP)) {
      pass(host, VPS_IP);
    } else {
      warn(
        host,
        `resolves to ${addrs.join(", ")} (expected ${VPS_IP}) — update DNS before going live`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warn(host, `not yet resolvable (${msg.slice(0, 60)}) — set DNS A record before going live`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const primitive = process.argv[2] as Primitive | undefined;

  if (!primitive || !PRIMITIVES.includes(primitive)) {
    console.error("\nUsage: bun scripts/pre-deploy.ts <primitive>");
    console.error(`\nKnown primitives: ${PRIMITIVES.join(", ")}\n`);
    process.exit(1);
  }

  console.log(`\n=== Pre-Deploy Check: ${primitive}.prim.sh ===`);

  const pkgOk = checkPackageExists(primitive);
  if (!pkgOk) {
    // No point running tests if the package doesn't exist
    console.log(`\n--- Result ${"─".repeat(47)}\n`);
    console.log("  Package not found — aborting remaining checks.\n");
    process.exit(1);
  }

  checkTests(primitive);
  checkEnvVars(primitive);
  checkX402Config(primitive);
  await checkPort(primitive);
  await checkExternalDeps(primitive);
  await checkDns(primitive);

  header("Result");
  if (failures === 0) {
    console.log(`  All checks passed. ${primitive}.prim.sh is ready to deploy.\n`);
    process.exit(0);
  } else {
    console.log(`  ${failures} check(s) failed — do not deploy until resolved.\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\nFatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
