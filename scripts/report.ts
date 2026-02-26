#!/usr/bin/env bun
/**
 * Prim System Report
 *
 * Pulls metrics from all live services, infrastructure costs, and on-chain
 * revenue into a single human-readable report.
 *
 * Usage:
 *   bun scripts/report.ts          # terminal table
 *   bun scripts/report.ts --json   # raw JSON for MCP / piping
 *
 * Env (loaded from .env at repo root):
 *   DO_API_TOKEN, CF_API_TOKEN, CF_ACCOUNT_ID, BASE_RPC_URL, PRIM_PAY_TO
 */

import { loadPrimitives, deployed } from "./lib/primitives.js";
import {
  fetchServiceMetrics,
  fetchDOCosts,
  fetchR2Costs,
  fetchOnChainRevenue,
  type ServiceMetrics,
  type InfraCost,
  type OnChainRevenue,
} from "./lib/infra.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Report {
  timestamp: string;
  services: ServiceMetrics[];
  infra_costs: InfraCost[];
  on_chain: OnChainRevenue;
  totals: {
    total_requests: number;
    total_errors: number;
    total_revenue_usdc: string;
    total_monthly_cost: number;
  };
}

// ─── Config ─────────────────────────────────────────────────────────────────

const SERVICES = deployed(loadPrimitives()).map(
  (p) => p.endpoint ?? `${p.id}.prim.sh`,
);

// ─── Report builder ─────────────────────────────────────────────────────────

export async function buildReport(): Promise<Report> {
  const [services, doCost, r2Cost, onChain] = await Promise.all([
    Promise.all(SERVICES.map(fetchServiceMetrics)),
    fetchDOCosts(),
    fetchR2Costs(),
    fetchOnChainRevenue(),
  ]);

  // Estimate Tavily cost from search.prim.sh requests
  const searchSvc = services.find((s) => s.service.includes("search"));
  const tavilyRequests = searchSvc?.requests.total ?? 0;
  const tavilyCost = tavilyRequests * 0.01;

  const infraCosts: InfraCost[] = [
    doCost ?? { item: "VPS (DigitalOcean)", monthly: 24, note: "estimate (no API token)" },
    { item: "Domain (prim.sh)", monthly: 4.17, note: "$50/yr" },
    { item: "X handle", monthly: 11 },
    r2Cost ?? { item: "R2 storage", monthly: 0, note: "no API token" },
    { item: "Tavily (estimated)", monthly: Math.round(tavilyCost * 100) / 100, note: `${tavilyRequests} calls x $0.01` },
  ];

  let totalRevenue = 0;
  for (const s of services) {
    totalRevenue += parseFloat(s.payments.total_usdc) || 0;
  }

  return {
    timestamp: new Date().toISOString(),
    services,
    infra_costs: infraCosts,
    on_chain: onChain,
    totals: {
      total_requests: services.reduce((sum, s) => sum + s.requests.total, 0),
      total_errors: services.reduce((sum, s) => sum + s.errors.total, 0),
      total_revenue_usdc: totalRevenue.toFixed(2),
      total_monthly_cost: infraCosts.reduce((sum, c) => sum + c.monthly, 0),
    },
  };
}

// ─── Formatters ─────────────────────────────────────────────────────────────

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

function rpad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : " ".repeat(n - s.length) + s;
}

function formatUptime(seconds: number): string {
  if (seconds <= 0) return "-";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function printReport(report: Report) {
  console.log(`\nPrim System Report — ${report.timestamp}\n`);

  // Service metrics
  console.log("SERVICE METRICS");
  console.log("─".repeat(72));
  console.log(
    `  ${pad("Service", 22)} ${pad("Uptime", 10)} ${rpad("Requests", 10)} ${rpad("Errors", 8)} ${rpad("Revenue", 14)}`,
  );
  console.log("─".repeat(72));
  for (const s of report.services) {
    if (s.status !== "ok") {
      console.log(`  ${pad(s.service, 22)} ${pad(s.status, 10)} ${pad("-", 10)} ${pad("-", 8)} ${pad("-", 14)}`);
    } else {
      console.log(
        `  ${pad(s.service, 22)} ${pad(formatUptime(s.uptime_s), 10)} ${rpad(s.requests.total.toLocaleString(), 10)} ${rpad(String(s.errors.total), 8)} ${rpad("$" + s.payments.total_usdc, 14)}`,
      );
    }
  }
  console.log();

  // Infrastructure costs
  console.log("INFRASTRUCTURE COSTS (monthly)");
  console.log("─".repeat(52));
  for (const c of report.infra_costs) {
    const note = c.note ? `  (${c.note})` : "";
    console.log(`  ${pad(c.item, 24)} $${rpad(c.monthly.toFixed(2), 8)}${note}`);
  }
  console.log("─".repeat(52));
  console.log(`  ${pad("Total", 24)} $${rpad(report.totals.total_monthly_cost.toFixed(2), 8)}`);
  console.log();

  // On-chain revenue
  console.log("ON-CHAIN REVENUE (last 30d)");
  console.log("─".repeat(52));
  if (report.on_chain.error) {
    console.log(`  ${report.on_chain.error}`);
  } else {
    console.log(`  Treasury USDC balance:   $${report.on_chain.treasury_balance_usdc}`);
    console.log(`  Inbound transfers (30d): $${report.on_chain.inbound_30d_usdc}`);
    const inbound = parseFloat(report.on_chain.inbound_30d_usdc ?? "0");
    const margin = inbound - report.totals.total_monthly_cost;
    console.log(`  Net margin:              $${margin.toFixed(2)}${margin < 0 ? " (running at cost)" : ""}`);
  }
  console.log();
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const isJson = process.argv.includes("--json");
  const report = await buildReport();

  if (isJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }
}

main().catch((err) => {
  console.error("Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
