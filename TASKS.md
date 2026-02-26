# TASKS

<!--
Hierarchy: Section (##) → Lane (###) → Wave (####) → Phase (#####) → Task (row)
- Section: topical grouping. NOT a parallelism boundary.
- Lane: independent track. Parallel by definition — lanes cannot conflict.
- Wave/Phase: optional grouping within a lane. Annotated PARA or SRL.
- Task: table row. Depends column encodes serial ordering.

Table: | ID | Task | Owner | Depends | Status |
Archival: done → tasks/completed/log.md, then removed from this file.
Full conventions: tasks/README.md
-->

## LNCH — Launch

Tasks that block repo going public + mainnet switchover.

### Lane LNCH-1: Token + Public (SRL)

| ID | Task | Owner | Depends | Status |
|----|------|-------|---------|--------|
| L-27 | **DO FIRST.** Deploy $PRIM ERC-20 to Base mainnet. Register ticker on BaseScan. 100% supply to treasury wallet. Pool deferred | Garric | -- | pending |
| PRIM-2 | $PRIM utility design: fee discounts, governance, access tiers, revenue share. Design doc only. Plan: `tasks/active/prim-2-token-utility-2026-02-26.md` | Garric + Claude | L-27 | pending |
| L-22 | Mainnet switchover: VPS env files `eip155:84532` → `eip155:8453`, set prod `PRIM_PAY_TO`, fund facilitator with mainnet USDC | Garric | L-27 | pending |
| L-15 | Pre-public checklist: rotate Stalwart admin password + relay-wrapper API key, verify no secrets in git history, confirm .env files gitignored | Garric | -- | pending |
| L-14 | Full token launch: create Uniswap pool, fund liquidity, make repo public, announce. Seed pool conservatively ($2–3K USDC) | Garric + Claude | L-15, L-27, PRIM-2 | pending |

### Lane LNCH-2: Service Deploys (PARA)

| ID | Task | Owner | Depends | Status |
|----|------|-------|---------|--------|
| L-70 | Deploy token.sh to VPS: systemd unit (prim-token:3007), Caddy route, DNS, env vars, smoke test | Garric | -- | pending |
| L-71 | Deploy mem.sh to VPS: Qdrant instance, systemd unit (prim-mem:3008), Caddy route, DNS, env vars, smoke test | Garric | -- | pending |

---

## HRD — Hardening

Code quality, security, and reliability fixes from open-source readiness review.

### Lane HRD-1: Open-Source Readiness (PARA)

| ID | Task | Owner | Depends | Status |
|----|------|-------|---------|--------|
| H-1 | Remove `*.db` + `server.log` from repo; scrub `.env.email` from git history | Garric | -- | pending |
| H-2 | Fix `allowlist-db.ts` DB handle leak: use singleton pattern from `wallet/db.ts` | Claude | -- | pending |
| H-3 | Expand wallet smoke test to 5-check contract (match `track/test/smoke.test.ts`) | Claude | -- | pending |
| H-4 | Add try-catch around `JSON.parse` calls in service layers (wallet, email, store) | Claude | -- | pending |
| H-5 | Fix `setUTCHours(24)` in `wallet/src/db.ts` — use explicit date arithmetic | Claude | -- | pending |
| H-6 | Create `SECURITY.md` (referenced by CONTRIBUTING.md but missing) | Claude | -- | pending |
| H-7 | Add `pnpm -r lint` + `pnpm -r typecheck` to `.github/workflows/ci.yml` | Claude | -- | pending |
| H-8 | Standardize pagination: define shared response shape across all list endpoints | Claude | -- | pending |
| H-9 | Add per-package `README.md` (purpose, install, API summary) | Claude | -- | pending |
| H-10 | Add per-wallet rate limiting to x402-middleware (configurable, default 60/min) | Claude | -- | pending |
| I-3 | Coverage gate: set `reportsDirectory` in each vitest.config.ts so gate runner enforces thresholds. 11 packages | Claude | -- | done |

---

## PRIMS — Primitives

Feature work on specific services.

### Lane PRIMS-1: store.sh (PARA)

| ID | Task | Owner | Depends | Status |
|----|------|-------|---------|--------|
| ST-7 | Presigned URLs (GET + PUT): time-limited signed R2 URLs for direct agent access | Claude | -- | pending |
| ST-8 | Public buckets: per-bucket public-read flag, stable object URLs | Claude | -- | pending |
| ST-9 | Multipart upload: S3 multipart API for objects >5MB | Claude | -- | pending |
| ST-10 | Object copy: within or between owned buckets | Claude | -- | pending |
| ST-11 | Lifecycle rules: per-bucket auto-expiry policies | Claude | -- | pending |
| ST-12 | Bucket event webhooks: HMAC-signed callbacks on create/delete | Claude | -- | pending |
| ST-13 | Object metadata + tagging: custom key-value metadata | Claude | -- | pending |

### Lane PRIMS-2: email.sh (SRL)

| ID | Task | Owner | Depends | Status |
|----|------|-------|---------|--------|
| E-9 | Rename mail hostname: DNS A record `mail.prim.sh`, update Stalwart config + deploy env, verify SMTP banner | Claude | -- | done |
| E-4 | Domain warmup: send low-volume emails to engaged recipients, ramp over weeks | Claude | E-9 | pending |
| E-5 | Verify Gmail inbox delivery (not spam) after warmup + PTR + DMARC changes | Claude | E-4 | pending |
| E-6 | Verify Apple Mail / iCloud delivery after warmup | Claude | E-4 | pending |
| E-7 | Upgrade DMARC back to `p=quarantine` once inbox delivery is consistent | Claude | E-5, E-6 | pending |

### Lane PRIMS-3: spawn.sh

| ID | Task | Owner | Depends | Status |
|----|------|-------|---------|--------|
| SP-7 | DockerProvider: Docker container tier as default (10–50x cheaper than VMs). Plan: `tasks/active/sp-7-docker-provider-2026-02-26.md` | Claude | -- | pending |

### Lane PRIMS-4: track.sh

| ID | Task | Owner | Depends | Status |
|----|------|-------|---------|--------|
| TR-2 | Smoke test + deploy: live Shippo call, systemd unit, Caddy route, DNS, env vars | Claude + Garric | -- | pending |

---

## INFRA — Infrastructure

CI, tooling, observability, pricing, cross-cutting platform work.

### Lane INFRA-1: Tooling (PARA)

| ID | Task | Owner | Depends | Status |
|----|------|-------|---------|--------|
| OPS-2 | Structured logging: JSON logger with request_id, replace console.log | Claude | -- | done |
| OPS-4 | Load test baseline: k6/artillery against health + store CRUD, document capacity | Claude | -- | pending |
| L-29 | GH Action: auto-dedupe issues, stale auto-close (30d), bot PR auto-merge if CI passes | Claude | -- | pending |
| L-47 | Clean up API URL redundancy: `api.prim.sh/api/*` → `api.prim.sh/*`. Breaking change — coordinate with L-22 | Claude | L-22 | done |

### Lane INFRA-2: Business (SRL)

| ID | Task | Owner | Depends | Status |
|----|------|-------|---------|--------|
| BIZ-2 | Expense dashboard: `bun scripts/expenses.ts` — DO + CF R2 + Tavily + on-chain USDC + fixed costs. Margin table per primitive | Claude | -- | done |
| BIZ-3 | Cost transparency doc: `docs/costs.md` — public infra cost breakdown + per-call cost math + phased margin model | Claude | BIZ-2 | done |
| L-60 | Pricing audit: review x402 pricing against real provider costs. Risks: spawn ($0.01 create vs $4/mo DO), token ($1 deploy vs $10-50 gas) | Claude + Garric | L-22 | pending |

---

## COMM — Community & Brand

Docs, Discord, brand assets, marketing.

### Lane COMM-1: Brand + Social (SRL)

| ID | Task | Owner | Depends | Status |
|----|------|-------|---------|--------|
| L-54 | Create Discord server: name "Prim", channels (#general, #bugs, #feature-requests, #announcements), permanent invite link | Garric | -- | pending |
| L-38 | Set brand assets on platforms: GitHub org avatar + repo social preview, X profile pic + banner, Discord icon | Garric | L-54 | pending |
| L-55 | Upload `final-logo.jpg` as GitHub org avatar, X @useprim profile pic, Discord server icon | Garric | L-54 | pending |
| L-56 | Upload `final-x-banner.jpg` as X @useprim header image | Garric | -- | pending |
| L-57 | Upload `final-social-preview.jpg` as GitHub repo social preview | Garric | -- | pending |

### Lane COMM-2: Content + Features (PARA)

| ID | Task | Owner | Depends | Status |
|----|------|-------|---------|--------|
| L-41 | Human docs: `prim.sh/docs` getting-started guide. Wallet setup, faucet, first API call, per-primitive examples | Claude | -- | pending |
| L-42 | Draft X launch content: tweet copy per teaser image, launch thread script, pin strategy | Garric + Claude | -- | pending |
| L-44 | Access form: add optional X handle + GitHub handle fields. Store in D1 `access_requests` table | Claude | -- | pending |
| L-45 | Wallet ping on access approval: tiny USDC transfer with calldata `prim.sh:access:approved` | Claude | L-44 | pending |
| L-46 | Per-page hero color variation: accent-colored radial gradient behind hero | Claude | -- | pending |

---

## BKLG — Backlog

Future primitives and deferred ideas. No timeline.

| ID | Task | Owner | Depends | Status |
|----|------|-------|---------|--------|
| L-50 | deploy.sh: PaaS above spawn.sh — push container or repo URL, get live endpoint. Wraps Dokku/Coolify | Claude | -- | backlog |

### Future Primitives

| Primitive | Wraps | Notes |
|-----------|-------|-------|
| vault.sh | HashiCorp Vault or custom | Encrypted store |
| cron.sh | Custom | Lightweight job scheduler |
| pipe.sh | NATS or Redis Streams | Message streaming |
| code.sh | E2B or Firecracker | Sandboxed execution |
| ring.sh | Telnyx API | Regulatory prep needed |
| infer.sh | OpenRouter or direct provider APIs | LLM gateway |
| seek.sh | Brave Search or SearXNG | Web search (alternative to search.sh Tavily) |
| browse.sh | Playwright or Browserbase | Web browsing |
| auth.sh | Custom OAuth broker | Builds on vault.sh |
| watch.sh | OpenTelemetry collector | Monitoring |
| trace.sh | OpenTelemetry + Jaeger | Distributed tracing |
| docs.sh | Custom OpenAPI→MCP converter | API documentation |
| id.sh | Custom on-chain reputation | Needs ecosystem first |
| pins.sh | Google Places or Overture Maps | Location data |
| hive.sh | A2A protocol | Agent discovery + collaboration |
| ads.sh | Custom | Needs ecosystem first |
| skills.sh | Custom marketplace | Buy/sell agent skills |
| mart.sh | Amazon/eBay API proxy | Heavy regulatory |
| ship.sh | EasyPost or Shippo | Shipping labels |
| hands.sh | Custom gig platform | Heaviest regulatory burden |
| pay.sh | Stripe + x402 bridge | Fiat payment bridge |
| borrow.sh | Custom on-chain escrow | Agent-to-agent USDC lending |
| guard.sh | Custom + sentinel patterns | Security scanning |
| trade.sh | Broker APIs + Polymarket | Trading for agents |
| insure.sh | Custom actuarial + escrow | Agent operation insurance |
| know.sh | Custom knowledge graph | Structured canonical knowledge |
| props.sh | ATTOM Data, Zillow APIs | Real estate data |
| mktdata.sh | Polygon.io, Unusual Whales | Market data feeds |
| corp.sh | Stripe Atlas API or custom | Legal entity formation |
