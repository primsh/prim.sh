#!/usr/bin/env bun
/**
 * Launch Readiness Dashboard
 *
 * Checks 5 dimensions of launch readiness:
 *   1. Tests     — `pnpm -r test` per-package results
 *   2. Tasks     — TASKS.md lane counts (done/pending)
 *   3. Endpoints — live health checks for deployed services
 *   4. DNS       — *.prim.sh A record resolution
 *   5. Blockers  — critical-path pending tasks
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

// ─── Config ──────────────────────────────────────────────────────────────

const VPS_IP = "157.230.187.207";
const FETCH_TIMEOUT = 10_000;

const LIVE_SERVICES = [
  "wallet.prim.sh",
  "store.prim.sh",
  "faucet.prim.sh",
  "spawn.prim.sh",
  "search.prim.sh",
  "email.prim.sh",
] as const;

// Must resolve — services are live
const DNS_LIVE = [
  "wallet.prim.sh",
  "store.prim.sh",
  "faucet.prim.sh",
  "spawn.prim.sh",
  "search.prim.sh",
  "email.prim.sh",
] as const;

// Warn only — not yet deployed
const DNS_PLANNED = [
  "token.prim.sh",
  "mem.prim.sh",
  "domain.prim.sh",
] as const;

// Critical-path task IDs that block public launch
const BLOCKER_IDS = [
  "L-15",  // rotate secrets
  "L-22",  // mainnet switchover
  "L-27",  // register $PRIM ticker
  "L-14",  // token launch + go public
  "L-61",  // dynamic allowlist
  "SEC-1", // infra hardening (fail2ban, SSH key-only)
  "SEC-3", // edge rate limiting
  "SEC-6", // SQLite backup
  "OPS-1", // uptime monitoring
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

// ─── 2. Tasks ────────────────────────────────────────────────────────────

interface LaneCounts {
  done: number;
  pending: number;
  total: number;
}

function parseTasks(): { lane1: LaneCounts; lane2: LaneCounts } {
  header("📋", "Tasks");

  const content = readFileSync("TASKS.md", "utf-8");
  const lines = content.split("\n");

  let currentLane: "lane1" | "lane2" | null = null;
  const counts = {
    lane1: { done: 0, pending: 0, total: 0 },
    lane2: { done: 0, pending: 0, total: 0 },
  };

  for (const line of lines) {
    if (line.startsWith("## Lane 1")) currentLane = "lane1";
    else if (line.startsWith("## Lane 2")) currentLane = "lane2";
    else if (line.startsWith("## ") && currentLane) currentLane = null;

    if (!currentLane) continue;

    const rowMatch = line.match(/^\|(?![-\s]*\|)\s*.+\|\s*(done|pending|backlog|deferred)\b/i);
    if (rowMatch) {
      const status = rowMatch[1].toLowerCase();
      const c = counts[currentLane];
      c.total++;
      if (status === "done") c.done++;
      else c.pending++;
    }
  }

  const { lane1, lane2 } = counts;

  if (lane1.total > 0) {
    const detail = `${lane1.done} done / ${lane1.pending} pending of ${lane1.total}`;
    if (lane1.pending > 0) fail(`Lane 1 (Launch): ${detail}`);
    else pass(`Lane 1 (Launch): ${detail}`);
  } else {
    warn("Lane 1 (Launch): no tasks found", "check TASKS.md format");
  }

  if (lane2.total > 0) {
    warn(`Lane 2 (Post-Launch): ${lane2.done} done / ${lane2.pending} pending of ${lane2.total}`);
  } else {
    warn("Lane 2 (Post-Launch): no tasks found", "check TASKS.md format");
  }

  return counts;
}

// ─── 3. Live Endpoints ───────────────────────────────────────────────────

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

// ─── 4. DNS ──────────────────────────────────────────────────────────────

async function checkDns() {
  header("📡", "DNS");

  for (const host of DNS_LIVE) {
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

  for (const host of DNS_PLANNED) {
    try {
      const addrs = await resolve4(host);
      if (addrs.includes(VPS_IP)) {
        pass(host, `${VPS_IP} (not yet deployed)`);
      } else {
        warn(host, `resolves to ${addrs.join(", ")} (expected ${VPS_IP})`);
      }
    } catch {
      warn(host, "not yet deployed");
    }
  }
}

// ─── 5. Blockers ─────────────────────────────────────────────────────────

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
      fail(`${id}: ${match[1].trim()}`);
      blockerCount++;
    } else {
      const donePattern = new RegExp(
        `^\\|\\s*${escapedId}\\s*\\|.+?\\|[^|]*\\|\\s*done`,
        "m",
      );
      if (donePattern.test(content)) {
        pass(`${id}: resolved`);
      } else {
        warn(`${id}: not found in TASKS.md`);
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
  parseTasks();
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
