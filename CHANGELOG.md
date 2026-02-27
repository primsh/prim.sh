# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Task management system migrated to `tasks/tasks.json` as machine-editable SOT (I-2)
- Primitives SOT codegen — `prim.yaml` per-package + `gen-prims.ts` (I-1)
- Faucet and search landing pages
- Pre-deployment readiness check script (L-69)
- `prim` CLI subcommands for token (deploy, list, get, mint, supply, pool) and mem (collections, upsert, query, cache CRUD)
- Dynamic allowlist — services check wallet.sh internal API (L-61)
- MCP tools and skills for email, mem, domain, token primitives (L-72)
- `prim install/uninstall/skill` commands (L-66)
- llms.txt rewrite with embedded skill content for compiled binary (Wave 5.5)
- OpenAPI 3.1 specs for all 5 live primitives (L-62)
- SSR site with template engine + per-prim YAML config (SITE-1)
- Design system refactor with brand copy SOT (SITE-2)
- Metrics endpoints on store, spawn, search, email via x402-middleware (OBS-1)
- Observability report script + MCP `prim_report` tool (OBS-1 wave 2)
- `GET /pricing` free route on all services + unified `pricing.json` (BIZ-4)
- Self-hosted healthcheck cron with webhook alerting (OPS-1)
- Daily SQLite to R2 backup cron (SEC-6)
- Lifecycle gates and deploy automation (I-2)
- Prims grid image between hero and content on landing page

### Changed
- Site aligned to shared design system; agentstack page dropped
- TASKS.md sections use Release column instead of LNCH section
- Parallelism annotations switched from explicit lanes to implicit PARA/SRL

### Fixed
- Coverage `reportsDirectory` so gate enforces thresholds (I-3)
- Gate target, port collision, smoke test check 4, dead code cleanup (I-2)
- Deployed status handling in site, `readdirSync` usage
- Caddy `prim.sh` block serving `pricing.json` from SSR site server (BIZ-4)
- Missing `freeRoutes` for domain.sh recover + configure-ns (L-73)
- Hero image sticking to top of page on sub-pages
- Missing CSS vars (`--text`, `--muted`, `--code-bg`) on sub-pages
- Status badge CSS on primitive landing pages

## [v0.1.4] - 2026-02-26

### Fixed
- Added `aws4fetch` to root deps for `upload-release.ts` script

## [v0.1.3] - 2026-02-26

### Changed
- Release distribution switched from compiled binaries to 2.6MB JS bundle + Bun wrapper

### Fixed
- Site install route (no extension) so `curl prim.sh/install | sh` works

## [v0.1.2] - 2026-02-26

### Fixed
- Excluded `allowlist-db.ts` from tsc (uses `bun:sqlite`, served from src directly)

## [v0.1.1] - 2026-02-26

### Fixed
- Removed redundant pnpm version from action-setup (conflicts with `packageManager` field)

## [v0.1.0] - 2026-02-26

### Added
- **wallet.sh** — Encrypted keystore, wallet creation (keypair, keystore, SQLite), balance, send, x402 client, funding, policy engine, execution journal, circuit breaker (W-1 through W-9)
- **email.sh** — Stalwart Mail Server integration: JMAP auth bridge, mailbox CRUD, read/send messages, incoming webhooks, mailbox TTL/expiry, custom domains, custom usernames, permanent mailboxes, outbound delivery with DKIM signing (R-1 through R-14)
- **spawn.sh** — VPS provisioning: Hetzner + DigitalOcean providers, CloudProvider interface abstraction, VM lifecycle, SSH key management (SP-1 through SP-7)
- **store.sh** — Object storage via Cloudflare R2: bucket CRUD, object CRUD, storage quota + usage tracking, Base Sepolia testnet support (ST-1 through ST-6)
- **domain.sh** — DNS management via Cloudflare + NameSilo: zone/record CRUD, domain search/registration/recovery, NS auto-configuration, mail setup (MX+SPF+DMARC+DKIM), batch record operations, zone verification (D-1 through D-9)
- **token.sh** — ERC-20 token deployment (OpenZeppelin AgentToken): deploy, query, mint, supply, Uniswap V3 pool creation, separate minter role (TK-1 through TK-5)
- **search.sh** — Web search and URL content extraction via Tavily (SE-1, SE-2)
- **mem.sh** — Vector memory + KV cache: collections, upsert, query, cache CRUD (M-1 through M-3)
- **faucet.sh** — Testnet USDC faucet with wallet allowlist (FC-1)
- **@primsh/x402-middleware** — Shared Hono middleware for x402 payment gating (P-4)
- **@prim/keystore** — Local V3 keystore + CLI + x402-client integration (KS-1)
- **`prim` CLI** — Binary compiled for 4 platforms with wallet, store, email subcommands (P-6)
- **`install.sh`** — `curl prim.sh/install | sh` installer + R2 upload helper + GitHub Actions release workflow (P-6)
- Landing pages for all 27 primitives with shared design system
- llms.txt machine-readable primitive catalog for all services (P-1, P-2)
- CI/CD workflows, deploy scripts, VPS + DNS setup (L-6 through L-10)
- Infrastructure hardening: fail2ban, SSH key-only auth, unattended-upgrades (SEC-1), Caddy security headers (SEC-2), body-limit middleware (SEC-5), `pnpm audit` in CI (SEC-4)
- Secrets audit runbook (SEC-7)
- Caddy timeouts and request size limits (SEC-3)
- Monorepo setup with pnpm workspaces, Biome lint, vitest (P-3)
- Live smoke tests for wallet, email, spawn, store, domain, search, mem, token
- Lockdown: allowlist, storage caps, spawn caps, faucet persistence (L-16 through L-20)
- Contributor guidelines

[Unreleased]: https://github.com/prim-sh/prim/compare/v0.1.4...HEAD
[v0.1.4]: https://github.com/prim-sh/prim/compare/v0.1.3...v0.1.4
[v0.1.3]: https://github.com/prim-sh/prim/compare/v0.1.2...v0.1.3
[v0.1.2]: https://github.com/prim-sh/prim/compare/v0.1.1...v0.1.2
[v0.1.1]: https://github.com/prim-sh/prim/compare/v0.1.0...v0.1.1
[v0.1.0]: https://github.com/prim-sh/prim/releases/tag/v0.1.0
