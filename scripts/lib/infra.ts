/**
 * scripts/lib/infra.ts — Shared infrastructure data fetchers
 *
 * Extracted from report.ts so both report.ts and expenses.ts can share
 * the same fetcher logic for DO costs, R2 costs, on-chain revenue, and
 * service metrics.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ServiceMetrics {
  service: string;
  uptime_s: number;
  requests: { total: number; by_endpoint?: Record<string, { count: number }> };
  payments: {
    total: number;
    total_usdc: string;
    by_endpoint?: Record<string, { count: number; total_usdc: string }>;
  };
  errors: { total: number };
  status: "ok" | "unreachable" | "error";
  error?: string;
}

export interface InfraCost {
  item: string;
  monthly: number;
  note?: string;
}

export interface OnChainRevenue {
  treasury_balance_usdc: string | null;
  inbound_30d_usdc: string | null;
  error?: string;
}

// ─── Config ─────────────────────────────────────────────────────────────────

const FETCH_TIMEOUT = 10_000;
const USDC_CONTRACT = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_DECIMALS = 6;
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// ─── Data fetchers ──────────────────────────────────────────────────────────

export async function fetchServiceMetrics(host: string): Promise<ServiceMetrics> {
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
    const data = (await res.json()) as Record<string, unknown>;
    const requests = data.requests as Record<string, unknown> | undefined;
    const payments = data.payments as Record<string, unknown> | undefined;
    return {
      service: host,
      uptime_s: (data.uptime_s as number) ?? 0,
      requests: {
        total: (requests?.total as number) ?? 0,
        by_endpoint: (requests?.by_endpoint as Record<string, { count: number }>) ?? undefined,
      },
      payments: {
        total: (payments?.total as number) ?? 0,
        total_usdc: (payments?.total_usdc as string) ?? "0",
        by_endpoint:
          (payments?.by_endpoint as Record<string, { count: number; total_usdc: string }>) ??
          undefined,
      },
      errors: {
        total: ((data.errors as Record<string, unknown>)?.total as number) ?? 0,
      },
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

export async function fetchDOCosts(): Promise<InfraCost | null> {
  const token = process.env.DO_API_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch("https://api.digitalocean.com/v2/customers/my/balance", {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!res.ok)
      return {
        item: "VPS (DigitalOcean)",
        monthly: 24,
        note: `API ${res.status}; using estimate`,
      };
    const data = (await res.json()) as { month_to_date_usage?: string };
    const usage = Number.parseFloat(data.month_to_date_usage ?? "0");
    return {
      item: "VPS (DigitalOcean)",
      monthly: usage || 24,
      note: usage ? "MTD from API" : "estimate",
    };
  } catch {
    return {
      item: "VPS (DigitalOcean)",
      monthly: 24,
      note: "API unreachable; using estimate",
    };
  }
}

export async function fetchR2Costs(): Promise<InfraCost | null> {
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
    const data = (await res.json()) as Record<string, unknown>;
    const accounts = (
      data as {
        data?: { viewer?: { accounts?: unknown[] } };
      }
    ).data?.viewer?.accounts;
    if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
      return { item: "R2 storage", monthly: 0, note: "no data" };
    }
    const storageGroups = (accounts[0] as Record<string, unknown>).r2StorageAdaptiveGroups as
      | { max?: { payloadSize?: number } }[]
      | undefined;
    const opsGroups = (accounts[0] as Record<string, unknown>).r2OperationsAdaptiveGroups as
      | { sum?: { requests?: number } }[]
      | undefined;
    const storageBytes = storageGroups?.[0]?.max?.payloadSize ?? 0;
    const ops = opsGroups?.[0]?.sum?.requests ?? 0;
    const storageCost = (storageBytes / 1024 ** 3) * 0.015;
    const opsCost = (ops / 1_000_000) * 0.36;
    const total = storageCost + opsCost;
    return {
      item: "R2 storage",
      monthly: Math.round(total * 100) / 100,
      note: `${ops} ops, ${(storageBytes / 1024 ** 2).toFixed(1)} MB`,
    };
  } catch {
    return { item: "R2 storage", monthly: 0, note: "unavailable" };
  }
}

export async function fetchOnChainRevenue(): Promise<OnChainRevenue> {
  const payTo = process.env.PRIM_PAY_TO;
  if (!payTo)
    return {
      treasury_balance_usdc: null,
      inbound_30d_usdc: null,
      error: "PRIM_PAY_TO not set",
    };

  const rpcUrl = process.env.BASE_RPC_URL || "https://mainnet.base.org";
  const paddedAddr = `0x${payTo.slice(2).toLowerCase().padStart(64, "0")}`;

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
            data: `0x70a08231${payTo.slice(2).toLowerCase().padStart(64, "0")}`,
          },
          "latest",
        ],
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    const balanceData = (await balanceRes.json()) as { result?: string };
    const balanceRaw = BigInt(balanceData.result ?? "0x0");
    const balance = Number(balanceRaw) / 10 ** USDC_DECIMALS;

    // Get latest block number
    const blockRes = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "eth_blockNumber",
        params: [],
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    const blockData = (await blockRes.json()) as { result?: string };
    const latestBlock = Number.parseInt(blockData.result ?? "0x0", 16);
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
            fromBlock: `0x${fromBlock.toString(16)}`,
            toBlock: "latest",
          },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const logsData = (await logsRes.json()) as {
      result?: { data: string }[];
    };
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

/** Fetch active prim-spawn droplets from DigitalOcean API */
export async function fetchSpawnDroplets(): Promise<{
  count: number;
  monthly_cost: number;
  error?: string;
}> {
  const token = process.env.DO_API_TOKEN;
  if (!token) return { count: 0, monthly_cost: 0, error: "DO_API_TOKEN not set" };
  try {
    const res = await fetch(
      "https://api.digitalocean.com/v2/droplets?tag_name=prim-spawn&per_page=200",
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      },
    );
    if (!res.ok) return { count: 0, monthly_cost: 0, error: `API ${res.status}` };
    const data = (await res.json()) as {
      droplets?: { size?: { price_monthly?: number } }[];
    };
    const droplets = data.droplets ?? [];
    const monthly = droplets.reduce((sum, d) => sum + (d.size?.price_monthly ?? 0), 0);
    return { count: droplets.length, monthly_cost: monthly };
  } catch (err) {
    return {
      count: 0,
      monthly_cost: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
