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

// ─── Types ──────────────────────────────────────────────────────────────────

interface ServiceMetrics {
  service: string;
  uptime_s: number;
  requests: { total: number };
  payments: { total: number; total_usdc: string };
  errors: { total: number };
  status: "ok" | "unreachable" | "error";
  error?: string;
}

interface InfraCost {
  item: string;
  monthly: number;
  note?: string;
}

interface OnChainRevenue {
  treasury_balance_usdc: string | null;
  inbound_30d_usdc: string | null;
  error?: string;
}

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
const FETCH_TIMEOUT = 10_000;
const USDC_CONTRACT = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_DECIMALS = 6;
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// ─── Data fetchers ──────────────────────────────────────────────────────────

async function fetchServiceMetrics(host: string): Promise<ServiceMetrics> {
  try {
    const res = await fetch(`https://${host}/v1/metrics`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!res.ok) {
      return {
        service: host,
        uptime_s: 0,
        requests: { total: 0 },
        payments: { total: 0, total_usdc: "0" },
        errors: { total: 0 },
        status: "error",
        error: `HTTP ${res.status}`,
      };
    }
    const data = await res.json() as Record<string, unknown>;
    return {
      service: host,
      uptime_s: (data.uptime_s as number) ?? 0,
      requests: { total: ((data.requests as Record<string, unknown>)?.total as number) ?? 0 },
      payments: {
        total: ((data.payments as Record<string, unknown>)?.total as number) ?? 0,
        total_usdc: ((data.payments as Record<string, unknown>)?.total_usdc as string) ?? "0",
      },
      errors: { total: ((data.errors as Record<string, unknown>)?.total as number) ?? 0 },
      status: "ok",
    };
  } catch (err) {
    return {
      service: host,
      uptime_s: 0,
      requests: { total: 0 },
      payments: { total: 0, total_usdc: "0" },
      errors: { total: 0 },
      status: "unreachable",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function fetchDOCosts(): Promise<InfraCost | null> {
  const token = process.env.DO_API_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch("https://api.digitalocean.com/v2/customers/my/balance", {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!res.ok) return { item: "VPS (DigitalOcean)", monthly: 24, note: `API ${res.status}; using estimate` };
    const data = await res.json() as { month_to_date_usage?: string };
    const usage = parseFloat(data.month_to_date_usage ?? "0");
    return { item: "VPS (DigitalOcean)", monthly: usage || 24, note: usage ? "MTD from API" : "estimate" };
  } catch {
    return { item: "VPS (DigitalOcean)", monthly: 24, note: "API unreachable; using estimate" };
  }
}

async function fetchR2Costs(): Promise<InfraCost | null> {
  const token = process.env.CF_API_TOKEN;
  const accountId = process.env.CF_ACCOUNT_ID;
  if (!token || !accountId) return null;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const today = now.toISOString().split("T")[0];

  const query = `query {
    viewer {
      accounts(filter: { accountTag: "${accountId}" }) {
        r2OperationsAdaptiveGroups(
          filter: { date_geq: "${startOfMonth}", date_leq: "${today}" }
          limit: 1
        ) {
          sum { requests }
        }
        r2StorageAdaptiveGroups(
          filter: { date_geq: "${startOfMonth}", date_leq: "${today}" }
          limit: 1
        ) {
          max { payloadSize }
        }
      }
    }
  }`;

  try {
    const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!res.ok) return { item: "R2 storage", monthly: 0, note: "unavailable" };
    const data = await res.json() as Record<string, unknown>;
    // R2 pricing: $0.015/GB storage, $0.36/M class A ops, $0.036/M class B ops
    // Rough estimate from payload size
    const accounts = (data as { data?: { viewer?: { accounts?: unknown[] } } }).data?.viewer?.accounts;
    if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
      return { item: "R2 storage", monthly: 0, note: "no data" };
    }
    const storageGroups = (accounts[0] as Record<string, unknown>).r2StorageAdaptiveGroups as { max?: { payloadSize?: number } }[] | undefined;
    const opsGroups = (accounts[0] as Record<string, unknown>).r2OperationsAdaptiveGroups as { sum?: { requests?: number } }[] | undefined;
    const storageBytes = storageGroups?.[0]?.max?.payloadSize ?? 0;
    const ops = opsGroups?.[0]?.sum?.requests ?? 0;
    const storageCost = (storageBytes / (1024 ** 3)) * 0.015;
    const opsCost = (ops / 1_000_000) * 0.36;
    const total = storageCost + opsCost;
    return { item: "R2 storage", monthly: Math.round(total * 100) / 100, note: `${ops} ops, ${(storageBytes / (1024 ** 2)).toFixed(1)} MB` };
  } catch {
    return { item: "R2 storage", monthly: 0, note: "unavailable" };
  }
}

async function fetchOnChainRevenue(): Promise<OnChainRevenue> {
  const payTo = process.env.PRIM_PAY_TO;
  if (!payTo) return { treasury_balance_usdc: null, inbound_30d_usdc: null, error: "PRIM_PAY_TO not set" };

  const rpcUrl = process.env.BASE_RPC_URL || "https://mainnet.base.org";
  const paddedAddr = "0x" + payTo.slice(2).toLowerCase().padStart(64, "0");

  try {
    // Get current USDC balance (balanceOf call)
    const balanceRes = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [
          {
            to: USDC_CONTRACT,
            data: "0x70a08231" + payTo.slice(2).toLowerCase().padStart(64, "0"),
          },
          "latest",
        ],
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    const balanceData = await balanceRes.json() as { result?: string };
    const balanceRaw = BigInt(balanceData.result ?? "0x0");
    const balance = Number(balanceRaw) / 10 ** USDC_DECIMALS;

    // Get latest block number
    const blockRes = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "eth_blockNumber", params: [] }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    const blockData = await blockRes.json() as { result?: string };
    const latestBlock = parseInt(blockData.result ?? "0x0", 16);
    // Base: ~2s blocks, 30 days ~= 1_296_000 blocks
    const fromBlock = Math.max(0, latestBlock - 1_296_000);

    // Get Transfer events to PRIM_PAY_TO in last 30 days
    const logsRes = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "eth_getLogs",
        params: [
          {
            address: USDC_CONTRACT,
            topics: [TRANSFER_TOPIC, null, paddedAddr],
            fromBlock: "0x" + fromBlock.toString(16),
            toBlock: "latest",
          },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const logsData = await logsRes.json() as { result?: { data: string }[] };
    const logs = logsData.result ?? [];
    let totalInbound = 0n;
    for (const log of logs) {
      totalInbound += BigInt(log.data);
    }
    const inbound = Number(totalInbound) / 10 ** USDC_DECIMALS;

    return {
      treasury_balance_usdc: balance.toFixed(2),
      inbound_30d_usdc: inbound.toFixed(2),
    };
  } catch (err) {
    return {
      treasury_balance_usdc: null,
      inbound_30d_usdc: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

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
