# V1 Launch Plan — prim.sh

**Date:** 2026-02-25
**Scope:** L-1 through L-14 (4 waves)
**Goal:** An agent can discover, install, pay, and use prim.sh on the real internet.

## Context

Nine primitives built (500+ tests), end-to-end x402 payment proven on Base Sepolia. Nothing is deployed, installable, or discoverable. This plan takes "works on localhost" to "live on the internet."

**Launch scope:** Core 4 — wallet.sh, store.sh, spawn.sh, faucet.sh. Store is the hero demo primitive (~$0.01/op, fast, reversible). Email and token deferred to v1.1.

**Brand:**
- Product: **Prim** ("Primitive Shell" is the backronym)
- Domain: `prim.sh`
- GitHub: `github.com/useprim/prim.sh`
- npm: `@primsh/*`
- X: `@useprim`
- Token: `$PRIM` (verify availability on BaseScan, deploy defensively)

## Wave 0: Cleanup (blocks everything)

### L-1: Redact secrets from committed files (Claude)

Files with real credentials:

| File | Redact |
|------|--------|
| `TASKS.md` lines ~249-259 | Stalwart creds, server IP, SSH tunnel |
| `tasks/completed/r-3-mailbox-creation-stalwart-rest.md` | Stalwart creds |
| `tasks/completed/r-11-local-smoke-test.md` | Stalwart creds, IP |
| `tasks/completed/d-2-domain-sh-rename-search-2026-02-25.md` | Server IP |
| `tasks/completed/d-6-verification-endpoint-2026-02-25.md` | Server IP |

Replace with: creds → `[REDACTED]`, IP → `[STALWART_HOST]`.

**Post-push (Garric manual):** Rotate Stalwart admin password + API key on live server.

### L-2: Rename packages to @primsh/* (Claude)

All 12 packages:

| Current | New |
|---------|-----|
| `@agentstack/wallet` | `@primsh/wallet` |
| `@agentstack/store` | `@primsh/store` |
| `@agentstack/spawn` | `@primsh/spawn` |
| `@agentstack/email` | `@primsh/email` |
| `@agentstack/domain` | `@primsh/domain` |
| `@agentstack/token` | `@primsh/token` |
| `@agentstack/faucet` | `@primsh/faucet` |
| `@agentstack/mem` | `@primsh/mem` |
| `@agentstack/search` | `@primsh/search` |
| `@agentstack/x402-middleware` | `@primsh/x402-middleware` |
| `@prim/keystore` | `@primsh/keystore` |
| `@prim/x402-client` | `@primsh/x402-client` |

Changes: `package.json` name + all cross-package imports + workspace refs + test files.

### L-3: Audit .gitignore + CLAUDE.md for public readiness (Claude)

Verify .gitignore covers .env*, *.db, node_modules, dist. Check CLAUDE.md for leaked creds/IPs.

## Wave 1: Foundation

### L-4: Create GitHub org + repo (Garric manual)

1. Create `useprim` org at github.com/organizations/new (free)
2. `gh repo create useprim/prim.sh --private`
3. `git remote add origin git@github.com:useprim/prim.sh.git && git push -u origin main`
4. Go public only after Wave 0 cleanup + credential rotation

### L-5: Register @primsh npm org (Garric manual) — DONE

### L-6: Write GitHub Actions CI (Claude)

`.github/workflows/ci.yml`: push to main + PRs, Bun runtime, `pnpm -r check`, pnpm cache.
`.github/workflows/release.yml`: tag `v*` → build binaries → GitHub Release.

### L-7: Provision VPS (Garric manual)

DigitalOcean Droplet `s-1vcpu-2gb` ($12/mo), Ubuntu 24.04, `sfo3` or `nyc1`.

### L-8: Write deploy scripts — systemd + Caddy (Claude)

`deploy/prim/setup.sh`:
1. Install Bun + pnpm
2. Clone repo, `pnpm install`
3. systemd services: wallet (3001), store (3002), faucet (3003), spawn (3004)
4. Caddy reverse proxy with auto-TLS: `wallet.prim.sh`, `store.prim.sh`, `faucet.prim.sh`, `spawn.prim.sh`
5. UFW: 22, 80, 443 only

`deploy/prim/Caddyfile`:
```
wallet.prim.sh { reverse_proxy localhost:3001 }
store.prim.sh  { reverse_proxy localhost:3002 }
faucet.prim.sh { reverse_proxy localhost:3003 }
spawn.prim.sh  { reverse_proxy localhost:3004 }
```

### L-9: Wire DNS + env vars (Garric manual)

DNS (Cloudflare): A records for `wallet.prim.sh`, `store.prim.sh`, `faucet.prim.sh`, `spawn.prim.sh` → VPS IP.

Env vars on VPS (`/etc/prim/<service>.env`):
- All: `PRIM_NETWORK=eip155:84532`, `PRIM_PAY_TO=0x...`
- store: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
- spawn: `DO_API_TOKEN`
- faucet: `CIRCLE_API_KEY`, `FAUCET_TREASURY_KEY`

## Wave 2: Go Live

### L-10: Deploy Core 4 + smoke test (Claude + Garric)

Run setup script on VPS. Run integration test against live `*.prim.sh` endpoints. Verify:
- Wallet registration via EIP-191
- Store CRUD with on-chain x402 settlement
- Spawn SSH key + server lifecycle
- Faucet USDC + ETH drip
- All 4 health endpoints respond

### L-11: Compile prim binary — P-6 (Claude)

`bun build packages/keystore/src/cli.ts --compile --outfile prim`
Targets: darwin-arm64, darwin-x64, linux-x64, linux-arm64.
Upload to GitHub Release via `gh release create`.

### L-12: Write install script (Claude)

`site/install.sh` served at `prim.sh/install`:
- Detect OS + arch
- Download binary from GitHub Releases
- Install to `~/.prim/bin/prim`
- Add to PATH
- Verify with `prim --version`

Per-primitive wrappers: `wallet.prim.sh/install`, `store.prim.sh/install`.

### L-13: Deploy landing site to Cloudflare Pages (Garric setup + Claude config)

Connect `useprim/prim.sh` to CF Pages. Output dir: `site/`. Custom domain: `prim.sh`.

## Wave 3: Token + Public

### L-14: Deploy $PRIM token + go public (Garric + token dev)

1. Verify ticker availability on BaseScan
2. Deploy $PRIM, $PRIMSH, $PRIMITIVESHELL defensively on Base Sepolia via token.sh
3. Create Uniswap V3 pool for primary ticker (USDC pair)
4. Make GitHub repo public

## Verification

After all waves:
1. `curl -fsSL prim.sh | sh` installs `prim` binary
2. `prim wallet create` generates key at `~/.prim/keys/`
3. `prim wallet balance` shows 0.00 USDC [eip155:84532]
4. Fund wallet via `faucet.prim.sh` or Circle
5. `prim store create-bucket --name test` succeeds (x402 payment settles)
6. `prim store put <bucket> hello.txt --file=./hello.txt` uploads
7. `prim store get <bucket> hello.txt` downloads
8. All 4 services respond at `https://<primitive>.prim.sh/health`
9. `https://prim.sh/llms.txt` accessible

## Manual tasks (Garric) — each is a potential primitive

| Task | Lane | Potential Primitive |
|------|------|-------------------|
| Create GitHub org `useprim` | L-4 | corp.sh |
| Create repo `prim.sh` | L-4 | — |
| Register npm org `@primsh` | L-5 | id.sh |
| Provision VPS | L-7 | spawn.sh |
| Wire DNS A records | L-9 | domain.sh |
| Set env vars on VPS | L-9 | vault.sh |
| Connect CF Pages | L-13 | spawn.sh |
| Rotate Stalwart creds | L-1 | vault.sh |
| Check ticker availability | L-14 | seek.sh |
| Deploy $PRIM token | L-14 | token.sh |
| Branch protection | L-4 | auth.sh |

## Dev coordination

Package rename (L-2) is the only disruption. All devs rebase once. After that:
- CI runs on PRs (L-6)
- Adding a primitive to production = systemd + Caddy route + DNS record
- Notify all devs of: repo location, `@primsh/*` namespace, rebase instructions

## What's NOT in v1

- email.sh (v1.1 — Stalwart ops)
- token.sh (v1.1 — TK-6 mint fix)
- MCP server (v1.1)
- Mainnet (v1.2 — needs pay.sh fiat onramp)
- mem.sh, search.sh (in dev, not launch-blocking)
- Monitoring/alerting (post-launch)

## Before closing

- [ ] All 4 services respond at `https://<primitive>.prim.sh/health`
- [ ] `curl prim.sh | sh` installs working binary
- [ ] `prim store create-bucket` succeeds with x402 payment
- [ ] `prim.sh/llms.txt` resolves
- [ ] GitHub repo is public
- [ ] All secrets rotated post-push
