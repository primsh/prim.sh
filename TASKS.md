# TASKS

## Active

| Priority | ID | Task | Scope | Depends on | Status |
|---|---|---|---|---|---|
| 1 | S-1 | Fix "Fourteen primitives" copy → "Nineteen" (manifesto x2 + CTA in `agentstack/index.html`) | site/index.html | — | done |
| 2 | S-2 | Fix `.c` CSS class collision in `agentstack/index.html` (coral vs comment gray) | site/index.html | — | done |
| 3 | S-3 | Add missing routes to `serve.py` (mem, infer, watch + new primitives: browse, auth, code, trace) | site/serve.py | — | done |
| 4 | S-4 | Create landing pages for new primitives (browse, auth, code, trace) | site/ | — | done |
| 5 | S-5 | Update landing page hero count to 26 primitives, add new primitive cards | site/index.html | — | done |
| 6 | S-6 | Add "This page is for humans. The API is for agents." line to all landing pages | site/ | — | done |
| 7 | P-1 | Write llms.txt (root) + per-primitive llms.txt files | site/ | — | done |
| 8 | P-2 | Add llms.txt routes to serve.py (or replace with smarter static server) | site/serve.py | P-1 | done |
| 9 | P-3 | Set up monorepo structure (pnpm workspaces, shared x402 middleware package) | root | — | done |
| 10 | P-4 | Build shared x402 Hono middleware package | packages/x402-middleware | P-3 | done |
| 11 | W-1 | Design wallet.sh API surface (finalize endpoints, request/response shapes) | specs/wallet.md | — | done |
| 12 | W-2 | Implement wallet creation (local keypair generation, encrypted keystore) | wallet/ | W-1 | done |
| 13 | W-3 | Implement balance queries (Base USDC via RPC) | wallet/ | W-2 | done |
| 14 | W-4 | Implement send (USDC transfer on Base) | wallet/ | W-2 | done |
| 15 | W-5 | Integrate x402 client (`@x402/fetch` wrapper) | wallet/ | W-2 | done |
| 16 | W-6 | Implement funding request flow (agent → owner notification → approval) | wallet/ | W-4 | done |
| 17 | W-7 | Implement budget/spending policy engine | wallet/ | W-4 | done |
| 18 | W-8 | Port execution journal + idempotency from Railgunner | wallet/ | W-4 | done |
| 19 | W-9 | Port circuit breaker from Railgunner | wallet/ | W-4 | done |
| 20 | D-1 | Build dns.sh: zone + record CRUD via Cloudflare API | packages/domain | P-4 | done |
| 21 | D-2 | Rename dns.sh → domain.sh, add domain search endpoint (registrar availability API) | packages/dns→domain | D-1 | done |
| 22 | D-3 | Build domain.sh: domain registration endpoint (registrar purchase API) | packages/domain | D-2 | done |
| 23 | D-4 | Integrate x402 middleware | dns/ | D-1, P-4 | done |
| 45 | D-5 | Build domain.sh: mail-setup convenience endpoint (MX+SPF+DMARC+DKIM in one call) | packages/domain | D-1 | done |
| 46 | D-6 | Build domain.sh: verification endpoint (NS + record propagation checks) | packages/domain | D-1 | done |
| 47 | D-7 | Build domain.sh: auto-configure NS to Cloudflare after registration | packages/domain | D-3 | done |
| 48 | D-8 | Build domain.sh: batch record operations (atomic multi-record create/update/delete) | packages/domain | D-2 | done |
| 49 | D-9 | domain.sh live smoke test: zone + record CRUD (create/get/list/update/batch/delete) via real Cloudflare API; optional NameSilo domain search | packages/domain | D-1 | done |
| 49 | D-9 | domain.sh live smoke test: real Cloudflare API calls (zone CRUD, record CRUD, mail-setup, verify, batch), optional NameSilo search + registration | packages/domain | D-8 | pending |
| 24 | R-1 | Deploy Stalwart (Docker on DigitalOcean Droplet) | deploy/email | DO account | done |
| 25 | R-2 | Configure Stalwart: domain, DKIM, SPF, DMARC, ACME TLS | deploy/email | R-1, D-1 | done |
| 26 | R-3 | Build email.sh wrapper: mailbox creation (Stalwart REST API) | packages/email | R-2 | done |
| 27 | R-4 | Build email.sh wrapper: JMAP auth bridge + session bootstrap (Basic auth, no OAuth) | packages/email | R-3 | done |
| 28 | R-5 | Build email.sh wrapper: read messages (JMAP Email/query + Email/get) | packages/email | R-4 | done |
| 29 | R-6 | Build email.sh wrapper: send messages (JMAP EmailSubmission/set) — receive-only first | packages/email | R-4 | done |
| 30 | R-7 | Build email.sh wrapper: incoming mail webhooks (Stalwart MTA Hooks) | packages/email | R-2 | done |
| 31 | R-8 | Build email.sh wrapper: mailbox TTL/expiry manager | packages/email | R-3 | done |
| 32 | R-9 | Build email.sh wrapper: custom domain support | packages/email | R-2, D-1 | done |
| 33 | R-11 | Write local smoke test: vitest integration test against live Stalwart (create mailbox → send → read → webhook) | packages/email | R-6 | done |
| 33 | R-12 | Run R-11 smoke test: SSH tunnel to Stalwart, execute test:smoke, verify full flow passes | packages/email | R-11 | done |
| 34 | R-10 | Integrate x402 middleware (all endpoints gated by payment) | packages/email | R-3, P-4 | done |
| 34 | SP-1 | Write spawn.sh spec (Hetzner API wrapping, VM lifecycle, pricing) | specs/ | — | done |
| 35 | SP-2 | Build spawn.sh: VM provisioning via Hetzner Cloud API | spawn/ | SP-1 | done |
| 36 | SP-3 | Build spawn.sh: VM lifecycle (start, stop, destroy, resize) | spawn/ | SP-2 | done |
| 37 | SP-4 | Build spawn.sh: SSH key injection + initial setup | spawn/ | SP-2 | done |
| 38 | SP-5 | Integrate x402 middleware | spawn/ | SP-2, P-4 | done |
| 39 | B-1 | Batch 1: parallel agent team execution (W-2 + R-1 + SP-1) | cross-cutting | W-2 plan, R-1 plan, SP-1 plan | done |
| 40 | SP-6 | Abstract provider layer + multi-cloud support (DO, AWS, GCP, Hetzner) | spawn/ | SP-4 | done |
| 41 | SP-7 | DigitalOcean provider implementation + set as default | spawn/ | SP-6 | done |
| 1 | ST-1 | Build store.sh: bucket CRUD via Cloudflare R2 API (create, list, get, delete; ownership; SQLite) | packages/store | P-4 | done |
| 2 | ST-2 | Build store.sh: object CRUD via S3-compatible API (put, get, delete, list within owned buckets) | packages/store | ST-1 | done |
| 3 | ST-3 | Build store.sh: storage quota + usage tracking (per-bucket limits, metering) | packages/store | ST-1 | done |
| 4 | ST-4 | Integrate x402 middleware for store.sh | packages/store | ST-1, P-4 | done |
| 5 | TK-1 | Build token.sh: scaffold + deploy + query (package, db, deployer keystore, factory ABI, CREATE2, service, routes, tests) | packages/token | P-4 | done |
| 6 | TK-2 | Build token.sh: mint + supply (POST /mint, GET /supply, ownership + cap enforcement, tests) | packages/token | TK-1 | done |
| 7 | TK-4 | OZ + viem deployContract: compile AgentToken.sol, replace factory, fix TS bugs (stale cap, missing receipt), Base Sepolia smoke test | packages/token | TK-2 | done |
| 8 | TK-3 | Build token.sh: Uniswap pool creation (liquidity coordination with wallet.sh) | packages/token | TK-4 | done |
| 8 | ST-5 | Testnet integration testing: env-configurable network (`PRIM_NETWORK`), Base Sepolia x402 end-to-end, wallet.sh ↔ store.sh | cross-cutting | ST-4, W-5 | done |
| 8 | SP-8 | spawn.sh live smoke test against DigitalOcean (provider-direct, 9 tests) | packages/spawn | SP-7 | done |
| 8 | SP-9 | spawn.sh x402 integration: add spawn to cross-primitive integration test, fix SSH key ID resolution bug, fix hardcoded mainnet | scripts/, packages/spawn | SP-7, ST-5 | done |
| 7 | X4-1 | Investigate x402 facilitator "Settlement failed" on Base Sepolia — intermittent on-chain settlement failures block testnet testing | cross-cutting | ST-5 | done |
| 8 | X4-2 | Add retry logic to `createPrimFetch` for facilitator `transaction_failed` responses (single retry with backoff) | packages/x402-client | X4-1 | done |
| 9 | TK-5 | token.sh live smoke test: deploy ERC-20 + create Uniswap V3 pool on Base Sepolia via x402 payment | packages/token | TK-3 | done |
| 9 | TK-6 | Fix mint ownership bug: `mintTokens()` signs with deployer key but `Ownable(owner_)` is set to agent wallet — on-chain mint reverts | packages/token | TK-2 | done |
| 9 | TK-7 | `prim token` CLI subcommand: deploy, list, get, mint, pool commands using keystore + x402-client | packages/keystore | TK-3, KS-1 | pending |
| 9 | R-13 | Fix outbound email delivery: check Stalwart SMTP logs, unblock DO port 25 (or request removal), verify SPF/DKIM/rDNS, confirm delivery to external address | deploy/email | R-12 | done |
| 9 | W-10 | Non-custodial refactor: strip keystore, EIP-191 signature registration, remove send/swap, publish `@prim/x402-client` | specs/, packages/wallet, packages/x402-client | W-5 | done |
| 10 | XC-1 | Build @prim/x402-client: agent-side x402 fetch wrapper (privateKey + signer modes) | packages/x402-client | — | done |
| 11 | FC-1 | Build faucet.sh: Circle USDC drip + treasury ETH drip (testnet only) | packages/faucet | — | done |
| 12 | R-14 | Custom usernames, permanent mailboxes, rename relay → email | packages/email, site/, specs/ | R-11 | done |
| 13 | KS-1 | Build @prim/keystore: local key storage (~/.prim/keys/) + CLI + x402-client integration | packages/keystore, packages/x402-client | XC-1 | done |
| 14 | ST-6 | `prim store` CLI: add store subcommands to prim binary (create-bucket, ls, put, get, rm, rm-bucket, quota) using keystore + x402-client | packages/keystore | KS-1, ST-2 | done |
| 15 | ST-7 | Build store.sh: presigned URLs (GET + PUT) — time-limited signed R2 URLs for direct agent access, bypassing the service for large files | packages/store | ST-2 | pending |
| 15 | ST-8 | Build store.sh: public buckets — per-bucket public-read flag, stable object URLs served directly from R2 | packages/store | ST-1 | pending |
| 15 | ST-9 | Build store.sh: multipart upload — S3 multipart API (initiate, upload-part, complete, abort) for objects >5MB | packages/store | ST-2 | pending |
| 15 | ST-10 | Build store.sh: object copy — copy object within or between owned buckets (same wallet) | packages/store | ST-2 | pending |
| 15 | ST-11 | Build store.sh: lifecycle rules — per-bucket auto-expiry policies (max age in days, max object count, optional min-size floor) | packages/store | ST-3 | pending |
| 15 | ST-12 | Build store.sh: bucket event webhooks — HMAC-signed callbacks on object create/delete, retry queue, same pattern as email.sh R-7 | packages/store | ST-2 | pending |
| 15 | ST-13 | Build store.sh: object metadata + tagging — custom key-value metadata on put, returned on get, tag-based filtering on list | packages/store | ST-2 | pending |
| 15 | SE-1 | Build search.sh: web search, news search, extract via Tavily (stateless proxy, x402 gated) | packages/search | — | done |
| 15 | SE-2 | search.sh live smoke test: real Tavily API calls (web search + news + extract), same pattern as SP-8 | packages/search | SE-1 | done |
| 15 | P-6 | `prim` binary publishing + install scripts: `bun build --compile`, host binary, `curl prim.sh/install \| sh`, per-primitive install wrappers | packages/keystore, site/ | ST-6 | pending (→ L-11/L-12) |
| 16 | E-1 | Set PTR record for mail server IP ([STALWART_HOST] → mail.relay.prim.sh) | deploy/email | — | done |
| 17 | E-2 | Downgrade DMARC to `p=none` temporarily while domain reputation is zero | Cloudflare DNS | — | done |
| 18 | E-3 | Register relay.prim.sh with Google Postmaster Tools (DNS TXT verification) | Cloudflare DNS, Google | E-1 | done |
| 19 | E-4 | Domain warmup: send low-volume emails to engaged recipients, ramp over weeks | deploy/email | E-2, E-3 | pending |
| 20 | E-5 | Verify Gmail inbox delivery (not spam) after warmup + PTR + DMARC changes | deploy/email | E-4 | pending |
| 21 | E-6 | Verify Apple Mail / iCloud delivery after warmup | deploy/email | E-4 | pending |
| 22 | E-7 | Upgrade DMARC back to `p=quarantine` once inbox delivery is consistent | Cloudflare DNS | E-5, E-6 | pending |
| 23 | E-8 | Migrate mail domain from `relay.prim.sh` → `email.prim.sh`: DNS (A, MX, SPF, DMARC, DKIM x2, Google verification), Stalwart domain principal + DKIM keys, PTR update, ACME TLS, re-register Postmaster Tools. Keep relay.prim.sh records alive temporarily. Flip `EMAIL_DEFAULT_DOMAIN` env var. | deploy/email, Cloudflare DNS, Stalwart, DO | E-1, E-2, E-3 | done |
| 23 | M-1 | Build mem.sh: vector memory (Qdrant collections + upsert + query) + KV cache + x402 | packages/mem | — | done |
| 9 | M-2 | mem.sh live smoke test: create collection → upsert docs → query → cache set/get/delete on Base Sepolia via x402 payment | packages/mem | M-1 | done |
| 14 | M-3 | `prim mem` CLI subcommand: create-collection, list-collections, upsert, query, cache-set, cache-get, cache-del using keystore + x402-client | packages/keystore | M-1, KS-1 | pending |
| 14 | R-15 | `prim email` CLI: mailbox CRUD, message inbox/read/send, webhook and domain management using keystore + x402-client | packages/keystore | R-6, KS-1 | done |

## Plan Docs

- P-1: `tasks/completed/p-1-llms-txt-catalog-2026-02-24.md`
- P-4: `tasks/active/p-4-x402-hono-middleware-2026-02-24.md`
- W-1: `tasks/completed/w-1-wallet-api-surface-2026-02-24.md`
- W-2: `tasks/completed/w-2-wallet-creation-2026-02-24.md`
- R-1: `tasks/completed/r-1-stalwart-docker-deploy-2026-02-24.md`
- SP-1: `tasks/completed/sp-1-spawn-spec-2026-02-24.md`
- B-1: `tasks/completed/b-1-batch-1-team-execution-2026-02-24.md`
- W-3: `tasks/completed/w-3-balance-queries-2026-02-24.md`
- W-4: `tasks/completed/w-4-send-usdc-2026-02-24.md`
- W-5: `tasks/completed/w-5-x402-client-2026-02-24.md`
- SP-2: `tasks/completed/sp-2-vm-provisioning-2026-02-24.md`
- W-6: `tasks/completed/w-6-funding-request-2026-02-24.md`
- W-7: `tasks/completed/w-7-policy-engine-2026-02-24.md`
- W-8: `tasks/completed/w-8-execution-journal-2026-02-24.md`
- W-9: `tasks/completed/w-9-circuit-breaker-2026-02-24.md`
- SP-3/SP-4: `tasks/completed/sp-3-sp-4-lifecycle-ssh-2026-02-24.md`
- D-1: `tasks/completed/d-1-dns-zone-record-crud-2026-02-24.md`
- SP-6: `tasks/completed/sp-6-provider-abstraction-2026-02-24.md`
- R-2: `tasks/completed/r-2-stalwart-domain-tls-2026-02-24.md`
- R-3: `tasks/completed/r-3-mailbox-creation-stalwart-rest.md`
- R-4: `tasks/completed/r-4-jmap-auth-session-bootstrap.md`
- D-2: `tasks/completed/d-2-domain-sh-rename-search-2026-02-25.md`
- D-3→D-8: see same file (comprehensive plan covers all phases)
- D-3: `tasks/active/d-3-domain-registration-2026-02-25.md`
- D-6: `tasks/active/d-6-verification-endpoint-2026-02-25.md`
- D-7: `tasks/active/d-7-auto-configure-ns-2026-02-25.md`
- ST-1: `tasks/completed/st-1-bucket-crud-cloudflare-r2.md`
- R-5: `tasks/completed/r-5-read-messages-jmap-2026-02-25.md`
- ST-4: `tasks/completed/st-4-x402-middleware-store.md`
- R-6: `tasks/completed/r-6-send-messages-jmap-2026-02-25.md`
- R-7: `tasks/completed/r-7-incoming-webhooks-mta-hooks.md`
- R-9: `tasks/completed/r-9-custom-domain-support.md`
- R-8: `tasks/completed/r-8-mailbox-ttl-expiry.md`
- R-10: `tasks/completed/r-10-x402-middleware-email.md`
- ST-3: `tasks/completed/st-3-storage-quota-usage.md`
- TK-1/TK-2: implemented directly (no plan doc — plan provided in prompt)
- TK-4: `tasks/active/tk-4-factory-contract-testnet.md`
- W-10/XC-1/FC-1: ADR at `specs/adr-wallet-custody.md`, implemented directly (no plan doc — plan provided in prompt)
- ST-5: `tasks/completed/st-5-testnet-integration-testing.md`
- R-11: `tasks/completed/r-11-local-smoke-test.md`
- R-14: plan provided in prompt (no plan doc)
- KS-1: `~/.claude/plans/fancy-hugging-breeze.md`
- Umbrella: `tasks/active/batch-execution-umbrella-2026-02-24.md`
- ST-6: `tasks/active/st-6-prim-store-cli-2026-02-25.md`
- SE-1: `tasks/completed/se-1-search-sh-plan-2026-02-25.md`
- SE-2: `tasks/completed/se-2-search-live-smoke-test-2026-02-25.md`
- D-9: `tasks/active/d-9-domain-live-smoke-test-2026-02-25.md`
- TK-6: `tasks/active/tk-6-mint-ownership-bug-2026-02-25.md`
- M-1: `tasks/completed/m-1-mem-sh-vector-cache-2026-02-25.md`
- M-2: `tasks/active/m-2-mem-live-smoke-test-2026-02-25.md`
- E-8: `tasks/active/e-8-email-domain-migration-2026-02-25.md`
- L-31: `tasks/active/l-31-deploy-access-invite-flow-2026-02-26.md`
- L-33: `tasks/active/l-33-fix-scrypt-openssl-crash-2026-02-26.md`
- L-36: `tasks/active/l-36-launch-readiness-smoke-test-2026-02-26.md`
- X4-2: `tasks/active/x4-2-x402-client-retry-2026-02-25.md`
- L-35: `tasks/active/l-35-access-request-e2e-test-2026-02-25.md`
- Wave 5.5 (L-62→L-67): `tasks/active/wave-5.5-agent-interface-layer-2026-02-26.md`
- L-48/L-49: covered by v1 launch plan update (search deploy)
- V1 Launch: `tasks/active/v1-launch-plan-2026-02-25.md`

## V1 Launch (scope: L)

Plan doc: `tasks/active/v1-launch-plan-2026-02-25.md`

### Wave 0: Cleanup (blocks everything)

| ID | Task | Owner | Depends on | Status |
|---|---|---|---|---|
| L-1 | Redact secrets from TASKS.md + task files (Stalwart creds, server IP) | Claude | — | done |
| L-2 | Rename all packages `@agentstack/*` + `@prim/*` → `@primsh/*` (12 packages + all imports) | Claude | — | done |
| L-3 | Audit .gitignore + CLAUDE.md for public readiness | Claude | — | done |

### Wave 1: Foundation

| ID | Task | Owner | Depends on | Status |
|---|---|---|---|---|
| L-4 | Create GitHub org `useprim` + repo `prim.sh` (private), push clean code | Garric | L-1, L-2 | done |
| L-5 | Register `@primsh` npm org | Garric | — | done |
| L-6 | Write GitHub Actions CI workflow (`.github/workflows/ci.yml` + `release.yml`) | Claude | L-4 | done |
| L-7 | Provision DigitalOcean VPS for Core 4 services (`prim-core`, 157.230.187.207, s-1vcpu-2gb, nyc1) | Claude | — | done |
| L-8 | Write deploy scripts: systemd services + Caddyfile + setup.sh | Claude | — | done |
| L-9 | Wire DNS A records (`*.prim.sh` → VPS) + set env vars on VPS | Claude | L-7 | done |

### Wave 2: Go Live

| ID | Task | Owner | Depends on | Status |
|---|---|---|---|---|
| L-10 | Deploy Core 4 to VPS + run integration smoke test against live endpoints | Claude + Garric | L-8, L-9 | done |
| L-13 | Deploy landing site (`site/`) to Cloudflare Pages, wire `prim.sh` root domain | Garric + Claude | L-4 | done |
| L-16 | Wallet allowlist: x402-middleware rejects wallets not in allowlist; env-configurable `PRIM_ALLOWLIST` (comma-separated addresses), skip if unset | Claude | L-10 | done |
| L-17 | Invite codes on wallet.prim.sh: `POST /v1/invites` (allowlisted wallet generates code), `POST /v1/invites/redeem` (new wallet + code → auto-added to allowlist). Viral loop. SQLite table. | Claude | L-16 | done (→ L-31, implemented as CF Worker) |
| L-18 | Default storage caps: per-wallet bucket limit (10), default per-bucket quota (100MB), per-wallet total storage cap (1GB). Reject uploads/creates above limits | Claude | L-10 | done |
| L-19 | Spawn per-wallet caps: max 3 concurrent servers per wallet, max `small` type only during beta. Reject creates above limits | Claude | L-10 | done |
| L-20 | Persist faucet rate limiter to SQLite (currently in-memory, lost on restart) | Claude | L-10 | done |
| L-21 | Redeploy VPS after L-16 through L-20 + re-run smoke test | Claude | L-16, L-18, L-19, L-20 | done |

### Wave 3: Access + Bugs

| ID | Task | Owner | Depends on | Status |
|---|---|---|---|---|
| L-23 | Agent-friendly 403: include `access_url` + actionable message in allowlist denial response | Claude | L-16 | done |
| L-24 | Access request endpoint: `POST /v1/access/request` on wallet.sh — agent submits wallet address, stored in SQLite queue for review. `GET /v1/access/requests` (admin) to list pending. `POST /v1/access/requests/:id/approve` adds to allowlist | Claude | L-23 | done (→ L-31, implemented as CF Worker) |
| L-31 | Deploy access request + invite flow: CF Worker (`workers/platform/`) to Cloudflare at `api.prim.sh`, VPS wallet internal endpoints (`/internal/allowlist/*`), `PRIM_INTERNAL_KEY` shared secret, D1 database, dynamic SQLite allowlist on wallet service, seed existing wallets, verify full flow | Claude + Garric | L-17, L-24 | done (access request submitted + approved in Asher test) |
| L-28 | Agent feedback endpoint: `POST /api/feedback` on api.prim.sh — agent submits `{ type: "bug\|feature\|pain_point", title, body, wallet }`, creates GitHub Issue via API (labeled by type + `agent-reported`). Requires registered wallet. Validates type, checks allowlist via VPS internal API. | Claude | L-24 | done |
| L-30 | Update llms.txt to document feedback endpoint and access request flow so agents discover them from the catalog | Claude | L-24, L-28 | done (access request + CLI getting started documented) |
| L-32 | Faucet treasury fallback: when Circle API rate-limits (429), fall back to direct USDC transfer from pre-funded treasury wallet. Deployed + treasury funded with Sepolia ETH for gas. | Claude | FC-1 | done |
| L-33 | Fix `prim wallet create` OpenSSL scrypt memory limit crash (Bun + node crypto compat issue) | Claude | KS-1 | done |
| L-34 | Fix CLI `--flag value` parsing: `getFlag` only accepts `--flag=value` syntax, not `--flag value` with space. Usage hints should match actual behavior. | Claude | KS-1 | done |
| L-61 | Dynamic allowlist: all services query wallet.sh's allowlist via internal API instead of static `PRIM_ALLOWLIST` env var. Currently access approval only updates wallet.sh's SQLite — every other service (store, spawn, search, faucet) has its own static env var list that requires manual edit + restart. Use `checkAllowlist` callback in x402-middleware to call `GET /internal/allowlist/check?address=X` on wallet.sh | Claude | L-31 | pending |
| L-36 | Launch readiness smoke test: full Asher run with fresh wallet through CLI — `prim wallet create` → `prim faucet usdc` → `prim store create-bucket` → `prim store put` → `prim store get`. All steps must succeed without hand-written code. | Claude + Garric | L-33, L-34 | done (script: scripts/smoke-cli.ts — run from VPS) |

### Wave 4: Binary + Mainnet (critical path to launch)

| ID | Task | Owner | Depends on | Status |
|---|---|---|---|---|
| L-11 | Compile `prim` binary for 4 platforms (`bun build --compile`) + upload to GitHub Release | Claude | L-4 | done |
| L-12 | Write install script (`curl prim.sh \| sh`) + per-primitive wrappers | Claude | L-11 | done |
| L-48 | Deploy search.sh to VPS: systemd unit (prim-search:3005), Caddy route (search.prim.sh), DNS A record, `TAVILY_API_KEY` env var, smoke test live endpoint | Claude + Garric | SE-1, L-10 | done |
| L-49 | Update llms.txt: move search.sh from "Built (not yet deployed)" to "Live primitives" section after L-48 deploy is verified | Claude | L-48 | done |
| L-22 | Mainnet switchover: update VPS env files from `eip155:84532` → `eip155:8453`, set prod `PRIM_PAY_TO` treasury, fund facilitator with mainnet USDC | Garric | L-17 | pending |
| L-15 | Pre-public checklist: rotate Stalwart admin password + `relay-wrapper` API key, verify no secrets in git history (`git log -p \| grep`), confirm .env files gitignored | Garric | L-10 | pending |

### Wave 5: Community + Polish

| ID | Task | Owner | Depends on | Status |
|---|---|---|---|---|
| L-25 | Access landing page: `prim.sh/access` — human-readable form + documents the API. Agents call API directly, humans use the form | Claude | L-31 | done |
| L-44 | Access form: add optional X handle + GitHub handle fields. Store in D1 `access_requests` table (new `handle` column). Pass through to admin list view. Helps vet requesters during private beta growth | Claude | L-25 | pending |
| L-45 | Wallet ping on access approval: when admin approves a request, send a tiny USDC transfer (e.g. $0.001) to the wallet with calldata `prim.sh:access:approved:<request_id>` (hex-encoded). Agent verifies by checking `from == Prim treasury address` (published in llms.txt) + calldata prefix. Add treasury address to llms.txt as canonical discovery point | Claude | L-44 | pending |
| L-46 | Per-page hero color variation: each primitive page's hero glow already uses the page accent color. Extend to all pages consistently (accent-colored radial gradient behind the logo/hero area). Part of L-43 cleanup | Claude | L-43 | pending |
| L-47 | Clean up API URL redundancy: `api.prim.sh/api/*` has "api" twice. Restructure CF Worker routes to `api.prim.sh/*` (drop `/api` prefix). Update all docs, llms.txt, access page, and any hardcoded references. Breaking change — coordinate with L-22 mainnet switchover | Claude | L-22 | pending |
| L-26 | Community setup: create Discord server, prepare repo for public (`CONTRIBUTING.md`, issue templates, `LICENSE`), set up GitHub Discussions | Garric + Claude | — | done (repo files written; Discord creation manual) |
| L-29 | GH Action: auto-dedupe issues + PRs. On new issue: fuzzy-match title against open issues, label + link duplicates. On stale (30d no activity): auto-close with comment. On bot PRs: auto-merge if CI passes. | Claude | L-26 | pending |
| L-35 | Agent access request e2e test: fresh wallet → register → hit paid endpoint → get 403 → agent discovers `access_url` → POSTs access request → admin approves → agent retries → success. Verify the full autonomous flow. | Claude + Garric | L-31 | done |
| L-37 | Finalize brand assets: pick final logo/favicon/banner/heroes from candidates in `brand/assets/`, export favicon to `.ico`/32x32/16x16, crop banner to 1500x500, name finals as `final-*` | Garric | — | done (finals named in `brand/assets/final-*`) |
| L-38 | Set brand assets on platforms: GitHub org avatar + repo social preview, X profile pic + banner (@onprim), Discord server icon. Use finals from L-37 | Garric | L-37, L-54 | pending |
| L-54 | Create Discord server: name "Prim", set icon to `final-logo.jpg`, create channels (#general, #bugs, #feature-requests, #announcements), generate permanent invite link | Garric | L-37 | pending |
| L-55 | Upload `final-logo.jpg` as GitHub org avatar (primsh settings), X @onprim profile pic, Discord server icon | Garric | L-37, L-54 | pending |
| L-56 | Upload `final-x-banner.jpg` as X @onprim header image | Garric | L-37 | pending |
| L-57 | Upload `final-social-preview.jpg` as GitHub repo social preview (primsh/prim.sh → Settings → Social preview) | Garric | L-37 | pending |
| L-58 | Set up contact email for legal pages. `hello@prim.sh` mailbox on Stalwart. DNS: MX, SPF, DKIM (RSA+Ed25519), DMARC for root `prim.sh` | Claude | L-40 | done |
| L-59 | Update Discord invite link: replace placeholder `discord.gg/prim` in `README.md` and `.github/ISSUE_TEMPLATE/config.yml` with real invite URL | Claude | L-54 | done |
| L-39 | Write public README.md: hero image, name + tagline, one-liner, "Getting started" (wallet → faucet → first API call), primitive table with status, link to `prim.sh/llms.txt`. Should read like the site but for devs scrolling GitHub | Claude | L-37 | done |
| L-40 | Legal minimum: Terms of Service + Privacy Policy pages. Even minimal/template versions — required before public launch. Host at `prim.sh/terms` and `prim.sh/privacy` | Garric + Claude | — | done |
| L-41 | Human docs: `prim.sh/docs` getting-started guide for humans. Complements `llms.txt` (for agents). Wallet setup, faucet, first API call, per-primitive examples | Claude | L-39 | pending |
| L-42 | Draft X launch content: tweet copy for each teaser image (closer, prims grid, logo), launch thread script (what Prim is → why → demo → CTA), pin strategy | Garric + Claude | L-37 | pending |
| L-43 | Update `site/agentstack/` → `site/prim/` or set as canonical landing page. Current homepage still references "agentstack" in directory name. Clean up stale placeholder links in primitive landing pages | Claude | — | done (26 pages updated; directory rename deferred — symlink works for CF Pages) |

### Backlog (unscoped)

| ID | Task | Owner | Depends on | Status |
|---|---|---|---|---|
| L-50 | deploy.sh: PaaS prim above spawn.sh — push a container or repo URL, get a live endpoint. No server config. Wraps Dokku, Coolify, or similar self-hosted PaaS. Agent-native deploy pipeline. | Claude | — | backlog |
| L-60 | Pricing audit: review x402 pricing across all primitives against real provider costs. Key risks: spawn.sh ($0.01 create vs $4/mo DO cost), token.sh ($1 deploy vs $10-50 mainnet gas). Consider recurring billing model for spawn, gas passthrough for token, margin analysis for store/email/search | Claude + Garric | L-22 | pending |

### Wave 5.5: Agent Interface Layer (blocks public launch)

All live primitives (wallet, store, spawn, faucet, search) need proper agent interfaces. Currently agents must read a 90-line llms.txt brochure and write custom HTTP scripts (see: Asher test failure). Industry standard: OpenAPI spec → auto-generate MCP server + full docs.

| ID | Task | Owner | Depends on | Status |
|---|---|---|---|---|
| L-62 | Write OpenAPI specs for all 5 live primitives (wallet, store, spawn, faucet, search). Full endpoint docs: request/response shapes, error codes, x402 payment flow, curl examples. Source of truth for all generated interfaces | Claude | — | pending |
| L-63 | Rewrite llms.txt as full plain-text API reference (xAI-style, not brochure). Every endpoint, every field, every error code. Per-primitive llms.txt files too. Should be enough for an agent to use the API without any other docs | Claude | L-62 | pending |
| L-64 | Generate MCP servers from OpenAPI specs: one MCP server per primitive (or unified). x402 payment signing baked in. Agent calls `store_create_bucket` as a tool, MCP server handles auth. Evaluate Stainless / openapi-mcp-codegen / FastMCP | Claude | L-62 | pending |
| L-65 | Write Skills (markdown + YAML) per primitive: workflow knowledge, when/why to use each prim, error handling patterns, multi-prim workflows (e.g. "register wallet → fund → create bucket") | Claude | L-62 | pending |
| L-66 | Package as Plugins: bundle MCP server + Skill per primitive into installable plugin. `prim install store` drops MCP config + skill into agent's environment | Claude | L-64, L-65 | pending |
| L-67 | Extend CLI to all live prims: `prim search`, `prim spawn`, `prim email` subcommands (generated or hand-written from OpenAPI specs) | Claude | L-62 | pending |
| L-68 | Deploy email.sh to VPS — systemd unit, Caddy route, setup/deploy scripts, smoke test | Garric | — | done |

### Wave 6: Token + Public

| ID | Task | Owner | Depends on | Status |
|---|---|---|---|---|
| L-27 | Register $PRIM ticker defensively on BaseScan ASAP (before repo goes public). Deploy token contract early, pool later | Garric | — | pending |
| L-14 | Full token launch: create Uniswap pool, fund liquidity, make repo public, announce | Garric + Claude | L-15, L-26, L-27, L-37, L-39, L-40 | pending |

## Backlog — Future Primitives

| Primitive | Wraps | Notes |
|-----------|-------|-------|
| store.sh | Hetzner Object Storage or Cloudflare R2 | S3-compatible API |
| vault.sh | HashiCorp Vault or custom (Stalwart-style encrypted store) | |
| domain.sh (was dns.sh) | Cloudflare DNS + registrar APIs | **Promoted to active tasks (D-1 through D-7). Expanding from DNS-only to full domain lifecycle.** |
| cron.sh | Custom (lightweight job scheduler) | |
| pipe.sh | NATS or Redis Streams | |
| code.sh | E2B or Firecracker | Sandboxed execution |
| ring.sh | Telnyx API | Regulatory prep needed |
| mem.sh | Qdrant or Pgvector | **Promoted to active tasks (M-1 through M-N). Core impl (collections + upsert + query + KV cache) done.** |
| infer.sh | OpenRouter or direct provider APIs | |
| seek.sh | Brave Search API or SearXNG | |
| browse.sh | Playwright or Browserbase | |
| auth.sh | Custom OAuth broker (builds on vault.sh) | |
| watch.sh | OpenTelemetry collector | |
| trace.sh | OpenTelemetry + Jaeger | Platform-level concern |
| docs.sh | Custom OpenAPI→MCP converter | |
| id.sh | Custom (on-chain reputation) | Needs ecosystem first |
| pins.sh | Google Places API or Overture Maps | |
| hive.sh | A2A protocol (Google/Linux Foundation) | Agent discovery + collaboration via A2A agent cards, JSON-RPC 2.0, SSE. Wrap the standard, don't reinvent. Interop with Azure AI Foundry, Google agents |
| ads.sh | Custom | Needs ecosystem first |
| skills.sh | Custom marketplace + registry | Buy/sell agent skills (versioned manifests, trust/reputation, x402 billing). Start private-curated first |
| mart.sh | Amazon/eBay API proxy | Heavy regulatory |
| ship.sh | EasyPost or Shippo | |
| hands.sh | Custom gig platform | Heaviest regulatory burden |
| pay.sh | Stripe + x402 bridge | Fiat payment bridge |
| borrow.sh | Custom (on-chain escrow + interest) | Agent-to-agent USDC lending. Needs wallet.sh + id.sh |
| guard.sh | Custom + sentinel patterns | Two tiers: passive layer baked into x402-middleware (all primitives auto-scan requests/responses), active primitive for deep paid analysis. Needs ecosystem first |
| trade.sh | Broker APIs + Polymarket | Trad market + prediction market trading for agents. Needs wallet.sh |
| insure.sh | Custom (actuarial + escrow) | Agent operation insurance, refund guarantees, SLA escrow. Needs wallet.sh + watch.sh + id.sh |
| know.sh | Custom (knowledge graph service) | Structured canonical knowledge (not vector search). Typed entities, relationships, definitions. Finknow is the finance vertical proof of concept. Distinct from mem.sh (personal memory) |
| props.sh | ATTOM Data, Zillow/Redfin APIs, or Realtor.com API | Real estate data: listings, comps, valuations, property details. MLS direct access requires NAR licensing — API aggregators are the realistic path |
| mktdata.sh | Polygon.io, Unusual Whales, or similar | Market data: equities/options/crypto price feeds, historical OHLCV, options chains, earnings calendars. High-frequency micropayment revenue from research agents |
| corp.sh | Stripe Atlas API or custom | Legal complexity |

## Research Notes

### AP2 vs x402 (2026-02-24, updated 2026-02-24)
Google's Agent Payments Protocol (AP2) extends A2A+MCP for agent payments. Google + Coinbase + MetaMask + Ethereum Foundation collaborated on the [A2A x402 extension](https://github.com/google-agentic-commerce/a2a-x402), which adds crypto payments to A2A.

**Resolved questions:**
- AP2 is fiat-native (Mandates: Intent, Cart, Payment). x402 is crypto-native (EIP-3009 on Base). They are complementary, not competitive.
- The A2A x402 extension adds crypto to A2A — it is *not* dual-protocol middleware. No reference implementation exists for a single endpoint accepting both AP2 fiat and x402 crypto. If we want dual-rail, we build it ourselves.
- Facilitator centralization concern is overstated — ecosystem now includes PayAI, Meridian, x402.rs (open-source Rust), 1Shot API, Mogami. The [x402 Foundation](https://blog.cloudflare.com/x402/) (Cloudflare + Coinbase) exists to prevent single-provider lock-in.

**Action:** AP2 dual-protocol is premature. Don't build it now. Track the spec; revisit when AP2 has production adoption beyond Google.

### x402 execution layer for wallet.sh (2026-02-24)
x402 uses [EIP-3009 (Transfer With Authorization)](https://github.com/coinbase/x402/blob/main/specs/schemes/exact/scheme_exact_evm.md) for gasless USDC transfers. Agent signs an off-chain `transferWithAuthorization` message; facilitator broadcasts on-chain and pays gas. Facilitator cannot modify amount or destination.

**ERC-4337 vs EIP-7702 for guardrails:**
- ERC-4337 (full Account Abstraction) provides session keys, spend caps, and programmable validation via smart contract wallets. Heavy — requires deploying smart accounts, bundlers, paymasters.
- [EIP-7702](https://www.alchemy.com/blog/eip-7702-ethereum-pectra-hardfork) (live since Pectra, May 2025) lets EOAs temporarily delegate to smart contract code per-transaction. Gets session keys + spend caps *without* full AA overhead. Likely the better path for wallet.sh: keep EOA keys, delegate to a policy contract when needed.
- x402's EIP-3009 flow makes ERC-4337's execution layer (bundlers/paymasters) unnecessary for the payment itself, but on-chain guardrails are still needed if an agent key is compromised.

**High-frequency micropayments:**
[Cloudflare's deferred payment scheme](https://blog.cloudflare.com/x402/) decouples cryptographic handshake from settlement — aggregates multiple payments into periodic batch settlements. Directly solves the sub-cent high-frequency problem without touching the wallet layer. Track this for wallet.sh's customer-facing story.

**Recommended wallet.sh architecture:**

| Layer | What | Why |
|-------|------|-----|
| Execution | x402 + EIP-3009 | Gasless per-request micropayments, proven |
| Batching | Cloudflare deferred scheme | High-frequency agents settle periodically, not per-call |
| Guardrails | EIP-7702 delegation | Session keys + spend caps without full AA overhead |
| Future | AP2 interop | Watch the spec; don't build now |

### spawn.sh provider abstraction (2026-02-24)

**Problem:** spawn.sh currently wraps Hetzner Cloud directly. Hetzner's TOS §5 prohibits reselling services without written consent. spawn.sh is literally reselling compute via API — this is a compliance risk that could result in account termination.

**Decision:** Abstract the provider layer. spawn.sh should define a `CloudProvider` interface (createServer, deleteServer, start, stop, reboot, resize, rebuild, SSH key CRUD) and implement it per provider. The service layer, DB, ownership model, routes, and x402 pricing stay provider-agnostic.

**Provider comparison:**

| Factor | Hetzner | AWS | GCP | Azure |
|--------|---------|-----|-----|-------|
| Reseller TOS | Prohibits without agreement | Explicit partner/MSP programs | Partner programs | CSP program |
| Comparable instance | CX23 ~$4.50/mo | t4g.nano ~$3/mo (ARM) | e2-micro ~$7/mo | B1ls ~$4/mo |
| API maturity | Simple, limited | Very mature | Mature | Mature |
| Geographic coverage | EU + US (limited) | Global | Global | Global |
| Legal risk | High (no reseller agreement) | Low | Low | Low |

**Plan:**
1. SP-6: Extract `CloudProvider` interface from current `hetzner.ts`, keep Hetzner as one implementation
2. Add DigitalOcean provider as launch provider (clearest reseller program, Partner Pod 5-25% discount, $4/mo Droplets)
3. Agent chooses provider at server creation time (`provider: "digitalocean" | "hetzner" | "aws"`)
4. Pricing varies by provider (pass-through cost + margin)

**Action:** SP-6 added to task list. Decide launch provider after comparing real instance pricing and signup friction. Hetzner code is not wasted — it becomes one provider behind the interface.

### Provider strategy — two-provider model (2026-02-24)

Cloudflare (DNS + R2 storage) and DigitalOcean (compute). Full ADR: `specs/provider-strategy.md`

### Project rename: AgentStack → Prim (2026-02-25)

"AgentStack" name is taken (existing open-source AI agent framework, Teradata product). Registered `prim.sh` — "primitive shell." Each primitive is a subdomain: `relay.prim.sh`, `wallet.prim.sh`, `spawn.prim.sh`, `domain.prim.sh`.

- **Domain:** `prim.sh` via Namecheap ($34.98/yr), DNS on Cloudflare
- **X handle:** `@useprim`
- **Registrar:** Namecheap (no API access until $50 spend — use GUI for now)
- **DNS provider:** Cloudflare (zone ID: `a16698041d45830e33b6f82b6f524e30`)

### Stalwart mail server reference (2026-02-25)

Stalwart runs on DigitalOcean Droplet `[STALWART_HOST]`. Configured for `relay.prim.sh`.

- **Admin access:** SSH tunnel only (`ssh -L 8080:localhost:8080 root@[STALWART_HOST]`), Basic auth `admin:[REDACTED]`
- **API key for wrapper:** Basic auth `relay-wrapper:[REDACTED]`
- **Settings API format:** `POST /api/settings` with body `[{"type":"insert","prefix":null,"values":[["key","value"]],"assert_empty":false}]` or `[{"type":"clear","prefix":"key.prefix."}]`
- **DKIM:** Dual signing (RSA-2048 selector `rsa`, Ed25519 selector `ed`), keys generated via `POST /api/dkim`
- **DNS records:** `GET /api/dns/records/{domain}` returns recommended DNS records
- **Config reload:** `GET /api/reload` (no restart needed)
- **Domain principal:** `POST /api/principal` with `{"type":"domain","name":"relay.prim.sh"}`

### Wallet-first identity upgrade path (2026-02-24)
ERC-8004 uses CAIP-10 wallet addresses as root identity. DIDs layer on top non-breaking: wallet address becomes `verificationMethod` in DID Document, `alsoKnownAs` bridges old→new. No smart contract changes. Current "wallet = identity" design is correct for v1. id.sh adds DID resolution later.

## Done

- SP-5 — x402 middleware already integrated in SP-2 (2026-02-24)
- W-6 — funding request: agent→owner CRUD, approve triggers sendUsdc (2026-02-24)
- W-7 — policy engine: maxPerTx/maxPerDay, daily reset, per-wallet pause/resume (2026-02-24)
- W-8 — execution journal: events, dead letters, tryClaim, history endpoint (2026-02-24)
- W-9 — circuit breaker: global pause/resume by scope, admin routes (2026-02-24)
- SP-3 — VM lifecycle: start/stop/reboot/resize/rebuild (2026-02-24)
- SP-4 — SSH key management: register/list/delete (2026-02-24)
- W-3 — balance queries: live USDC via viem readContract (2026-02-24)
- W-4 — send USDC: ERC-20 transfer, idempotency journal, ownership check (2026-02-24)
- W-5 — x402 client: 402 → sign EIP-3009 → retry wrapper (2026-02-24)
- SP-2 — spawn.sh VM provisioning: Hetzner CRUD, SQLite, x402 (2026-02-24)
- B-1 — Wave 1 agent team execution: W-2, R-1, SP-1 (2026-02-24)
- SP-1 — spawn.sh spec (2026-02-24)
- R-1 — Stalwart Docker Compose + deployment docs (2026-02-24)
- W-2 — wallet creation: keypair, keystore, SQLite (2026-02-24)
- P-2 — llms.txt routes wired in `site/serve.py` (2026-02-24)
- P-1 — llms.txt root + per-primitive files (2026-02-24)

- D-1 — dns.sh: zone + record CRUD, Cloudflare API, SQLite ownership, 36 tests (2026-02-25)
- D-4 — x402 middleware already integrated in D-1 (2026-02-25)
- SP-6 — provider abstraction: CloudProvider interface, Hetzner implementation, provider registry (2026-02-24)
- S-6 — "This page is for humans. The API is for agents." (2026-02-24)
- R-1 — Stalwart Docker Compose on DigitalOcean Droplet ([STALWART_HOST]) (2026-02-24)
- R-2 — prim.sh domain, Stalwart config, DKIM, SPF, DMARC, ACME TLS, admin lockdown (2026-02-25)
- R-3 — relay.sh mailbox CRUD: Stalwart REST wrapper, SQLite ownership, 24 tests (2026-02-25)
- R-4 — JMAP auth bridge: AES-256-GCM password encryption, session discovery, context provider, 43 tests (2026-02-25)
- R-5 — read messages: JMAP Email/query + Email/get, folder filtering, address flattening, 61 tests (2026-02-25)
- ST-1 — store.sh bucket CRUD: R2 API wrapper, name validation, SQLite ownership, 31 tests (2026-02-25)
- ST-2 — store.sh object CRUD: S3-compatible API via aws4fetch, put/get/delete/list, streaming download, 54 tests (2026-02-25)
- ST-3 — store.sh quota + usage: per-bucket quotas, synchronous enforcement, headObject for overwrite/delete tracking, reconciliation, 78 tests (2026-02-25)
- ST-4 — x402 middleware already integrated in ST-1/ST-2 (2026-02-25)
- TK-1 — token.sh scaffold + deploy + query: factory ABI, CREATE2 salt, AES-256-GCM deployer keystore, SQLite deployments, 58 tests (2026-02-25)
- TK-2 — token.sh mint + supply: mintable/not_mintable/forbidden/exceeds_max_supply decision table, on-chain totalSupply reads, 58 tests (2026-02-25)
- R-7 — relay.sh incoming webhooks: webhook CRUD, HMAC signing, delivery with retry, Stalwart ingest handler, 125 tests (2026-02-25)
- R-9 — relay.sh custom domains: domain registration, DNS verification, Stalwart provisioning (domain principal + DKIM), mailbox creation on custom domains, 148 tests (2026-02-25)
- ST-5 — testnet integration: getNetworkConfig() in x402-middleware, PRIM_NETWORK/PRIM_PAY_TO env vars, wallet+store wired to Sepolia, integration test script, 496 tests pass (2026-02-25)
- R-10 — relay.sh x402 middleware: all 16 paid endpoints gated, health check + ingest webhook free, per-route pricing (2026-02-25)
- R-11 — relay.sh live smoke test: 11 tests against live Stalwart (create → list → get → webhook → send → read → ingest → delete), JMAP over HTTPS tunnel (2026-02-25)
- SP-7 — spawn.sh DigitalOcean provider: CloudProvider impl wrapping DO API v2, image translation, tag-based ownership, default provider switched from Hetzner to DO, 55 tests (2026-02-25)
- W-10 — non-custodial refactor: strip keystore+encrypted_key, EIP-191 signature registration, remove send/swap/history, fund-request approve returns address+amount (non-custodial), ADR at specs/adr-wallet-custody.md, 82 wallet tests (2026-02-25)
- XC-1 — @prim/x402-client: agent-side x402 fetch wrapper, privateKey+signer modes, max payment cap, auto-detect network, 14 tests (2026-02-25)
- FC-1 — faucet.sh: Circle USDC drip + treasury ETH drip, testnet-only guard, in-memory rate limiting, 18 tests (2026-02-25)
- SP-8 — spawn.sh DO live smoke test: 9 tests against real DO API (create/poll/reboot/delete droplet + SSH key CRUD), provider-direct (2026-02-25)
- SP-9 — spawn.sh x402 integration test: end-to-end agent-pays-USDC→server-created on Base Sepolia. Bugs fixed: SSH key ID resolution (internal→provider), spawn hardcoded mainnet→env vars. First cross-primitive proof: wallet+faucet+spawn via x402 payment (2026-02-25)
- R-13 — outbound email delivery confirmed: port 25 open on DO droplet, SPF/DKIM/DMARC pass, Gmail accepted with signed-by+mailed-by relay.prim.sh, TLS (2026-02-25)
- R-14 — custom usernames, permanent mailboxes (null expires_at), rename relay → email across all packages/site/docs, 162 tests (2026-02-25)
- M-1 — mem.sh: Qdrant vector memory (collections + upsert + query) + SQLite KV cache + x402, 96 tests (2026-02-25)
- TK-4 — OZ + viem deployContract: compile AgentToken.sol, AES-256-GCM deployer keystore, Base Sepolia smoke test (2026-02-25)
- TK-3 — token.sh Uniswap V3 pool creation: factory ABI, sqrtPriceX96 BigInt math (address-ordered, decimal-adjusted), full-range ticks, createPool+initialize with crash recovery (on-chain existence check), getLiquidityParams calldata, 95 tests (2026-02-25)
- SE-1 — search.sh: web search + news search + URL extract via Tavily, provider-abstracted, stateless, x402 gated, 30 tests (2026-02-25)

### Milestone: token.sh complete — ERC-20 deploy + Uniswap V3 pool (2026-02-25)

**token.sh is feature-complete for agent-controlled token issuance and liquidity provisioning.**

What an agent can do today:
1. Deploy a named ERC-20 (custom decimals, optional mint cap) via x402 payment — `POST /v1/tokens`
2. Mint additional supply to any address — `POST /v1/tokens/:id/mint`
3. Create a Uniswap V3 pool paired with USDC at a chosen price — `POST /v1/tokens/:id/pool`
4. Get pre-computed `NonfungiblePositionManager.mint()` calldata to add full-range liquidity — `GET /v1/tokens/:id/pool/liquidity-params`

95 unit tests. Pool creation is idempotent (crash recovery: adopts existing on-chain pool if factory.getPool returns non-zero). Deployer key is custodied by token.sh; agent wallet is set as `Ownable` owner. Base + Base Sepolia supported.

**Known gap (TK-6):** on-chain `mint()` reverts because deployer key signs but `Ownable(owner_)` is the agent wallet. Not blocking — initial supply covers typical use.

**Next:** TK-5 (live smoke test), TK-6 (mint ownership fix), TK-7 (`prim token` CLI).

### Milestone: Non-custodial x402 end-to-end verified (2026-02-25)

**8/8 store.sh integration test steps pass on Base Sepolia.** Full non-custodial payment pipeline:
1. Agent generates private key locally
2. Registers wallet with wallet.sh via EIP-191 signature
3. Signs x402 payments client-side via `@primsh/x402-client`
4. store.sh accepts payments (facilitator settles on-chain), executes CRUD against real Cloudflare R2

Test wallet address and balance in `scripts/.env.testnet`. Cost: ~$0.07/run (6 store operations). Run: `set -a && source scripts/.env.testnet && set +a && bun run scripts/integration-test.ts`

### R-2 completion details (2026-02-25)

**Domain:** `prim.sh` registered via Namecheap ($34.98/yr). Project renamed from "AgentStack" to **Prim** ("primitive shell"). Each primitive is a subdomain: `relay.prim.sh`, `wallet.prim.sh`, `spawn.prim.sh`.

**Completed:**
- `prim.sh` Cloudflare zone (ID: `a16698041d45830e33b6f82b6f524e30`), NS pointed to `gene.ns.cloudflare.com` / `rudy.ns.cloudflare.com`
- 8 DNS records: A (prim.sh, relay.prim.sh, mail.relay.prim.sh), MX, SPF, DMARC, DKIM (RSA + Ed25519)
- Stalwart configured: hostname `mail.relay.prim.sh`, domain `relay.prim.sh`, DKIM dual signing, ACME Let's Encrypt (tls-alpn-01)
- API key created (`relay-wrapper` / Basic auth)
- docker-compose.yml deployed: port 8080 bound to 127.0.0.1
- UFW firewall: 22/25/443/465/587/993 open, 8080 denied
- Admin lockdown verified: 8080 unreachable from internet, works via SSH/localhost

**Verified (2026-02-25):**
- NS propagated to Cloudflare
- Let's Encrypt TLS cert issued (CN=mail.relay.prim.sh, expires 2026-05-26)
- SMTP STARTTLS on 587 working
- Admin port 8080 unreachable from internet
