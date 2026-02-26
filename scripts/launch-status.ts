#!/usr/bin/env bun
/**
 * Launch Readiness Dashboard
 *
 * Shows only hard pre-launch requirements:
 *   1. Tests     — all tests must pass
 *   2. Endpoints — all live services must respond
 *   3. DNS       — all live services must resolve to VPS
 *   4. Blockers  — critical-path tasks that gate launch
 *
 * Usage:
 *   bun scripts/launch-status.ts
 *
 * Exit 0 = all checks pass + no blockers
 * Exit 1 = failures detected
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve4 } from "node:dns/promises";
import { loadPrimitives, deployed } from "./lib/primitives.js";
// Tasks (parseTasks) intentionally removed — blockers list captures what gates launch

// ─── Config ──────────────────────────────────────────────────────────────

const VPS_IP = "157.230.187.207";
const FETCH_TIMEOUT = 10_000;

// Derived from prim.yaml status=deployed|live — no hardcoded list
const LIVE_SERVICES = deployed(loadPrimitives()).map(
  (p) => p.endpoint ?? `${p.id}.prim.sh`,
);

// Critical-path task IDs that block public launch
const BLOCKER_IDS = [
  "L-27",   // deploy $PRIM contract (must be before repo goes public)
  "L-15",   // rotate secrets
  "L-22",   // mainnet switchover
  "L-14",   // token launch + go public
  "PRIM-2", // $PRIM utility design (L-14 depends on it)
  "L-47",   // API URL redundancy fix (breaking change — must be pre-public)
  "L-61",   // dynamic allowlist
  "SEC-1",  // infra hardening (fail2ban, SSH key-only)
  "SEC-3",  // edge rate limiting
  "SEC-6",  // SQLite backup
  "OPS-1",  // uptime monitoring
  "OPS-2",  // structured logging (JSON + request_id — blind on mainnet without)
  "OPS-3",  // incident runbook
  "OBS-1",  // service metrics + report.ts (blind on mainnet without this)
  "BIZ-2",  // expense dashboard (prerequisite for BIZ-3)
  "BIZ-3",  // cost transparency doc (public-facing, linked from site)
  "BIZ-4",  // pricing endpoint (agents need machine-readable pricing)
  "E-9",    // mail hostname rename (mail.prim.sh) — email infra correctness
  "I-3",    // coverage gate (thresholds never enforced without reportsDirectory)
];

// ─── Helpers ─────────────────────────────────────────────────────────────

let failures = 0;

function pass(label: string, detail?: string) {
  console.log(`  ✅ ${label}${detail ? ` (${detail})` : ""}`);
}

function fail(label: string, detail?: string) {
  console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
  failures++;
}

function pending(label: string, detail?: string) {
  console.log(`  ⏳ ${label}${detail ? ` — ${detail}` : ""}`);
  failures++;
}

function warn(label: string, detail?: string) {
  console.log(`  ⚠️  ${label}${detail ? ` — ${detail}` : ""}`);
}

function header(emoji: string, title: string) {
  console.log(`\n${emoji} ${title}\n${"─".repeat(52)}\n`);
}

// ─── 1. Tests ────────────────────────────────────────────────────────────

function checkTests() {
  header("🧪", "Tests");
  try {
    const output = execSync("pnpm -r test 2>&1", {
      cwd: process.cwd(),
      timeout: 120_000,
      encoding: "utf-8",
    });

    const fileMatch = output.match(/Test Files\s+(\d+) passed/);
    const testMatch = output.match(/Tests\s+(\d+) passed/);

    const pkgResults = new Map<string, boolean>();
    for (const line of output.split("\n")) {
      const pkgMatch = line.match(/packages\/([^/]+)\//);
      if (pkgMatch) {
        const pkg = pkgMatch[1];
        if (line.includes("×") || line.includes("FAIL")) {
          pkgResults.set(pkg, false);
        } else if (!pkgResults.has(pkg)) {
          pkgResults.set(pkg, true);
        }
      }
    }

    if (pkgResults.size > 0) {
      for (const [pkg, ok] of [...pkgResults].sort()) {
        if (ok) pass(pkg);
        else fail(pkg);
      }
    }

    if (fileMatch && testMatch) {
      pass(`${testMatch[1]} tests in ${fileMatch[1]} files`);
    } else {
      pass("pnpm -r test completed");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (typeof (err as { stdout?: string }).stdout === "string") {
      const stdout = (err as { stdout: string }).stdout;
      const failMatch = stdout.match(/(\d+) failed/);
      const passMatch = stdout.match(/(\d+) passed/);
      if (failMatch) {
        fail(`${failMatch[1]} test(s) failed`, passMatch ? `${passMatch[1]} passed` : undefined);
      } else {
        fail("pnpm -r test", msg.slice(0, 120));
      }
    } else {
      fail("pnpm -r test", msg.slice(0, 120));
    }
  }
}

// ─── 2. Live Endpoints ───────────────────────────────────────────────────

async function checkEndpoints() {
  header("🌐", "Live Endpoints");

  for (const host of LIVE_SERVICES) {
    try {
      const res = await fetch(`https://${host}`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      });
      if (!res.ok) {
        fail(host, `HTTP ${res.status}`);
        continue;
      }
      const data = (await res.json()) as { status?: string };
      if (data.status === "ok") {
        pass(host);
      } else {
        fail(host, `status=${data.status ?? "missing"}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fail(host, msg.slice(0, 80));
    }
  }
}

// ─── 3. DNS ──────────────────────────────────────────────────────────────

async function checkDns() {
  header("📡", "DNS");

  for (const host of LIVE_SERVICES) {
    try {
      const addrs = await resolve4(host);
      if (addrs.includes(VPS_IP)) {
        pass(host, VPS_IP);
      } else {
        fail(host, `resolves to ${addrs.join(", ")} (expected ${VPS_IP})`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fail(host, msg.slice(0, 80));
    }
  }

}

// ─── 4. Blockers ─────────────────────────────────────────────────────────

function checkBlockers() {
  header("🚧", "Blockers (critical path)");

  const content = readFileSync("TASKS.md", "utf-8");
  let blockerCount = 0;

  for (const id of BLOCKER_IDS) {
    const escapedId = id.replace("-", "\\-");
    const pendingPattern = new RegExp(
      `^\\|\\s*${escapedId}\\s*\\|(.+?)\\|[^|]*\\|\\s*(pending|backlog)`,
      "m",
    );
    const match = content.match(pendingPattern);
    if (match) {
      pending(`${id}: ${match[1].trim()}`);
      blockerCount++;
    } else {
      const donePattern = new RegExp(
        `^\\|\\s*${escapedId}\\s*\\|.+?\\|[^|]*\\|\\s*done`,
        "m",
      );
      if (donePattern.test(content)) {
        pass(`${id}: resolved`);
      } else {
        pass(`${id}: resolved (archived)`);
      }
    }
  }

  if (blockerCount === 0) {
    pass("No critical-path blockers");
  }
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🚀 Prim Launch Readiness Dashboard\n");

  checkTests();
  await checkEndpoints();
  await checkDns();
  checkBlockers();

  console.log(`\n${"─".repeat(52)}`);
  if (failures === 0) {
    console.log("  🟢 All checks passed — ready to launch.\n");
    process.exit(0);
  } else {
    console.log(`  🔴 ${failures} check(s) failed — not ready.\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\nFatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
