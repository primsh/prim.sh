# Scaling Vectors Analysis

Date: 2026-02-27
Context: Post-factory completion (INFRA-W4–W8). All 13 packages conform to factory style. Assessing what's solved, what's missing, what to defer.

## The Viral Loop

Agent discovers prim → uses it → pays (x402) → funds infrastructure → more prims built → more agents discover it.

Supply-side (building prims) is solved by the factory. Demand-side (agents find and use prims) needs zero-human-in-the-loop automation.

## Vector 1: Primitive Velocity (building new prims)

**Status: SOLVED**

| Capability | Tool | Status |
|-----------|------|--------|
| Scaffold package from YAML | `pnpm create-prim` | Done (I-9) |
| Interactive YAML wizard | `pnpm create-prim --interactive` | Done (I-11) |
| Provider scaffolder | `pnpm create-provider` | Done (I-28) |
| Smoke test generation | `pnpm gen:tests` | Done (I-10) |
| README generation | `pnpm gen:docs` | Done (I-29) |
| Conformance runner | `pnpm test:conformance` | Done (I-7) |

**Gap: gen:openapi** — OpenAPI specs are still hand-written. 3 prims (track, infer, imagine) have no spec, making them invisible to MCP/CLI/OpenAI generation. Every new prim requires someone to write a spec manually, breaking the "YAML → everything" promise. This is the single biggest automation gap.

## Vector 2: Client Surface Velocity (agent discovery)

**Status: MOSTLY SOLVED**

| Interface | Generator | Prims covered |
|-----------|----------|---------------|
| REST API | Source of truth | All 13 |
| MCP server | `gen:mcp` from OpenAPI | 9 (missing track, infer, imagine) |
| CLI commands | `gen:cli` from OpenAPI | 9 (missing track, infer, imagine) |
| OpenAI functions | `gen:openai` from OpenAPI | 9 (missing track, infer, imagine) |
| llms.txt | `gen:prims` from prim.yaml + api.ts | All 13 |
| Per-prim llms.txt | createPrimApp() | All 13 |
| Install scripts | `gen:install-scripts` | All deployed |

**Gap**: Same as Vector 1 — OpenAPI spec is the bottleneck. Once gen:openapi exists, every new prim automatically gets MCP + CLI + OpenAI coverage.

## Vector 3: Deploy Velocity (code → production)

**Status: PARTIALLY SOLVED**

| Capability | Status | Notes |
|-----------|--------|-------|
| CI (lint, typecheck, test) | Done | `.github/workflows/ci.yml` |
| gen:check in CI | Done | Validates all generated files |
| Secret scan in CI | Done | gitleaks on HEAD~1..HEAD |
| GHA deploy to VPS | Plan exists (OPS-5) | Currently manual SSH |
| Systemd + Caddy generation | `deploy-prim.ts` from prim.yaml | Done |
| Auto-deploy on merge | Plan exists (OPS-10) | Depends on OPS-5 |
| Post-deploy health gate | Not captured | Missing |

**Gaps**:
1. `deploy.sh` SERVICES list is hardcoded — token, mem, domain, track missing from auto-restart
2. No auto-deploy (still manual SSH `sync:vps`)
3. No post-deploy health verification in CI
4. CI has `continue-on-error: true` on OpenAPI validation and dependency audit — failures are invisible

## Vector 4: Contributor/Agent Velocity

**Status: FOUNDATION LAID**

| Capability | Status | Task |
|-----------|--------|------|
| create.sh API (scaffold via HTTP) | Done | I-23 |
| PR primitive (pr.sh) | Backlog | I-24 |
| Issue primitive (issue.sh) | Backlog | I-25 / FB-1 |
| Agent contribution GHA | Backlog | I-26 |
| Bot PR auto-merge | Plan exists | L-29 |

**The self-sustaining loop**: Agent calls create.sh → gets file manifest → opens PR via GitHub API → CI validates (conformance, smoke tests) → auto-merge → auto-deploy. No human review needed for conformant additions.

This pipeline is the holy grail for viral growth but requires OPS-5 (GHA deploy) + gen:openapi + I-26 (contribution GHA) first.

## Vector 5: Operational Resilience

**Status: GAPS**

| Area | Current | Gap |
|------|---------|-----|
| Rate limiting | In-memory, per-process | Resets on restart |
| Metrics | In-memory, per-process | Lost on restart |
| Backups | 4 DBs backed up daily | email, mem, token, domain DBs NOT backed up |
| Error reporting | journald only | No external aggregator (Sentry etc) |
| Health monitoring | `healthcheck.sh` cron (5min) | No alerting configured (ALERT_WEBHOOK_URL unset) |
| Tracing | In-process request_id | No cross-service tracing |
| Provider failover | None | Single provider = single point of failure |

## Vector 6: Infrastructure Scaling

**Status: DEFER**

Single VPS (DigitalOcean). Fine for pre-PMF. Premature to multi-node before traffic justifies it.

| Item | Why defer |
|------|----------|
| Multi-node / load balancing | No traffic pressure yet |
| DB migration framework | Schema stable, CREATE IF NOT EXISTS works |
| Distributed tracing | Single-service request IDs sufficient |
| Provider failover | Only matters with real traffic |
| External metrics (Prometheus) | In-memory metrics are fine for diagnostics |

## Priority Matrix

### Do Now (INFRA-W10)
1. **gen:openapi** — Closes the factory loop. Every new prim becomes instantly usable by every agent client.
2. **Dynamic deploy SERVICES** — 10-min fix, stops deploy.sh from being stale.
3. **Backup all DBs** — 10-min fix, stops potential data loss.
4. **CI strict mode** — Remove continue-on-error from OpenAPI + audit jobs.

### Do Soon (INFRA-W9 already captured)
5. **OPS-5: GHA auto-deploy** — Plan exists, unblocks the zero-touch pipeline.
6. **OPS-9/10: deploy-prim.sh + CI auto-deploy** — Captured in INFRA-W9.

### Do When Ready (promote from BKLG)
7. **I-26: Agent contribution GHA** — The viral loop closer. Depends on gen:openapi + OPS-5.
8. **I-22: tap.sh** — Agent-registered adapters. Massive force multiplier but needs design.

### Defer
9. Multi-node, distributed tracing, provider failover, external metrics.
