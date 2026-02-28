# L-69: Pre-Deployment Readiness Check Script

**Date:** 2026-02-26
**Status:** pending
**Scope:** `scripts/pre-deploy.ts`

## Problem

Each primitive deployment (L-48, L-68, L-70, L-71…) repeats the same manual checklist: are env vars filled in? is the port free? does DNS resolve? is the external dependency up? Currently this lives in the deployer's head. One missed check = a broken service that appears deployed.

## Goal

`bun scripts/pre-deploy.ts <primitive>` runs on the VPS before any service is started. Prints a labeled pass/fail for each check. Exits 0 if all pass, exits 1 with a summary of failures. Blocks deployment until clean.

## Usage

```
bun scripts/pre-deploy.ts token
bun scripts/pre-deploy.ts mem
bun scripts/pre-deploy.ts search   # works for existing services too
```

## Checks (in order)

### 1. Unit tests
Run `pnpm --filter @primsh/<primitive> test --run` locally before pushing. The pre-deploy script does not re-run tests on the VPS (no pnpm on VPS). Gate: tests must have passed in the last CI run. The script checks for the presence of a passing CI status by reading the GitHub latest workflow run via `gh run list` — if the last run on the current commit failed, block.

> Alternative if GitHub CLI not available on VPS: skip this check and document that tests must be green before invoking the script.

### 2. Env file present and non-empty
Each primitive has a required env var list (defined in the script, per-primitive). Env file lives at `/etc/prim/<primitive>.env`.

Check: env file exists AND each required var is set (non-empty string). Unknown vars are warned but not fatal.

Required vars per primitive:

| Primitive | Required env vars |
|---|---|
| wallet | `PRIM_PAY_TO`, `PRIM_NETWORK`, `WALLET_INTERNAL_KEY` |
| store | `PRIM_PAY_TO`, `PRIM_NETWORK`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` |
| faucet | `PRIM_NETWORK`, `CIRCLE_API_KEY`, `TREASURY_PRIVATE_KEY` |
| spawn | `PRIM_PAY_TO`, `PRIM_NETWORK`, `DO_API_TOKEN` |
| search | `PRIM_PAY_TO`, `PRIM_NETWORK`, `TAVILY_API_KEY` |
| email | `PRIM_PAY_TO`, `PRIM_NETWORK`, `STALWART_BASE_URL`, `STALWART_API_KEY`, `EMAIL_DEFAULT_DOMAIN` |
| token | `PRIM_PAY_TO`, `PRIM_NETWORK`, `TOKEN_MASTER_KEY`, `TOKEN_DEPLOYER_ENCRYPTED_KEY`, `BASE_RPC_URL` |
| mem | `PRIM_PAY_TO`, `PRIM_NETWORK`, `QDRANT_URL`, `GOOGLE_API_KEY` |

### 3. Port not in use
Each primitive has a canonical port (defined in the script):

| Primitive | Port |
|---|---|
| wallet | 3001 |
| store | 3002 |
| faucet | 3003 |
| spawn | 3004 |
| search | 3005 |
| email | 3006 |
| token | 3007 |
| mem | 3008 |

Check: `ss -tlnp` does not show the port bound to another process. If the service is already running (restart case), this check is skipped for the current service's own PID.

### 4. External dependency reachable
Per-primitive HTTP health check against the upstream dependency:

| Primitive | Check |
|---|---|
| token | `GET $BASE_RPC_URL` with a minimal `eth_blockNumber` JSON-RPC call — expect a valid block number response |
| mem | `GET $QDRANT_URL/healthz` — expect `{ status: "ok" }` |
| search | `GET https://api.tavily.com` — just a TCP connect check (no API call, no key needed) |
| email | `GET $STALWART_BASE_URL/api/health` |
| store | R2 is accessed via S3-compatible API — skip (no public health endpoint) |
| wallet / faucet / spawn | No external dep check needed (Cloudflare/DO APIs are public, don't need pre-check) |

Timeout: 5 seconds. Failure is fatal.

### 5. x402 sanity
Read `PRIM_PAY_TO` from env file. Check:
- Non-zero address (not `0x0000…`)
- Matches expected network: if `PRIM_NETWORK=eip155:84532`, confirm address is a valid 0x address (not a mainnet-only contract)

### 6. DNS resolves to VPS
Resolve `<primitive>.prim.sh` via system DNS. Check that at least one A record matches the expected VPS IP (`<VPS_IP>`). Failure is a warning (not fatal) — DNS may be propagating.

## Output format

```
pre-deploy check: token
─────────────────────────────────
✓ env file        /etc/prim/token.env (5/5 vars set)
✓ port            3007 is free
✓ rpc reachable   block 24819203
✓ x402 config     0xAbc…def on eip155:84532
⚠ dns             token.prim.sh → no A record (propagating?)
─────────────────────────────────
4 passed, 0 failed, 1 warning
→ READY TO DEPLOY
```

Failure case:
```
✗ env file        TOKEN_DEPLOYER_ENCRYPTED_KEY is not set
✗ rpc reachable   timeout after 5s
─────────────────────────────────
3 passed, 2 failed
→ NOT READY — fix failures before deploying
```

## Implementation notes

- Single file, no imports beyond Node builtins + `dns/promises`. No new deps.
- Primitive name validated against known list at startup — unknown primitive exits 1 immediately.
- Port table and env var table are plain objects at the top of the file — easy to extend when new prims are added.
- Should eventually read from `primitives.yaml` (I-1) instead of hardcoded tables, but hardcode for now.

## Integration

Add to `deploy/prim/setup.sh` as a step before `systemctl start prim-<name>`:
```
bun /opt/prim/scripts/pre-deploy.ts <name> || { echo "pre-deploy check failed"; exit 1; }
```

## Before Closing

- [ ] Script exits 0 on a clean token deploy, exits 1 if `TOKEN_DEPLOYER_ENCRYPTED_KEY` is unset
- [ ] Script exits 0 on a clean mem deploy, exits 1 if `QDRANT_URL` is unreachable
- [ ] Port check correctly skips when the service is already running on its own port (restart scenario)
- [ ] DNS warning (not failure) — doesn't block a deploy where DNS is still propagating
- [ ] Unknown primitive argument → immediate exit 1 with usage hint
- [ ] Add `pre-deploy` call to `deploy/prim/setup.sh` before service start
