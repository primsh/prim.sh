# Completed Tasks

Append-only log. When a task is marked done, move its row here and remove from TASKS.md.

| ID | Task | Done |
|----|------|------|
| P-1 | llms.txt root + per-primitive files | 2026-02-24 |
| P-2 | llms.txt routes wired in `site/serve.py` | 2026-02-24 |
| W-2 | Wallet creation: keypair, keystore, SQLite | 2026-02-24 |
| W-3 | Balance queries: live USDC via viem readContract | 2026-02-24 |
| W-4 | Send USDC: ERC-20 transfer, idempotency journal, ownership check | 2026-02-24 |
| W-5 | x402 client: 402 → sign EIP-3009 → retry wrapper | 2026-02-24 |
| W-6 | Funding request: agent→owner CRUD, approve triggers sendUsdc | 2026-02-24 |
| W-7 | Policy engine: maxPerTx/maxPerDay, daily reset, per-wallet pause/resume | 2026-02-24 |
| W-8 | Execution journal: events, dead letters, tryClaim, history endpoint | 2026-02-24 |
| W-9 | Circuit breaker: global pause/resume by scope, admin routes | 2026-02-24 |
| W-10 | Non-custodial refactor: EIP-191 registration, strip keystore | 2026-02-25 |
| SP-1 | spawn.sh spec | 2026-02-24 |
| SP-2 | spawn.sh VM provisioning: Hetzner CRUD, SQLite, x402 | 2026-02-24 |
| SP-3 | VM lifecycle: start/stop/reboot/resize/rebuild | 2026-02-24 |
| SP-4 | SSH key management: register/list/delete | 2026-02-24 |
| SP-5 | x402 middleware integrated in SP-2 | 2026-02-24 |
| SP-6 | Provider abstraction: CloudProvider interface, Hetzner impl, registry | 2026-02-24 |
| SP-7 | DigitalOcean provider: DO API v2, image translation, tag-based ownership | 2026-02-25 |
| SP-8 | DO live smoke test: 9 tests against real DO API | 2026-02-25 |
| SP-9 | x402 integration test: end-to-end agent-pays-USDC→server-created | 2026-02-25 |
| R-1 | Stalwart Docker Compose + deployment docs | 2026-02-24 |
| R-2 | prim.sh domain, Stalwart config, DKIM, SPF, DMARC, ACME TLS | 2026-02-25 |
| R-3 | relay.sh mailbox CRUD: Stalwart REST wrapper, SQLite ownership | 2026-02-25 |
| R-4 | JMAP auth bridge: AES-256-GCM encryption, session discovery | 2026-02-25 |
| R-5 | Read messages: JMAP Email/query + Email/get, folder filtering | 2026-02-25 |
| R-6 | Send messages: JMAP EmailSubmission | 2026-02-25 |
| R-7 | Incoming webhooks: webhook CRUD, HMAC signing, delivery with retry | 2026-02-25 |
| R-8 | Mailbox TTL expiry | 2026-02-25 |
| R-9 | Custom domains: domain registration, DNS verification, Stalwart provisioning | 2026-02-25 |
| R-10 | x402 middleware: all 16 paid endpoints gated | 2026-02-25 |
| R-11 | Live smoke test: 11 tests against live Stalwart | 2026-02-25 |
| R-13 | Outbound email delivery confirmed: SPF/DKIM/DMARC pass, Gmail accepted | 2026-02-25 |
| R-14 | Custom usernames, permanent mailboxes, rename relay → email | 2026-02-25 |
| D-1 | dns.sh: zone + record CRUD, Cloudflare API, SQLite ownership | 2026-02-25 |
| D-4 | x402 middleware integrated in D-1 | 2026-02-25 |
| ST-1 | store.sh bucket CRUD: R2 API wrapper, name validation, SQLite ownership | 2026-02-25 |
| ST-2 | store.sh object CRUD: S3-compatible API via aws4fetch | 2026-02-25 |
| ST-3 | store.sh quota + usage: per-bucket quotas, synchronous enforcement | 2026-02-25 |
| ST-4 | x402 middleware integrated in ST-1/ST-2 | 2026-02-25 |
| ST-5 | Testnet integration: getNetworkConfig(), env vars, wallet+store on Sepolia | 2026-02-25 |
| TK-1 | token.sh scaffold + deploy + query: factory ABI, CREATE2, deployer keystore | 2026-02-25 |
| TK-2 | token.sh mint + supply: decision table, on-chain totalSupply | 2026-02-25 |
| TK-3 | Uniswap V3 pool creation: sqrtPriceX96 BigInt math, crash recovery | 2026-02-25 |
| TK-4 | OZ + viem deployContract: compile AgentToken.sol, Base Sepolia smoke test | 2026-02-25 |
| TK-7 | `prim token` CLI subcommand | 2026-02-26 |
| XC-1 | @primsh/x402-client: agent-side x402 fetch wrapper | 2026-02-25 |
| FC-1 | faucet.sh: Circle USDC drip + treasury ETH drip, rate limiting | 2026-02-25 |
| SE-1 | search.sh: web + news search via Tavily, x402 gated | 2026-02-25 |
| M-1 | mem.sh: Qdrant vector memory + SQLite KV cache + x402 | 2026-02-25 |
| M-3 | `prim mem` CLI subcommand | 2026-02-26 |
| TR-1 | track.sh: multi-carrier package tracking via Shippo | 2026-02-26 |
| B-1 | Wave 1 agent team execution: W-2, R-1, SP-1 | 2026-02-24 |
| S-6 | "This page is for humans. The API is for agents." | 2026-02-24 |
| P-6 | `prim` binary publishing + install scripts via Cloudflare R2 | 2026-02-26 |
| L-1 | Redact secrets from TASKS.md + task files | 2026-02-24 |
| L-2 | Rename all packages `@agentstack/*` → `@primsh/*` | 2026-02-24 |
| L-3 | Audit .gitignore + CLAUDE.md for public readiness | 2026-02-24 |
| L-4 | Create GitHub org `useprim` + repo `prim.sh` (private) | 2026-02-24 |
| L-5 | Register `@primsh` npm org | 2026-02-24 |
| L-6 | Write GitHub Actions CI workflow | 2026-02-24 |
| L-7 | Provision DigitalOcean VPS | 2026-02-24 |
| L-8 | Write deploy scripts: systemd + Caddyfile + setup.sh | 2026-02-24 |
| L-9 | Wire DNS A records + set env vars on VPS | 2026-02-24 |
| L-10 | Deploy Core 4 to VPS + integration smoke test | 2026-02-24 |
| L-11 | Compile `prim` binary for 4 platforms | 2026-02-25 |
| L-12 | Write install script (`curl prim.sh \| sh`) | 2026-02-25 |
| L-13 | Deploy landing site to Cloudflare Pages | 2026-02-24 |
| L-16 | Wallet allowlist: x402-middleware env-configurable | 2026-02-25 |
| L-17 | Invite codes on wallet.prim.sh | 2026-02-25 |
| L-18 | Default storage caps: per-wallet bucket + quota limits | 2026-02-25 |
| L-19 | Spawn per-wallet caps: max 3 concurrent, small only | 2026-02-25 |
| L-20 | Persist faucet rate limiter to SQLite | 2026-02-25 |
| L-21 | Redeploy VPS after L-16 through L-20 | 2026-02-25 |
| L-23 | Agent-friendly 403: include `access_url` in denial | 2026-02-25 |
| L-24 | Access request endpoint on wallet.sh | 2026-02-25 |
| L-25 | Access landing page: `prim.sh/access` | 2026-02-26 |
| L-26 | Community setup: CONTRIBUTING.md, issue templates, LICENSE | 2026-02-25 |
| L-28 | Agent feedback endpoint on api.prim.sh | 2026-02-25 |
| L-30 | Update llms.txt with feedback + access request docs | 2026-02-25 |
| L-31 | Deploy access request + invite flow: CF Worker + D1 + wallet internal API | 2026-02-26 |
| L-32 | Faucet treasury fallback for Circle 429s | 2026-02-25 |
| L-33 | Fix `prim wallet create` OpenSSL scrypt memory limit crash | 2026-02-26 |
| L-34 | Fix CLI `--flag value` parsing | 2026-02-26 |
| L-35 | Agent access request e2e test | 2026-02-26 |
| L-36 | Launch readiness smoke test: full CLI flow | 2026-02-26 |
| L-37 | Finalize brand assets: logo/favicon/banner/heroes | 2026-02-26 |
| L-39 | Write public README.md | 2026-02-26 |
| L-40 | Legal: Terms of Service + Privacy Policy | 2026-02-26 |
| L-43 | Update site/agentstack/ references, clean up placeholder links | 2026-02-26 |
| L-48 | Deploy search.sh to VPS | 2026-02-25 |
| L-49 | Update llms.txt: move search.sh to live | 2026-02-25 |
| L-58 | Set up `hello@prim.sh` contact email | 2026-02-26 |
| L-59 | Update Discord invite link in README + issue templates | 2026-02-26 |
| L-61 | Dynamic allowlist: all services query wallet.sh internal API | 2026-02-26 |
| L-62 | Write OpenAPI specs for all 5 live primitives | 2026-02-26 |
| L-63 | Rewrite llms.txt as full plain-text API reference | 2026-02-26 |
| L-64 | Generate MCP servers from OpenAPI specs | 2026-02-26 |
| L-65 | Write Skills per primitive | 2026-02-26 |
| L-66 | Package as Plugins: MCP + Skill bundles | 2026-02-26 |
| L-67 | Extend CLI to all live prims | 2026-02-26 |
| L-68 | Deploy email.sh to VPS | 2026-02-26 |
| L-69 | Pre-deployment readiness check script | 2026-02-26 |
| L-72 | Agent Interface Wave 2: email, mem, domain, token | 2026-02-26 |
| L-73 | Fix domain.sh freeRoutes | 2026-02-26 |
| SEC-1 | Infra hardening: fail2ban, SSH key-only, unattended-upgrades | 2026-02-25 |
| SEC-2 | Caddy security headers: HSTS, CSP, X-Frame-Options | 2026-02-25 |
| SEC-3 | Edge rate limiting: Caddy timeouts, header/body size limits | 2026-02-25 |
| SEC-4 | Dependency audit: `pnpm audit` in CI | 2026-02-25 |
| SEC-5 | Input validation + request size limits (Hono body-limit) | 2026-02-25 |
| SEC-6 | SQLite backup: daily cron → R2, 30-day retention | 2026-02-25 |
| SEC-7 | Secrets audit: no .env in git history, file perms 600 | 2026-02-25 |
| OPS-1 | Uptime monitoring: external health checks + alerting | 2026-02-25 |
| OPS-3 | Incident runbook: restart procedures, log locations | 2026-02-26 |
| OBS-1 | Service observability: `/v1/metrics` + `report.ts` | 2026-02-26 |
| I-1 | Primitives status SOT: `primitives.yaml` + codegen | 2026-02-26 |
| I-2 | Business observability (superseded by OBS-1) | 2026-02-26 |
| SITE-1 | SSR site: template + per-prim YAML, serve.ts | 2026-02-26 |
| BIZ-1 | Master pricing list: `specs/pricing.yaml` | 2026-02-26 |
| BIZ-4 | Pricing endpoint: `GET /pricing` on each service | 2026-02-26 |
| I-3 | Coverage gate: set `reportsDirectory` in each vitest.config.ts | 2026-02-26 |
| E-9 | Rename mail hostname: DNS A record `mail.prim.sh`, update Stalwart config | 2026-02-26 |
| OPS-2 | Structured logging: JSON logger with request_id, replace console.log | 2026-02-26 |
| L-47 | Clean up API URL redundancy: `api.prim.sh/api/*` → `api.prim.sh/*` | 2026-02-26 |
| BIZ-2 | Expense dashboard: `bun scripts/expenses.ts` | 2026-02-26 |
| BIZ-3 | Cost transparency doc: `docs/costs.md` | 2026-02-26 |
| COM-2 | Add CODE_OF_CONDUCT.md (Contributor Covenant) | 2026-02-26 |
| HRD-2 | Fix `allowlist-db.ts` DB handle leak: use singleton pattern | 2026-02-26 |
| HRD-3 | Expand wallet smoke test to 5-check contract | 2026-02-26 |
| HRD-4 | Add try-catch around `JSON.parse` calls in service layers | 2026-02-26 |
| HRD-5 | Fix `setUTCHours(24)` in `wallet/src/db.ts` | 2026-02-26 |
| HRD-6 | Create `SECURITY.md` | 2026-02-26 |
| HRD-7 | Add `pnpm -r lint` + `pnpm -r typecheck` to CI | 2026-02-26 |
| HRD-8 | Standardize pagination via shared PaginatedList<T> | 2026-02-26 |
| HRD-9 | Add per-package `README.md` | 2026-02-26 |
| HRD-10 | Per-wallet rate limiting in x402-middleware | 2026-02-26 |
| HRD-11 | Replace silent catch blocks with logger.warn() | 2026-02-26 |
| HRD-12 | Fail-fast on missing PRIM_PAY_TO | 2026-02-26 |
| HRD-13 | Extract shared error helpers into x402-middleware | 2026-02-26 |
| HRD-14 | Normalize API response fields to snake_case | 2026-02-26 |
| HRD-17 | Backfill spawn smoke test to 5-check contract | 2026-02-26 |
| HRD-18 | Add email smoke test with 5-check contract | 2026-02-26 |
| HRD-19 | Fix token test mock typing | 2026-02-26 |
| HRD-21 | Add package.json metadata to all packages | 2026-02-26 |
| COM-1 | Add CHANGELOG.md | 2026-02-26 |
| I-2 | Migrate TASKS.md → tasks.json | 2026-02-26 |
| SITE-3 | Fix site bugs: mobile breakpoints, dead CSS | 2026-02-26 |
| SITE-4 | OG + Twitter Card meta tags | 2026-02-26 |
| SITE-5 | SEO baseline meta tags | 2026-02-26 |
| SITE-6 | Custom 404 page | 2026-02-26 |
| SITE-7 | Smooth scroll + scroll-hint anchors | 2026-02-26 |
| SITE-8 | Fix `.hero` flexbox structure on sub-pages | 2026-02-26 |
2026-02-26 | SITE-9 | Per-product install.sh: generator, serve route, hero block | done
