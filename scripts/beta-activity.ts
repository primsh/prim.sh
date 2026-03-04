#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * beta-activity.ts — Beta tester activity report.
 *
 * Copies access log DBs from VPS, cross-references with gate.db
 * invite codes, and prints a per-tester activity summary.
 *
 * Usage: bun scripts/beta-activity.ts [--since YYYY-MM-DD]
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { Database } from "bun:sqlite";

const VPS_HOST = "root@157.230.187.207";
const REMOTE_DATA_DIR = "/var/lib/prim";
const SERVICES = ["wallet", "store", "search", "feedback", "faucet", "gate", "infer"];

interface InviteRow {
  code: string;
  wallet: string | null;
  redeemed_at: string | null;
  label: string | null;
}

interface AccessRow {
  method: string;
  path: string;
  status: number;
  wallet: string | null;
  created_at: number;
}

interface TesterInfo {
  name: string;
  email: string;
  wallet: string;
}

interface ServiceActivity {
  service: string;
  total: number;
  routes: Map<string, number>;
}

// ─── Parse args ──────────────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    since: { type: "string" },
  },
  strict: false,
});

const sinceMs = values.since ? new Date(values.since as string).getTime() : 0;

// ─── Copy DBs from VPS ──────────────────────────────────────────────────────

const localDir = join("/tmp", "prim-beta-activity");
mkdirSync(localDir, { recursive: true });

console.log("Fetching databases from VPS...");

// Copy gate.db
const gateFiles = ["gate.db"];
// Copy access DBs
const accessFiles = SERVICES.map((s) => `${s}-access.db`);
const allFiles = [...gateFiles, ...accessFiles];

for (const file of allFiles) {
  try {
    execSync(`scp -q ${VPS_HOST}:${REMOTE_DATA_DIR}/${file} ${localDir}/`, {
      timeout: 30_000,
    });
  } catch {
    // File may not exist yet if service hasn't received traffic
  }
}

// ─── Read gate.db for invite code → wallet mapping ──────────────────────────

const gateDbPath = join(localDir, "gate.db");
if (!existsSync(gateDbPath)) {
  console.error("gate.db not found on VPS. No invite data available.");
  process.exit(1);
}

const gateDb = new Database(gateDbPath, { readonly: true });
const redeemed = gateDb
  .prepare(
    "SELECT code, wallet, redeemed_at, label FROM invite_codes WHERE redeemed_at IS NOT NULL",
  )
  .all() as unknown as InviteRow[];
gateDb.close();

// ─── Load tester info from beta-invite.local.yaml (if exists) ───────────────

const testerMap = new Map<string, TesterInfo>();
const inviteYamlPath = join(import.meta.dir, "..", "beta-invite.local.yaml");
if (existsSync(inviteYamlPath)) {
  // Simple YAML parser for flat key-value pairs grouped by wallet
  const content = readFileSync(inviteYamlPath, "utf-8");
  let currentWallet = "";
  for (const line of content.split("\n")) {
    const walletMatch = line.match(/^(\w+):/);
    if (walletMatch && !line.startsWith(" ")) {
      // Could be a wallet address line or a name label
    }
    const indented = line.match(/^\s+(\w+):\s*(.+)/);
    if (indented) {
      const [, key, val] = indented;
      if (key === "wallet") currentWallet = val.trim();
      if (key === "name" && currentWallet) {
        const info = testerMap.get(currentWallet) ?? {
          name: "",
          email: "",
          wallet: currentWallet,
        };
        info.name = val.trim();
        testerMap.set(currentWallet, info);
      }
      if (key === "email" && currentWallet) {
        const info = testerMap.get(currentWallet) ?? {
          name: "",
          email: "",
          wallet: currentWallet,
        };
        info.email = val.trim();
        testerMap.set(currentWallet, info);
      }
    }
  }
}

// ─── Query access logs per tester ───────────────────────────────────────────

const today = new Date().toISOString().slice(0, 10);
const separator = "═".repeat(50);
const divider = "─".repeat(50);

console.log(`\nBeta Tester Activity — ${today}`);
console.log(separator);

const goldenPathServices = ["wallet", "store", "search", "feedback"];
let goldenPathComplete = 0;

for (const invite of redeemed) {
  if (!invite.wallet) continue;

  const wallet = invite.wallet;
  const info = testerMap.get(wallet.toLowerCase()) ?? testerMap.get(wallet);
  const displayName = info?.name ?? `Wallet ${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
  const email = info?.email ?? "";

  console.log(`\n${displayName}${email ? ` (${email})` : ""}`);
  console.log(`  Wallet:   ${wallet}`);
  console.log(`  Code:     ${invite.code} (redeemed ${invite.redeemed_at})`);
  console.log();

  const servicesUsed = new Set<string>();

  for (const svc of SERVICES) {
    const dbPath = join(localDir, `${svc}-access.db`);
    if (!existsSync(dbPath)) continue;

    const db = new Database(dbPath, { readonly: true });
    let rows: AccessRow[];
    try {
      const whereClause = sinceMs > 0 ? "AND created_at >= ?" : "";
      const params: unknown[] = [wallet];
      if (sinceMs > 0) params.push(sinceMs);

      rows = db
        .prepare(
          `SELECT method, path, status, wallet, created_at FROM access_log WHERE wallet = ? ${whereClause} ORDER BY created_at`,
        )
        .all(...params) as unknown as AccessRow[];
    } catch {
      // Table doesn't exist yet
      rows = [];
    } finally {
      db.close();
    }

    if (rows.length === 0) continue;
    servicesUsed.add(svc);

    const routeCounts = new Map<string, number>();
    for (const row of rows) {
      const key = `${row.method} ${row.path}`;
      routeCounts.set(key, (routeCounts.get(key) ?? 0) + 1);
    }

    const routeSummary = [...routeCounts.entries()]
      .map(([route, count]) => `${route} ×${count}`)
      .join(", ");

    console.log(
      `  ${svc}.sh${" ".repeat(Math.max(1, 12 - svc.length))}${rows.length} call${rows.length === 1 ? " " : "s"}   ${routeSummary}`,
    );
  }

  // Golden path check
  const hasAll = goldenPathServices.every((s) => servicesUsed.has(s));
  if (hasAll) {
    goldenPathComplete++;
    console.log(`\n  Golden path: complete (wallet -> store -> search -> feedback)`);
  } else {
    const missing = goldenPathServices.filter((s) => !servicesUsed.has(s));
    console.log(`\n  Golden path: incomplete (missing: ${missing.join(", ")})`);
  }

  console.log(divider);
}

if (redeemed.length === 0) {
  console.log("\nNo invite codes have been redeemed yet.");
} else {
  console.log(
    `\nSummary: ${goldenPathComplete}/${redeemed.length} testers completed golden path`,
  );
}

// ─── Cleanup ────────────────────────────────────────────────────────────────

rmSync(localDir, { recursive: true, force: true });
