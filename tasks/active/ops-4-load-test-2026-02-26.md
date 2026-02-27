# OPS-4: Load test baseline — k6 against health + store CRUD

**Status**: pending
**Scope**: `tests/load/`, `package.json` (new script)

## Problem

No performance baseline exists. Before going public we need to know the VPS's capacity under load — request/sec for health checks, latency percentiles for store CRUD, and the breaking point. Without this, the first traffic spike is a mystery.

## Goals

1. Establish p50/p95/p99 latency and max RPS for `GET /` (health) on wallet, store, spawn
2. Establish CRUD throughput for store.sh (`POST /v1/set`, `POST /v1/get`, `POST /v1/list`, `POST /v1/delete`)
3. Identify the concurrency level where error rate exceeds 1%
4. Document results in `tests/load/BASELINE.md` for future comparison

## Tool choice

**k6** (Grafana). Reasons:
- JS-based scripts (matches the codebase language)
- Built-in summary output (p50/p95/p99, RPS, error rate)
- Runs locally against remote VPS — no agent install needed
- `k6 run --summary-trend-stats` gives exactly what we need

## Test scenarios

### Scenario 1: Health check throughput

Target: `GET https://<prim>.prim.sh/`

Ramp: 1 → 50 → 100 VUs over 60s, hold 100 VUs for 60s, ramp down.

Thresholds:
- p95 < 200ms
- Error rate < 0.1%

### Scenario 2: Store CRUD cycle

Each VU iteration:
1. `POST /v1/set` — write a key/value (unique per VU+iteration)
2. `POST /v1/get` — read it back
3. `POST /v1/list` — list keys with prefix
4. `POST /v1/delete` — delete the key

Ramp: 1 → 20 → 50 VUs over 60s, hold 50 VUs for 60s.

Note: These requests will get 402 from x402 middleware unless we either:
- Run against localhost (bypass x402)
- Use a test facilitator key in the x402 header

Recommendation: run against localhost on the VPS via SSH tunnel (`ssh -L 3002:localhost:3002 root@<VPS_IP>`), avoiding x402 overhead. This isolates service performance from payment protocol latency.

### Scenario 3: Spike test

Instant jump to 200 VUs for 30s. Measures recovery behavior and whether Bun's event loop degrades gracefully or cascades.

## Files

| File | Purpose |
|------|---------|
| `tests/load/health.k6.js` | Scenario 1 — health endpoint throughput |
| `tests/load/store-crud.k6.js` | Scenario 2 — store CRUD cycle |
| `tests/load/spike.k6.js` | Scenario 3 — spike to 200 VUs |
| `tests/load/BASELINE.md` | Results table (committed after first run) |
| `package.json` | Add `"test:load": "k6 run tests/load/health.k6.js"` |

## Execution

```bash
# Install k6 locally (macOS)
brew install k6

# SSH tunnel to VPS (store runs on port 3002)
ssh -L 3002:localhost:3002 -L 3001:localhost:3001 root@<VPS_IP>

# Run from repo root
k6 run tests/load/health.k6.js
k6 run tests/load/store-crud.k6.js
k6 run tests/load/spike.k6.js
```

## BASELINE.md format

```markdown
# Load Test Baseline — 2026-02-26

VPS: DigitalOcean (1 vCPU, 1GB RAM, Ubuntu 24.04)
Runtime: Bun 1.x
Test tool: k6 v0.x

## Health (GET /)

| Metric | Value |
|--------|-------|
| Max RPS | |
| p50 | |
| p95 | |
| p99 | |
| Error rate | |

## Store CRUD (50 VUs)

| Metric | set | get | list | delete |
|--------|-----|-----|------|--------|
| p50 | | | | |
| p95 | | | | |
| p99 | | | | |
| Error rate | | | | |

## Spike (200 VUs, 30s)

| Metric | Value |
|--------|-------|
| Max RPS | |
| p99 during spike | |
| Recovery time | |
| Error rate | |
```

## Before closing

- [ ] All 3 k6 scripts run without errors
- [ ] BASELINE.md populated with real numbers
- [ ] `pnpm test:load` script added to root package.json
- [ ] Results reviewed — if p95 > 500ms or error rate > 1% at 50 VUs, file a follow-up task
