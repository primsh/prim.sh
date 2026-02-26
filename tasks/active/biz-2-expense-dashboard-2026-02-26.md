# BIZ-2: Expense Dashboard — `bun scripts/expenses.ts`

**Date:** 2026-02-26
**Status:** pending
**Owner:** Claude
**Depends on:** OBS-1 (metrics endpoint must exist on deployed services)

## Context

`report.ts` (OBS-1) already pulls aggregate metrics + infra costs + on-chain revenue, but it shows a single net margin number. There is no per-primitive P&L view. BIZ-2 builds a dedicated expense script that computes **margin per primitive** by combining:

- Variable costs attributed to each primitive (Tavily calls for search.sh, R2 ops for store.sh, DO droplets for spawn.sh, gas for token.sh)
- Fixed costs allocated proportionally (VPS, domain, X handle)
- Revenue per primitive from on-chain USDC + `/v1/metrics` payment data

This is the foundation for BIZ-3 (public cost transparency doc) and BIZ-4 (pricing endpoint) — both need per-primitive cost data.

## Goal

`bun scripts/expenses.ts` prints a margin table. `--json` flag emits machine-readable JSON for downstream consumption (MCP, BIZ-3).

## Data Sources

### 1. Revenue (per-primitive)

**Source:** `GET https://<service>/v1/metrics` on each deployed service.

The metrics response already has `payments.total_usdc` (aggregate) and `payments.by_endpoint` (per-route count). To get per-primitive USDC revenue: use aggregate `payments.total_usdc` from each service's metrics.

**Fallback / cross-check:** On-chain USDC Transfer events to `PRIM_PAY_TO` via Base RPC `eth_getLogs` (already implemented in `report.ts` as `fetchOnChainRevenue()`). This gives total inbound but not per-primitive attribution — use as a sanity check row.

### 2. Variable Costs

| Primitive | Cost source | How to fetch | Per-unit cost |
|-----------|-------------|--------------|---------------|
| search.sh | Tavily API calls | `metrics.requests.by_endpoint["POST /v1/search"].count` + `["POST /v1/search/news"].count` + `["POST /v1/extract"].count` | $0.005/search, $0.005/extract (from `specs/pricing.yaml`) |
| store.sh | R2 storage + ops | CF GraphQL API (already in `report.ts` as `fetchR2Costs()`) | $0.015/GB storage, $4.50/M class A, $0.36/M class B |
| spawn.sh | DO droplets created via prim | DO API `GET /v2/droplets` filtered by tag `prim-spawn` (spawn.sh should tag droplets) | $4-48/mo per droplet depending on size |
| token.sh | Gas costs for deploys/mints/pools | Estimate from metrics count × avg gas. No direct API — use pricing.yaml provider_cost as estimate | $0.10/deploy, $0.01/mint, $0.05/pool |
| mem.sh | Google embedding API | Estimate from metrics count × $0.0001/call | $0.0001/upsert, $0.0001/query |
| wallet.sh, email.sh, domain.sh, faucet.sh | $0 variable cost | No fetch needed — all self-hosted, SQLite-only | $0.00 |

### 3. Fixed Costs (monthly)

Hardcoded constants, same as report.ts:

| Item | Monthly | Source |
|------|---------|--------|
| VPS (DigitalOcean) | $24.00 | DO API `GET /v2/customers/my/balance` (MTD), fallback $24 |
| Domain (prim.sh) | $4.17 | $50/yr fixed |
| X handle (@primsh) | $11.00 | fixed |

Fixed costs are allocated to primitives proportionally by request volume (primitives with more traffic bear more of the shared infrastructure cost). Faucet excluded from allocation (free service, loss leader).

### 4. Env Vars Required

Same as report.ts — loaded from `.env` at repo root:
- `DO_API_TOKEN` — DigitalOcean API (optional, falls back to estimate)
- `CF_API_TOKEN` + `CF_ACCOUNT_ID` — Cloudflare R2 analytics (optional)
- `BASE_RPC_URL` — Base chain RPC (optional, defaults to `https://mainnet.base.org`)
- `PRIM_PAY_TO` — Treasury wallet address for on-chain cross-check

## Output Format

### Terminal (default)

```
Prim Expense Dashboard — 2026-02-26T19:00:00Z

PER-PRIMITIVE MARGIN (30d)
────────────────────────────────────────────────────────────────────────
Primitive        Revenue   Variable   Fixed Alloc   Total Cost   Margin
wallet.sh        $0.45     $0.00      $5.20         $5.20        -$4.75
store.sh         $2.15     $0.02      $8.90         $8.92        -$6.77
spawn.sh         $0.01     $16.00     $1.20         $17.20       -$17.19
email.sh         $0.12     $0.00      $3.10         $3.10        -$2.98
search.sh        $0.50     $0.25      $4.80         $5.05        -$4.55
token.sh         $1.00     $0.10      $2.50         $2.60        -$1.60
mem.sh           $0.03     $0.01      $1.80         $1.81        -$1.78
domain.sh        $0.08     $0.00      $2.10         $2.10        -$2.02
faucet.sh        $0.00     $0.00      $0.00         $0.00        $0.00
────────────────────────────────────────────────────────────────────────
TOTAL            $4.34     $16.38     $29.60        $45.98       -$41.64

ON-CHAIN CROSS-CHECK
  Treasury balance:        $12.34
  Inbound (30d):           $4.34
  Metrics-reported total:  $4.34
  Δ:                       $0.00 ✓

RISK FLAGS
  ⚠ spawn.sh: -171,900% margin on POST /v1/servers ($0.01 charge vs $4/mo)
  ⚠ search.sh POST /v1/extract: 0% margin (at cost)
```

### JSON (`--json`)

```json
{
  "timestamp": "...",
  "primitives": [
    {
      "id": "wallet",
      "name": "wallet.sh",
      "revenue_usdc": 0.45,
      "variable_cost": 0.00,
      "fixed_cost_alloc": 5.20,
      "total_cost": 5.20,
      "margin_usdc": -4.75,
      "margin_pct": -1055.56
    }
  ],
  "totals": { ... },
  "on_chain_cross_check": { ... },
  "risk_flags": [ ... ]
}
```

## Architecture

### File: `scripts/expenses.ts`

Single file. Reuses existing modules:

- `scripts/lib/primitives.ts` — `loadPrimitives()`, `deployed()` for service list
- Data fetchers from `report.ts` — **extract** `fetchDOCosts()`, `fetchR2Costs()`, `fetchOnChainRevenue()` into `scripts/lib/infra.ts` so both scripts share them. `report.ts` imports from the shared lib instead of defining inline.

New code in `expenses.ts`:
- `fetchAllMetrics()` — parallel fetch of `/v1/metrics` from each deployed service (similar to report.ts but returns the full `by_endpoint` breakdown, not just totals)
- `computeVariableCosts()` — takes metrics, returns per-primitive variable cost using pricing.yaml provider_cost values
- `computeFixedAllocation()` — takes total fixed costs + per-primitive request counts, returns proportional allocation
- `buildMarginTable()` — assembles the final per-primitive rows
- `detectRiskFlags()` — reads pricing.yaml, flags any route where margin < 10% or provider_cost exceeds x402_price
- `printExpenseTable()` / JSON output

### Dependency direction

```
scripts/expenses.ts
  └─ imports from scripts/lib/infra.ts (shared fetchers)
  └─ imports from scripts/lib/primitives.ts (existing)
  └─ reads specs/pricing.yaml (provider_cost data)

scripts/report.ts
  └─ imports from scripts/lib/infra.ts (refactored out of report.ts)
  └─ imports from scripts/lib/primitives.ts (existing, no change)
```

### Refactor: `scripts/lib/infra.ts`

Extract from `report.ts` into a shared module:
- `fetchDOCosts(): Promise<InfraCost | null>`
- `fetchR2Costs(): Promise<InfraCost | null>`
- `fetchOnChainRevenue(): Promise<OnChainRevenue>`
- `fetchServiceMetrics(host: string): Promise<ServiceMetrics>`
- The `InfraCost`, `OnChainRevenue`, `ServiceMetrics` types

`report.ts` then imports these instead of defining them inline. Both scripts share the same fetcher logic.

### Pricing YAML loader

Read `specs/pricing.yaml` at script start. Parse with `yaml` package (already a dependency). Use `provider_cost` field per route to compute variable costs from metrics counts.

For routes where `provider_cost` is `"$0.00"`, variable cost is zero. For routes like `POST /v1/servers` where provider_cost is `"$4.00"`, that represents a recurring monthly cost per active resource — need special handling (count active droplets via DO API, not just request count).

### Spawn.sh special case

Spawn is unique: a single `POST /v1/servers` request creates a $4+/mo ongoing cost. Variable cost is not `requests × per_call_cost` but rather `active_droplets × monthly_rate`.

Fetch active prim-spawned droplets: `GET /v2/droplets?tag_name=prim-spawn` from DO API. Sum their `size.price_monthly` values. If DO API unavailable, estimate from metrics (number of create requests minus destroy requests).

## Phases

### Phase 1: Extract shared infra lib

1. Create `scripts/lib/infra.ts` with types + fetcher functions extracted from `report.ts`
2. Update `report.ts` to import from `scripts/lib/infra.ts`
3. Verify `bun scripts/report.ts` still works identically

### Phase 2: Build expenses.ts

1. Create `scripts/expenses.ts` with the shebang + env loading pattern from report.ts
2. Load primitives via `loadPrimitives()` + `deployed()`
3. Parse `specs/pricing.yaml` for provider_cost data
4. Parallel-fetch: all service metrics, DO costs, R2 costs, on-chain revenue, DO droplets (for spawn)
5. Compute variable costs per primitive from metrics × provider_cost
6. Compute fixed cost allocation (proportional by request volume)
7. Assemble margin table
8. Print terminal table or JSON

### Phase 3: Risk flags

1. Compare each route's x402 price vs provider_cost from pricing.yaml
2. Flag routes with margin < 10%
3. Flag spawn.sh specifically if active droplets exist (ongoing cost exposure)
4. Print risk section at bottom of output

## Testing

No automated tests for this script (same as report.ts — it's a CLI reporting tool that calls external APIs). Manual verification:

1. `bun scripts/expenses.ts` — prints table with all deployed primitives
2. `bun scripts/expenses.ts --json` — valid JSON output
3. `bun scripts/expenses.ts` with no env vars — gracefully falls back to estimates, no crashes
4. Verify revenue totals match `bun scripts/report.ts` output
5. After refactor, `bun scripts/report.ts` output is unchanged

## Before closing

- [ ] Run `bun scripts/report.ts` after refactor — output must be identical to pre-refactor
- [ ] Run `bun scripts/expenses.ts` — no runtime errors, all primitives listed
- [ ] Run `bun scripts/expenses.ts --json | jq .` — valid JSON
- [ ] Run with no env vars set — graceful fallbacks, no uncaught exceptions
- [ ] Verify revenue cross-check: sum of per-primitive revenue matches on-chain inbound
- [ ] Verify fixed cost allocation sums to total fixed costs (no rounding drift)
- [ ] Confirm `specs/pricing.yaml` provider_cost values are loaded correctly for variable cost calc
