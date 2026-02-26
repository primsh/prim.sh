# OBS-1: Service Observability — /v1/metrics + report.ts + MCP tool

**Date:** 2026-02-26
**Status:** pending
**Owner:** Claude
**Depends on:** nothing

## Context

Current visibility: journald logs + OPS-1 healthcheck (is it up?). Zero insight into request volume, error rates, latency, or payment events.

Goal: queryable observability via REST, CLI, and MCP. No GUI, no DB, no external deps.

## What to build

### 1. `GET /v1/metrics` on each service

In-memory counters reset on restart (acceptable — Bun services restart rarely, and persistent metrics need a DB we don't want). Returns JSON:

```json
{
  "service": "store.prim.sh",
  "uptime_s": 86400,
  "requests": {
    "total": 1234,
    "by_endpoint": {
      "POST /v1/buckets": { "count": 45, "errors": 2, "p50_ms": 120, "p99_ms": 890 },
      "GET /v1/buckets": { "count": 1189, "errors": 0, "p50_ms": 8, "p99_ms": 45 }
    }
  },
  "payments": {
    "total": 43,
    "total_usdc": "2.15",
    "by_endpoint": { "POST /v1/buckets": 43 }
  },
  "errors": { "total": 2, "by_status": { "500": 2 } }
}
```

Implementation: Hono middleware added to each service that increments in-memory maps. Latency tracked via `Date.now()` before/after handler. `/v1/metrics` is a free route (no x402).

The middleware is shared — add to `packages/x402-middleware/src/metrics.ts`, export `metricsMiddleware()` and `metricsHandler()`.

### 2. `bun scripts/report.ts`

Pulls from all sources and prints a single table:

```
Prim System Report — 2026-02-26T19:00:00Z

SERVICE METRICS
───────────────────────────────────────────────────────
Service         Uptime    Requests  Errors  Revenue (USDC)
wallet.prim.sh  3d 2h     4,521     0       $0.45
store.prim.sh   3d 2h     1,234     2       $2.15
...

INFRASTRUCTURE COSTS (monthly)
───────────────────────────────────────────────────────
VPS (DigitalOcean)   $24.00
Domain (prim.sh)     $4.17   ($50/yr)
X handle             $11.00
R2 storage           $0.02
Tavily (estimated)   $0.45   (45 calls × $0.01)
Total                $39.64

ON-CHAIN REVENUE (last 30d)
───────────────────────────────────────────────────────
Treasury USDC balance:   $12.34
Inbound transfers (30d): $8.21
Net margin:              -$31.43 (running at cost)
```

Data sources:
- Service metrics: `GET https://<service>/v1/metrics` for each live service
- DO costs: DO API `/v2/customers/my/balance` + `/v2/invoices/preview`
- R2: CF GraphQL analytics API (`/client/v4/graphql`) — R2 storage + operations
- Tavily: estimate from search.prim.sh metrics (requests × $0.01)
- On-chain USDC: Base RPC `eth_getLogs` for USDC Transfer events to `PRIM_PAY_TO`
- Fixed costs hardcoded: domain ($50/yr), X ($11/mo)

### 3. MCP tool

Add `prim_report` tool to the unified MCP server (or as a standalone MCP if easier). Tool calls `report.ts` logic inline and returns the structured data as JSON. Agents can query system health and costs on demand.

## Files to create/modify

| File | Change |
|------|--------|
| `packages/x402-middleware/src/metrics.ts` | New — `metricsMiddleware()`, `metricsHandler()`, in-memory store |
| `packages/x402-middleware/src/index.ts` | Export metrics |
| `packages/wallet/src/index.ts` | Add metricsMiddleware + `GET /v1/metrics` free route |
| `packages/store/src/index.ts` | Same |
| `packages/spawn/src/index.ts` | Same |
| `packages/faucet/src/service.ts` | Same |
| `packages/search/src/index.ts` | Same |
| `packages/email/src/index.ts` | Same |
| `scripts/report.ts` | New — pulls all sources, prints report |
| `packages/mcp/src/tools/report.ts` | New — MCP tool wrapping report logic |

## Execution guidance

**Parallelize the service work. Sequential for report.ts and MCP.**

Recommended agent split:

| Agent | Work | Independent? |
|-------|------|-------------|
| Agent 1 | `metrics.ts` middleware in x402-middleware package | Yes — do first, others depend on it |
| Agent 2 | Add metrics to wallet + faucet | Yes (after Agent 1 ships) |
| Agent 3 | Add metrics to store + spawn | Yes (after Agent 1 ships) |
| Agent 4 | Add metrics to search + email | Yes (after Agent 1 ships) |
| Agent 5 | `scripts/report.ts` + MCP tool | Yes (after all services have /v1/metrics) |

Agent 1 must complete before 2/3/4. Agents 2/3/4 run in parallel. Agent 5 runs after 2/3/4.

2 waves: [Agent 1] → [Agents 2+3+4 in parallel] → [Agent 5]

## Environment variables needed in report.ts

```
DO_API_TOKEN          # DigitalOcean API (read balance/invoices)
CF_API_TOKEN          # Cloudflare (read R2 usage)
CF_ACCOUNT_ID         # Cloudflare account ID
PRIM_PAY_TO           # Treasury wallet address (on-chain revenue)
BASE_RPC_URL          # Base mainnet RPC
```

These are already present in VPS env files. For local `bun scripts/report.ts`, load from `.env` at repo root.

## Testing

- Unit: metricsMiddleware increments correctly, resets on reinit
- Integration: hit `/v1/metrics` on live services, verify JSON shape
- report.ts: run locally with real credentials, verify output renders
- MCP: call `prim_report` tool, verify structured response

## Before closing

- [ ] All 6 services expose `GET /v1/metrics` (free route, no x402)
- [ ] `bun scripts/report.ts` runs without errors locally
- [ ] MCP `prim_report` tool returns valid JSON
- [ ] Deploy metrics middleware to VPS via `deploy.sh`
