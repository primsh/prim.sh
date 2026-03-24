# Testing

Prim uses a 5-tier testing pyramid. Every tier is **code-generated** from `prim.yaml` and `api.ts` where possible — add routes, run `pnpm gen:tests`, get tests for free. The route definitions, request bodies, and assertions are the same data across all tiers. What changes is the wrapper: mocked vs real provider, mocked vs real x402, in-process vs HTTP.

## Tiers

| Tier | File | Source | When | Cost | What it catches |
|------|------|--------|------|------|-----------------|
| **Unit** | `test/unit.generated.test.ts` | Generated | Every push/PR | $0 | Broken handlers, wrong status codes, middleware wiring, Zod validation |
| **Integration** | `test/integration.generated.test.ts` | Generated | Daily cron | $0 | Provider API changes, auth failures, S3 signing bugs |
| **E2E local** | `e2e/tests/<id>.generated.ts` | Generated | Manual dispatch | $0 | Full-stack regressions: Hono → x402 → service → provider (testnet) |
| **Deploy smoke** | `scripts/deploy-smoke.generated.ts` | Generated | Post-deploy | $0 | Bad rsync, missing env vars, Caddy misconfig, service crash |
| **Canary** | `scripts/canary-runner.ts` | Generated plan + hand-written runner | On-demand | $$$ | Agent usability, multi-prim flows, LLM tool-use regressions |

### What's generated vs hand-written

- **`*.generated.test.ts`** — always overwritten by `pnpm gen:tests`. Never hand-edit. Has `// THIS FILE IS GENERATED` header.
- **`*.custom.test.ts`** — hand-written. Generator never touches. Use for edge cases, complex mocks, prim-specific logic.
- **`canary-runner.ts`** — runner infrastructure is hand-written. Test plan (`tests/smoke-test-plan.json`) and LLM prompts are generated from prim.yaml routes and `usage:` field. Uses infer.sh as LLM backbone.

### Generation data flow

All tiers derive from the same source:

```
prim.yaml (routes, pricing, operation_id, usage, testing config)
    +
api.ts (Zod schemas → request bodies, response shapes)
    ↓
gen-tests.ts
    ├→ test/unit.generated.test.ts          (mocked service, mocked x402, vitest)
    ├→ test/integration.generated.test.ts   (real provider, no x402, vitest)
    └→ e2e/tests/<id>.generated.ts          (real provider, real testnet x402, bun script)

gen-deploy-smoke.ts
    └→ scripts/deploy-smoke.generated.ts    (health + 402 check per live prim)

gen-tests.ts (canary plan)
    └→ tests/smoke-test-plan.json           (deterministic test plan for canary-runner)
```

### Why not e2e-prod?

We considered a dedicated mainnet e2e tier (PRIMS-29e original plan) but decided against it:
- The canary-runner canary already tests live mainnet endpoints with real x402 payments
- Deploy smoke catches most deploy regressions (health + 402) for free
- A deterministic mainnet test would either (a) cost money per deploy or (b) muddy revenue data in REVENUE_WALLET
- The x402 payment flow is identical across all prims (same middleware) — proving it works once per deploy is sufficient

One mainnet payment test per deploy is planned as a follow-up (requires a dedicated CI mainnet wallet to avoid revenue data pollution).

## Tier 1: Unit tests

**What:** Mocked service layer + mocked x402 middleware. Tests handler logic, Zod validation, status codes, and middleware wiring. Per-route Check 4 (happy path) and Check 5 (error path) for every route in `routes_map`.

**Run locally:**
```bash
pnpm -r test                          # all packages
pnpm --filter @primsh/store test      # one package
```

**CI:** Runs in `ci.yml` on every push and PR. Must pass for merge.

**The 5-check contract:**
1. App default export is defined
2. `GET /` → 200 + `{ service, status: "ok" }`
3. x402 middleware wired with correct routes and payTo (non-free prims only)
4. Each route happy path → expected status (mocked service returns `{ ok: true, data: {} }`)
5. Each route error path → 400/404 (mocked service returns `{ ok: false, ... }`)

**Generator handles:** sync vs async service functions (`mockReturnValueOnce` vs `mockResolvedValueOnce`), Zod enum values (case-preserving first variant), nullable types, wallet address fields. Routes with nested ownership checks (`:param` + 403 errors) are auto-skipped in generated tests — handle in `*.custom.test.ts`.

## Tier 2: Integration tests

**What:** Real provider API calls with x402 bypassed. Tests that the provider integration actually works — auth, request signing, response parsing. Each provider type uses a different client layer:

| Provider layer | Client | Example prims |
|---------------|--------|---------------|
| `s3` | `aws4fetch` (S3 SigV4) | store.sh (Cloudflare R2) |
| `rest` | `fetch` (generic HTTP) | search.sh (Tavily), spawn.sh (DigitalOcean) |
| `graphql` | `fetch` + query | (future prims) |

**Run locally:**
```bash
pnpm --filter @primsh/store test:integration   # one package (needs R2 creds)
pnpm -r test:integration                       # all packages
```

Auto-skips when provider credentials are missing. Safe to run in CI with no creds — all tests skip.

**CI:** Runs in `integration.yml` daily cron. Provider credentials stored as GitHub secrets.

**Pattern:** Tests the provider layer directly (e.g., `aws4fetch` for R2), not through the Hono handler stack. Avoids x402 and SQLite dependencies. Creates real resources with `test-int-<timestamp>` prefix, cleans up in `afterAll`. No mutating operations on resources the generator doesn't create.

**Provider metadata from `providers.yaml`:** The generator reads the provider registry (SOT) to determine layer, auth type, env vars, and health check endpoints. No per-prim `testing:` section needed — the registry supplies everything. See `providers.yaml` at repo root.

Each generated integration test includes a `Docs:` link to the provider's API reference in its header comment.

## Tier 3: E2E local

**What:** Boots the prim service locally with Bun, sends real HTTP requests with x402 payment signatures on Base Sepolia testnet. Tests the full stack: HTTP → x402 → handler → service → provider.

**Run locally:**
```bash
set -a && source scripts/.env.testnet && set +a   # export all vars
export AGENT_PRIVATE_KEY="$TESTNET_WALLET"         # use testnet wallet as agent
bun e2e/tests/store.generated.ts
```

Requires: `PRIM_NETWORK=eip155:84532`, `AGENT_PRIVATE_KEY` (funded testnet wallet), provider credentials.

The runner creates a temp `PRIM_HOME` and `PRIM_DATA_DIR` for each run (SQLite DBs need writable directories). It sets `PORT`/`BUN_PORT` to control which port the service binds to.

**CI:** Runs in `e2e-local.yml` on manual dispatch. Uses `TESTNET_WALLET` secret (existing funded testnet wallet — no need for a fresh wallet unless testing gate/onboarding flows).

**Why Bun, not vitest:** Needs real `bun:sqlite` and real x402 client signing. Vitest runs on Node.

**x402 on Base has zero gas for agents** — EIP-3009 meta-transactions, facilitator absorbs gas. So testnet e2e costs nothing.

### Test wallet strategy

| Scenario | Wallet | Why |
|----------|--------|-----|
| Store, search, infer, etc. | `TESTNET_WALLET` (existing, funded) | Just needs a funded, allowlisted wallet |
| Gate / onboarding flows | Fresh wallet (generated per run) | The test IS the create-wallet-and-fund flow |

## Tier 4: Deploy smoke

**What:** After deploy to VPS, hits each live prim's public endpoint. Two checks per prim:
1. `GET /` → 200 + `{ service: "<name>.sh", status: "ok" }` (proves service is running)
2. `POST /v1/<first_paid_route>` without payment → 402 (proves x402 middleware is wired)

**Run locally:**
```bash
bun scripts/deploy-smoke.generated.ts
```

**CI:** Runs as a step in `deploy.yml` verify job after rsync + restart.

**Generated from prim.yaml:** Reads all prims with `status: mainnet`, emits the health + 402 checks. No hand-written test code per prim. Accepts 400 (body validation) or 402 (x402 gating) — both prove the service is alive.

**Validated:** 7/7 checks pass against live endpoints (wallet, gate, store, search).

**No payment test** — would require a funded mainnet wallet in CI. Deferred to a follow-up task (dedicated CI mainnet wallet with dust balance). The 402 check proves x402 middleware is wired; actual settlement is the facilitator's responsibility (Coinbase infrastructure). One payment round-trip per deploy is planned — money goes to REVENUE_WALLET (paying yourself), but we want a separate wallet to avoid muddying production revenue data.

## Tier 5: Canary (canary-runner)

**What:** LLM-driven end-to-end tests. Sends a prompt to infer.sh ("use store.sh to create a bucket and upload a file"), the LLM agent decides what API calls to make with real x402 payments. Tests agent usability, not just correctness — does the API make sense to an agent? Can it complete the task without getting stuck?

**Three environments:**

| Env | What | Cost |
|-----|------|------|
| `local` | Runs CLI commands on the local machine | LLM inference only |
| `docker` | Spins up an ubuntu:24.04 container, installs CLI, runs inside | LLM inference only |
| `remote` | Provisions a DigitalOcean droplet, runs CLI over SSH, tears down after | LLM + VPS hourly |

**Run locally:**
```bash
source scripts/.env.testnet
bun scripts/canary-runner.ts --group store --env local
bun scripts/canary-runner.ts --canary --group onboarding_e2e --env docker
bun scripts/canary-runner.ts --canary --group onboarding_e2e --env remote
```

**What's generated:**
- **Test plan** (`tests/smoke-test-plan.json`) — deterministic test cases (route, body, expected status, capture patterns) generated from prim.yaml routes. Same data as other tiers.
- **LLM prompts** — derived from prim.yaml `usage:` field. Each prim has a short "how to use this prim" description that becomes the canary agent's instruction set, combined with `llms.txt` context.

**What's hand-written:**
- **Runner infrastructure** (`scripts/canary-runner.ts`) — backend lifecycle (local/docker/remote), agent loop, tool dispatch, cleanup (wallet sweep, bucket deletion, allowlist removal), result recording.

**Cleanup:** After each run, the runner decrypts the test wallet, sweeps remaining USDC/ETH back to GATE_WALLET, deletes created resources (buckets, etc.), and removes the wallet from the allowlist.

**CI:** Not automated. On-demand only. Docker and remote environments cost real money (LLM inference + VPS provisioning).

**When to use:** Before releases, after major refactors, when validating agent UX changes. Not for every PR.

## Adding tests for a new prim

1. Add routes to `prim.yaml` with `routes_map`, `operation_id`, error codes
2. Add `usage:` field to `prim.yaml` — short description of how an agent uses this prim (feeds canary LLM prompts)
3. Add provider with `env` list (feeds integration test credential checks)
4. Optionally add `testing:` section for integration layer hint and create/delete resource routes
5. Add request/response types to `src/api.ts` with Zod schemas
6. Run `pnpm gen:tests` — generates unit + integration + e2e + canary test plan
7. Run `pnpm gen:deploy-smoke` — adds the prim to deploy health checks
8. If the prim needs custom test logic, add `test/<name>.custom.test.ts`

Providers should be swappable — only the provider protocol (interface in `provider.ts`) is integrated into the service layer. Adding or removing a provider is a config change (`prim.yaml` + env vars), not a code refactor.

## Provider credentials

Integration and e2e tests need real provider credentials. Setup:

1. Copy `scripts/.env.example` to `scripts/.env.testnet`
2. Fill in provider-specific values (R2 keys, API tokens, etc.)
3. Source before running: `source scripts/.env.testnet`

**GitHub secrets for CI:**

| Secret | Used by |
|--------|---------|
| `R2_ACCESS_KEY_ID` | Integration (store.sh) |
| `R2_SECRET_ACCESS_KEY` | Integration (store.sh) |
| `CLOUDFLARE_ACCOUNT_ID` | Integration (store.sh) |
| `CLOUDFLARE_API_TOKEN` | Integration (store.sh, domain.sh) |
| `TESTNET_WALLET` | E2E local (funded testnet private key) |
| `REVENUE_WALLET` | E2E local (x402 payment receiver) |

## CI workflow map

| Workflow | Trigger | Tiers | Cost |
|----------|---------|-------|------|
| `ci.yml` | Every push/PR | Unit | $0 |
| `integration.yml` | Daily cron, manual | Integration | $0 |
| `e2e-local.yml` | Manual dispatch | E2E local | $0 |
| `deploy.yml` | CI passes on main | Deploy smoke | $0 |
| — (manual) | On-demand | Canary | $$$ |

## Follow-up tasks

- [ ] Dedicated CI mainnet wallet for one-payment-per-deploy test
- [ ] Add `usage:` field to all prim.yaml files
- [ ] Generate `tests/smoke-test-plan.json` from prim.yaml (currently hand-maintained)
- [ ] Remove `packages/spawn/src/hetzner.ts` — provider swap to DigitalOcean (code cleanup)
- [ ] Rename `scripts/gate-runner.ts` → `scripts/canary-runner.ts` (tests all prims, not just gate)
