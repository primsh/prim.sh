#!/usr/bin/env bun
/**
 * Release Readiness Dashboard
 *
 * Shows hard pre-release requirements:
 *   1. Tests     — all tests must pass
 *   2. Endpoints — all live services must respond
 *   3. DNS       — all live services must resolve to VPS
 *   4. Blockers  — tasks tagged with the target release in TASKS.md
 *
 * Usage:
 *   bun scripts/launch-status.ts              # defaults to v1.0.0
 *   bun scripts/launch-status.ts v2.0.0       # check a specific release
 *
 * Exit 0 = all checks pass + no blockers
 * Exit 1 = failures detected
 */

import { execSync } from "node:child_process";
import { resolve4 } from "node:dns/promises";
import { loadPrimitives, deployed } from "./lib/primitives.js";
import { loadTasks, flatTasks, filterByRelease } from "./lib/tasks.js";

// ─── Config ──────────────────────────────────────────────────────────────

const TARGET_RELEASE = process.argv[2] ?? "v1.0.0";
const VPS_IP = process.env.VPS_IP;
if (!VPS_IP) {
  console.error("Error: VPS_IP not set. Add it to .env or pass as env var.");
  process.exit(1);
}
const FETCH_TIMEOUT = 10_000;

// Derived from prim.yaml status=deployed|live — no hardcoded list
const LIVE_SERVICES = deployed(loadPrimitives()).map(
  (p) => p.endpoint ?? `${p.id}.prim.sh`,
);

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

// ─── 4. Release Blockers ─────────────────────────────────────────────────

function checkBlockers() {
  header("🚧", `Blockers (${TARGET_RELEASE})`);

  const data = loadTasks();
  const releaseTasks = filterByRelease(flatTasks(data), TARGET_RELEASE);
  let blockerCount = 0;

  for (const task of releaseTasks) {
    if (task.status === "done") {
      pass(`${task.id}: resolved`);
    } else {
      pending(`${task.id}: ${task.description}`.slice(0, 160));
      blockerCount++;
    }
  }

  if (blockerCount === 0) {
    pass(`No blockers for ${TARGET_RELEASE}`);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🚀 Prim Release Readiness — ${TARGET_RELEASE}\n`);

  checkTests();
  await checkEndpoints();
  await checkDns();
  checkBlockers();

  console.log(`\n${"─".repeat(52)}`);
  if (failures === 0) {
    console.log("  🟢 All checks passed — ready to ship.\n");
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
