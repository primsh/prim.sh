# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Open-source scrub: stripped internal plan docs and research for public release

## [0.8.0] - 2026-02-28

### Added
- Terminal World brand system: card generator with SF Mono font extraction, 7 orders, 34 primitives, 8 shells, 22 service cards
- `prim skill onboard`: agent onboarding runbook with mainnet wallet creation and faucet funding
- Category-based color system for all primitives; accent colors derived from category instead of hardcoded per-prim

### Changed
- Generated assets restructured under gitignored directories (site/assets/, brand/)
- Switched onboard flow to mainnet, removed faucet fallback

## [0.7.0] - 2026-02-27

### Added
- gate.sh: invite-code access control and agent onboarding — allowlist, wallet funding, free-service mode
- feedback.sh: programmatic issue reporting from agents, `X-Feedback-Url` middleware header
- `gen:deploy`: Caddy fragment and systemd unit generation from `prim.yaml`
- `prim-ci` GitHub App token for all bot workflows (auto-merge, rebase, review, ci-heal)
- Conventional commit enforcement via `.githooks/commit-msg`
- Auto-merge enabled for all PRs (squash)
- PR template with checklist and task reference
- v0 launch-status dashboard with gate tracking
- G2 switchover script, metrics snapshot, Caddy access logs
- `/prim_create` slash command; vpn.sh phantom primitive

### Changed
- Prim status taxonomy simplified: deployed→live, soon→phantom
- Cloudflare env vars standardized to `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`
- `tasks.json` established as sole task SOT; TASKS.md retired
- deploy.sh auto-bootstraps new services (installs systemd unit, creates env from template)

### Fixed
- Rebase bot: fail-fast disabled, conflict resolution prompt improved, `pnpm gen` run after rebase
- CI: allow prim-ci bot in ci-heal, skip in review; Claude CLI used directly instead of claude-code-action
- wallet.sh: reactivate deactivated wallet on re-registration
- faucet.sh: sequential CDP claims to avoid rate limiting; allowlist gate removed from free endpoints

## [0.6.0] - 2026-02-26

### Added
- CI/CD automation pipeline: 9 workflows (ci, review, ci-heal, rebase, auto-merge, deploy, release, stale, dedupe)
- Claude-powered code review (`review.yml`): architecture, security, logic, x402 wiring, test gaps
- CI self-heal (`ci-heal.yml`): Claude reads failed logs, fixes code, pushes
- Automated rebase conflict resolution (`rebase.yml`) with Claude
- Cloudflare Pages deployment for marketing site (`deploy-site` job)
- Branch protection: required checks, squash-only merge, auto-delete branches
- CODEOWNERS enforcement
- gitleaks pre-commit hook and CI secret scan job
- Biome tightened: `organizeImports`, `noExplicitAny`, `useImportType`
- infer.sh: OpenRouter-backed LLM inference primitive (INF-1 through INF-5)
- Agent discovery surface: `llms-full.txt`, sitemap, robots.txt, response headers, OpenAI plugin manifests
- OpenAPI 3.1 specs generated from `api.ts` + `prim.yaml` for all live primitives
- Per-prim OG image generator (`gen-og-images`)
- Platform binaries + GitHub Release workflow (`release.yml`)
- `pnpm create-prim` scaffolder: interactive wizard creates `prim.yaml`, package, tests
- Provider scaffolder: `pnpm create-prim --provider`
- `gen:sdk`: unified SDK index generation
- `skills.json`: agent skill registry
- Interface flags and conformance runner for smoke test contract
- Pre-commit hook: blocks commit if `prim.yaml` staged but gen output is stale

### Changed
- All 8 built primitives migrated to `createPrimApp()` factory
- `import.meta.dir` compat fixed across all primitives for Node/vitest
- CI restructured: parallelized jobs, strict typecheck mode

### Fixed
- email.sh: prevent 500 on mailbox creation after x402 payment (E-3)
- wallet.sh: circuit breaker and smoke test env var isolation via `vi.hoisted`
- store.sh: `existsSync` guard prevents crash when `llms.txt` is missing
- spawn.sh: `'destroyed'` added to terminal status exclusion list

## [0.5.0] - 2026-02-25

### Added
- email.sh (relay.sh → email.sh): full JMAP stack on Stalwart — mailbox CRUD, send/receive, webhooks, TTL/expiry, custom domains, outbound DKIM delivery confirmed
- domain.sh (dns.sh → domain.sh): NameSilo client, domain search and registration; batch record operations (atomic multi-record create/update/delete)
- token.sh: ERC-20 deploy via OpenZeppelin AgentToken, viem `deployContract`, cumulative mint cap, receipt confirmation
- store.sh: storage quota and usage tracking (ST-3); Base Sepolia testnet support (ST-5)
- spawn.sh: DigitalOcean provider added; default switched from Hetzner; `CloudProvider` interface for multi-cloud
- faucet.sh: nonce queue for concurrent treasury transactions; treasury balance check and CDP auto-refill

### Fixed
- domain.sh: drop fabricated renew price from domain search response
- Stalwart client: lookup table for 200-with-error mapping; live smoke test fixes (11/11 → 15/15 assertions passing)

## [0.4.0] - 2026-02-24

### Added
- wallet.sh waves 2–3: balance query, USDC send, x402 client, wallet funding policy, execution journal, circuit breaker
- spawn.sh waves 1–3: VM provisioning (Hetzner), lifecycle management (create/start/stop/destroy), SSH key injection
- dns.sh (precursor to domain.sh): zone and record CRUD via Cloudflare API
- Stalwart Mail Server: Docker Compose deployment, DKIM/SPF/DMARC, ACME TLS, prim.sh domain live
- x402 end-to-end testnet integration test (Base Sepolia)
- ADRs: provider strategy (Cloudflare DNS + DigitalOcean compute), spawn multi-cloud abstraction
- v0 MVP launch plan: 4 primitives, 7 gates, private beta scope

## [0.3.0] - 2026-02-24

### Added
- wallet.sh wave 1: HD wallet creation, encrypted SQLite keystore, x402 pricing surface, route stubs
- `@primsh/x402-middleware`: shared Hono middleware package — `createPrimApp()` factory, payment gating, `createAgentStackMiddleware`
- store.sh: bucket CRUD via Cloudflare R2 API (ST-1); object CRUD via R2 S3-compatible API (ST-2)
- llms.txt: machine-readable primitive catalog served at `prim.sh/llms.txt`
- pnpm monorepo: workspace root, `tsconfig.base.json`, `biome.json`

## [0.2.0] - 2026-02-23

### Added
- Landing page design system: dark-mode, monospace, CSS custom properties, per-primitive accent colors
- Primitive catalog expanded to 26 primitives on homepage hero
- Human-readable footer notice on all landing pages
- Repository contributor guidelines

## [0.1.0] - 2026-02-23

### Added
- Initial commit: static marketing site (`serve.py`) with landing pages for all planned primitives
- Platform specs, task roadmap, primitive count copy
- x402 middleware prototype (Hono integration, EIP-3009 payment flow)
