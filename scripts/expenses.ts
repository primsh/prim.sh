#!/usr/bin/env bun
/**
 * Prim Expense Dashboard
 *
 * Per-primitive margin table combining variable costs (provider APIs),
 * fixed cost allocation (VPS, domain, X), and on-chain USDC revenue.
 *
 * Usage:
 *   bun scripts/expenses.ts          # terminal table
 *   bun scripts/expenses.ts --json   # raw JSON for MCP / piping
 *
 * Env (loaded from .env at repo root):
 *   DO_API_TOKEN, CF_API_TOKEN, CF_ACCOUNT_ID, BASE_RPC_URL, PRIM_PAY_TO
 */

import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { parse as parseYaml } from "yaml";
import { loadPrimitives, deployed } from "./lib/primitives.js";
import {
  fetchServiceMetrics,
  fetchDOCosts,
  fetchR2Costs,
  fetchOnChainRevenue,
  fetchSpawnDroplets,
  type ServiceMetrics,
  type InfraCost,
  type OnChainRevenue,
} from "./lib/infra.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PricingRoute {
  endpoint: string;
  x402_price: string;
  provider_cost: string;
  margin_pct: number | string;
  notes?: string;
}

interface PricingPrimitive {
  name: string;
  description: string;
  free_routes: string[];
  paid_routes: PricingRoute[];
  notes?: string;
}

interface PricingYaml {
  primitives: PricingPrimitive[];
}

interface PrimRow {
  id: string;
  name: string;
  revenue_usdc: number;
  variable_cost: number;
  fixed_cost_alloc: number;
  total_cost: number;
  margin_usdc: number;
  margin_pct: number;
}

interface RiskFlag {
  primitive: string;
  route: string;
  message: string;
}

interface ExpenseReport {
  timestamp: string;
  primitives: PrimRow[];
  totals: {
    revenue_usdc: number;
    variable_cost: number;
    fixed_cost: number;
    total_cost: number;
    margin_usdc: number;
  };
  on_chain_cross_check: {
    treasury_balance: string | null;
    inbound_30d: string | null;
    metrics_reported_total: string;
    delta: string;
  };
  risk_flags: RiskFlag[];
}

// ─── Config ─────────────────────────────────────────────────────────────────

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const FIXED_COSTS: InfraCost[] = [
  { item: "VPS (DigitalOcean)", monthly: 24.0 },
  { item: "Domain (prim.sh)", monthly: 4.17 },
  { item: "X handle (@primsh)", monthly: 11.0 },
];
const TOTAL_FIXED = FIXED_COSTS.reduce((s, c) => s + c.monthly, 0);

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseDollar(s: string | undefined): number {
  if (!s) return 0;
  const cleaned = s.replace(/[^0-9.\-]/g, "");
  return parseFloat(cleaned) || 0;
}

function loadPricingYaml(): PricingYaml {
  try {
    const raw = readFileSync(join(ROOT, "specs", "pricing.yaml"), "utf8");
    return parseYaml(raw) as PricingYaml;
  } catch {
    return { primitives: [] };
  }
}

/** Map "wallet.sh" -> "wallet" */
function primId(name: string): string {
  return name.replace(/\.sh$/, "");
}

// ─── Data fetching ──────────────────────────────────────────────────────────

async function fetchAllMetrics(
  hosts: { id: string; host: string }[],
): Promise<Map<string, ServiceMetrics>> {
  const results = await Promise.all(
    hosts.map(async ({ id, host }) => {
      const m = await fetchServiceMetrics(host);
      return { id, metrics: m };
    }),
  );
  const map = new Map<string, ServiceMetrics>();
  for (const r of results) {
    map.set(r.id, r.metrics);
  }
  return map;
}

// ─── Cost computation ───────────────────────────────────────────────────────

function computeVariableCosts(
  metricsMap: Map<string, ServiceMetrics>,
  pricing: PricingYaml,
  spawnDroplets: { count: number; monthly_cost: number },
): Map<string, number> {
  const costs = new Map<string, number>();

  for (const prim of pricing.primitives) {
    const id = primId(prim.name);
    const metrics = metricsMap.get(id);

    // Special case: spawn.sh costs are based on active droplets, not request count
    if (id === "spawn") {
      costs.set(id, spawnDroplets.monthly_cost);
      continue;
    }

    // For everything else: sum(requests_per_route × provider_cost_per_route)
    // If we have by_endpoint breakdown, use it; otherwise estimate from total requests
    let totalVariableCost = 0;

    if (metrics && metrics.requests.by_endpoint) {
      for (const route of prim.paid_routes) {
        const providerCost = parseDollar(route.provider_cost);
        if (providerCost <= 0) continue;

        // Match endpoint pattern to by_endpoint keys
        // by_endpoint keys are like "POST /v1/search", route.endpoint is "POST /v1/search"
        const endpointKey = route.endpoint;
        const endpointData = metrics.requests.by_endpoint?.[endpointKey];
        const count = endpointData?.count ?? 0;
        totalVariableCost += count * providerCost;
      }
    } else if (metrics) {
      // Fallback: estimate using total requests × average provider cost
      const routesWithCost = prim.paid_routes.filter(
        (r) => parseDollar(r.provider_cost) > 0,
      );
      if (routesWithCost.length > 0) {
        const avgCost =
          routesWithCost.reduce((s, r) => s + parseDollar(r.provider_cost), 0) /
          routesWithCost.length;
        // Assume paid-route requests are roughly proportional
        totalVariableCost = metrics.requests.total * avgCost;
      }
    }

    costs.set(id, Math.round(totalVariableCost * 1_000_000) / 1_000_000);
  }

  return costs;
}

function computeFixedAllocation(
  metricsMap: Map<string, ServiceMetrics>,
  primIds: string[],
): Map<string, number> {
  const alloc = new Map<string, number>();

  // Total requests across all primitives (excluding faucet)
  let totalRequests = 0;
  for (const id of primIds) {
    if (id === "faucet") continue;
    const m = metricsMap.get(id);
    totalRequests += m?.requests.total ?? 0;
  }

  for (const id of primIds) {
    if (id === "faucet") {
      alloc.set(id, 0);
      continue;
    }
    const m = metricsMap.get(id);
    const requests = m?.requests.total ?? 0;
    if (totalRequests > 0) {
      alloc.set(id, (requests / totalRequests) * TOTAL_FIXED);
    } else {
      // Even split if no traffic yet (excluding faucet)
      const activePrims = primIds.filter((p) => p !== "faucet").length;
      alloc.set(id, activePrims > 0 ? TOTAL_FIXED / activePrims : 0);
    }
  }

  return alloc;
}

function buildMarginTable(
  primIds: string[],
  metricsMap: Map<string, ServiceMetrics>,
  variableCosts: Map<string, number>,
  fixedAlloc: Map<string, number>,
): PrimRow[] {
  return primIds.map((id) => {
    const m = metricsMap.get(id);
    const revenue = parseFloat(m?.payments.total_usdc ?? "0") || 0;
    const variable = variableCosts.get(id) ?? 0;
    const fixed = fixedAlloc.get(id) ?? 0;
    const totalCost = variable + fixed;
    const margin = revenue - totalCost;
    const marginPct = revenue > 0 ? ((margin / revenue) * 100) : (totalCost > 0 ? -Infinity : 0);

    return {
      id,
      name: `${id}.sh`,
      revenue_usdc: Math.round(revenue * 100) / 100,
      variable_cost: Math.round(variable * 100) / 100,
      fixed_cost_alloc: Math.round(fixed * 100) / 100,
      total_cost: Math.round(totalCost * 100) / 100,
      margin_usdc: Math.round(margin * 100) / 100,
      margin_pct: isFinite(marginPct) ? Math.round(marginPct * 100) / 100 : -99999,
    };
  });
}

function detectRiskFlags(pricing: PricingYaml, spawnDroplets: { count: number; monthly_cost: number }): RiskFlag[] {
  const flags: RiskFlag[] = [];

  for (const prim of pricing.primitives) {
    for (const route of prim.paid_routes) {
      const price = parseDollar(route.x402_price);
      const cost = parseDollar(route.provider_cost);
      if (price <= 0 || route.x402_price === "dynamic") continue;

      const margin = ((price - cost) / price) * 100;
      if (margin <= 0) {
        flags.push({
          primitive: prim.name,
          route: route.endpoint,
          message: `${margin.toFixed(0)}% margin ($${price.toFixed(3)} charge vs $${cost.toFixed(3)} cost)`,
        });
      } else if (margin < 10) {
        flags.push({
          primitive: prim.name,
          route: route.endpoint,
          message: `${margin.toFixed(0)}% margin — thin`,
        });
      }
    }
  }

  // Flag active spawn droplets
  if (spawnDroplets.count > 0) {
    flags.push({
      primitive: "spawn.sh",
      route: "(active droplets)",
      message: `${spawnDroplets.count} active droplet(s), $${spawnDroplets.monthly_cost.toFixed(2)}/mo ongoing cost`,
    });
  }

  return flags;
}

// ─── Formatters ─────────────────────────────────────────────────────────────

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

function rpad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : " ".repeat(n - s.length) + s;
}

function fmtUsd(n: number): string {
  if (n < 0) return `-$${Math.abs(n).toFixed(2)}`;
  return `$${n.toFixed(2)}`;
}

function printExpenseTable(report: ExpenseReport) {
  console.log(`\nPrim Expense Dashboard — ${report.timestamp}\n`);

  // Per-primitive margin table
  console.log("PER-PRIMITIVE MARGIN (30d)");
  console.log("─".repeat(78));
  console.log(
    `  ${pad("Primitive", 16)} ${rpad("Revenue", 10)} ${rpad("Variable", 10)} ${rpad("Fixed Alloc", 12)} ${rpad("Total Cost", 12)} ${rpad("Margin", 12)}`,
  );
  console.log("─".repeat(78));

  for (const row of report.primitives) {
    console.log(
      `  ${pad(row.name, 16)} ${rpad(fmtUsd(row.revenue_usdc), 10)} ${rpad(fmtUsd(row.variable_cost), 10)} ${rpad(fmtUsd(row.fixed_cost_alloc), 12)} ${rpad(fmtUsd(row.total_cost), 12)} ${rpad(fmtUsd(row.margin_usdc), 12)}`,
    );
  }

  console.log("─".repeat(78));
  const t = report.totals;
  console.log(
    `  ${pad("TOTAL", 16)} ${rpad(fmtUsd(t.revenue_usdc), 10)} ${rpad(fmtUsd(t.variable_cost), 10)} ${rpad(fmtUsd(t.fixed_cost), 12)} ${rpad(fmtUsd(t.total_cost), 12)} ${rpad(fmtUsd(t.margin_usdc), 12)}`,
  );
  console.log();

  // On-chain cross-check
  console.log("ON-CHAIN CROSS-CHECK");
  const cc = report.on_chain_cross_check;
  console.log(`  Treasury balance:        ${cc.treasury_balance ?? "n/a"}`);
  console.log(`  Inbound (30d):           ${cc.inbound_30d ?? "n/a"}`);
  console.log(`  Metrics-reported total:  $${cc.metrics_reported_total}`);
  console.log(`  \u0394:                       $${cc.delta}`);
  console.log();

  // Risk flags
  if (report.risk_flags.length > 0) {
    console.log("RISK FLAGS");
    for (const f of report.risk_flags) {
      console.log(`  \u26A0 ${f.primitive} ${f.route}: ${f.message}`);
    }
    console.log();
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const isJson = process.argv.includes("--json");

  // Load primitives + pricing
  const allPrims = loadPrimitives();
  const deployedPrims = deployed(allPrims);
  const pricing = loadPricingYaml();

  // Build host list for metrics fetching
  const hosts = deployedPrims.map((p) => ({
    id: p.id,
    host: p.endpoint ?? `${p.id}.prim.sh`,
  }));

  // Parallel fetch all data sources
  const [metricsMap, doCost, _r2Cost, onChain, spawnDroplets] = await Promise.all([
    fetchAllMetrics(hosts),
    fetchDOCosts(),
    fetchR2Costs(),
    fetchOnChainRevenue(),
    fetchSpawnDroplets(),
  ]);

  // Update fixed costs with live DO data if available
  if (doCost) {
    FIXED_COSTS[0] = doCost;
  }

  const primIds = deployedPrims.map((p) => p.id);

  // Compute costs
  const variableCosts = computeVariableCosts(metricsMap, pricing, spawnDroplets);
  const fixedAlloc = computeFixedAllocation(metricsMap, primIds);
  const rows = buildMarginTable(primIds, metricsMap, variableCosts, fixedAlloc);
  const riskFlags = detectRiskFlags(pricing, spawnDroplets);

  // Totals
  const totalRevenue = rows.reduce((s, r) => s + r.revenue_usdc, 0);
  const totalVariable = rows.reduce((s, r) => s + r.variable_cost, 0);
  const totalFixed = rows.reduce((s, r) => s + r.fixed_cost_alloc, 0);
  const totalCost = totalVariable + totalFixed;

  // Cross-check
  const metricsTotal = totalRevenue.toFixed(2);
  const inbound = parseFloat(onChain.inbound_30d_usdc ?? "0");
  const delta = Math.abs(totalRevenue - inbound).toFixed(2);

  const report: ExpenseReport = {
    timestamp: new Date().toISOString(),
    primitives: rows,
    totals: {
      revenue_usdc: Math.round(totalRevenue * 100) / 100,
      variable_cost: Math.round(totalVariable * 100) / 100,
      fixed_cost: Math.round(totalFixed * 100) / 100,
      total_cost: Math.round(totalCost * 100) / 100,
      margin_usdc: Math.round((totalRevenue - totalCost) * 100) / 100,
    },
    on_chain_cross_check: {
      treasury_balance: onChain.treasury_balance_usdc
        ? `$${onChain.treasury_balance_usdc}`
        : null,
      inbound_30d: onChain.inbound_30d_usdc
        ? `$${onChain.inbound_30d_usdc}`
        : null,
      metrics_reported_total: metricsTotal,
      delta,
    },
    risk_flags: riskFlags,
  };

  if (isJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printExpenseTable(report);
  }
}

main().catch((err) => {
  console.error("Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
