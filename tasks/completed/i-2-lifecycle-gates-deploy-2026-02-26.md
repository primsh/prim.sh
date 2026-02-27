# I-2: Prim Lifecycle, Quality Gates, Deploy Automation & Smoke Test Standard

## Context

Primitive readiness is opaque — status values are ad-hoc (`coming_soon|building|built|testing|production`), 6+ scripts maintain hardcoded arrays that drift from prim.yaml, deploying a new prim requires hand-writing a systemd unit + Caddy block + env template + updating those arrays, and smoke tests vary from "app exports" to "11-test JMAP flow" with no defined contract.

This plan formalizes the lifecycle, adds enforced quality gates, automates deploy from prim.yaml, and standardizes smoke tests so "is it ready?" has a single answer.

---

## Phase 1: Status Lifecycle + Schema

**Goal**: Migrate to `idea → planning → building → testing → deployed → live` with gate overrides in prim.yaml.

### Status lifecycle

```
idea → planning → building → testing → deployed → live
```

| Status | Meaning | Has code? | On VPS? |
|--------|---------|-----------|---------|
| `idea` | Backlog entry only | No | No |
| `planning` | Plan doc written | No | No |
| `building` | Code in packages/, not yet quality-gated | Yes | No |
| `testing` | All local quality gates pass (lint, typecheck, tests, coverage, smoke) | Yes | No |
| `deployed` | On VPS, health check passing (testnet or mainnet) | Yes | Yes |
| `live` | User-tested, accepting real traffic, sign-off recorded | Yes | Yes |

### Status mapping (old → new)

| Old | New | Notes |
|-----|-----|-------|
| `coming_soon` | `idea` | 22 unbuilt primitives in primitives.yaml |
| `building` | `planning` | Currently unused but defined in gen-prims.ts |
| `built` | `building` | token, mem, domain, track — code exists, not yet gated |
| `testing` | `deployed` | wallet, store, faucet, spawn, search, email — on VPS testnet |
| `production` | `live` | Currently unused |

### Files to modify

**`scripts/gen-prims.ts`** — Update `Primitive.status` union type (line 32), card active check (line 142: `deployed|live` = active link, `testing` = active but no link), llms.txt sections (line 167-169), README labels (line 187-193), status badge map (line 209-224).

**`primitives.yaml`** — All 22 unbuilt entries: `coming_soon` → `idea`.

**10 `packages/*/prim.yaml`** (all 10 exist):
- wallet, store, faucet, spawn, search, email: `testing` → `deployed`
- token, mem, domain, track: `built` → `building`

**Note: track.sh deploy gap** — track already has a prim.yaml (`status: built`), a systemd unit (`deploy/prim/services/prim-track.service`), and a Caddy block, but is missing from the hardcoded SERVICES arrays in `deploy.sh`, `setup.sh`, and `healthcheck.sh`. This is exactly the kind of drift this plan eliminates. Phase 2's codegen markers will add track (and all future prims) automatically.

### prim.yaml schema extension

Add optional `gates` and `deploy` keys:

```yaml
# Quality gate overrides (all optional, defaults in gate runner)
gates:
  coverage_threshold: 70    # default 80
  allow_todo: true           # default false
  skip_smoke: false          # default false
  approved_by: asher         # manual sign-off for deployed → live

# Deploy config (all optional, defaults in deploy script)
deploy:
  max_body_size: "128MB"     # default "1MB" — Caddy request_body limit
  systemd_after: []          # extra After= units
  extra_caddy: []            # additional Caddy blocks (e.g. mail.email.prim.sh proxy)
```

Current overrides needed:
- **store**: `deploy.max_body_size: "128MB"`
- **email**: `deploy.max_body_size: "25MB"`, `deploy.extra_caddy` for `mail.email.prim.sh`

---

## Phase 2: Shared Primitives Loader + Eliminate Hardcoded Arrays

**Goal**: Extract `loadPrimitives()` into a shared module. All scripts import it instead of maintaining parallel arrays.

### New file: `scripts/lib/primitives.ts`

Extract from `gen-prims.ts` lines 22-78. Exports:
- `loadPrimitives()` — reads root primitives.yaml + all packages/*/prim.yaml, merges, sorts
- `PrimStatus` type union: `"idea" | "planning" | "building" | "testing" | "deployed" | "live"`
- `Primitive` interface (with `gates`, `deploy` fields)
- `getDeployConfig(p)` — applies defaults to `p.deploy`
- `getGateOverrides(p)` — applies defaults to `p.gates`
- Filter helpers: `deployed()` (status in deployed/live), `withPackage()` (has packages/<id>/)

### Refactor consumers — eliminate hardcoded arrays

| File | Hardcoded array | Replace with |
|------|----------------|--------------|
| `scripts/gen-prims.ts` | `loadPrimitives()` local fn | Import from `lib/primitives.ts` |
| `scripts/pre-deploy.ts` | `PRIMITIVES`, `PORTS` (lines 30-68) | Derive from `loadPrimitives()` |
| `scripts/launch-status.ts` | `LIVE_SERVICES`, `DNS_LIVE` (lines 28-45) | `deployed(prims).map(p => p.endpoint)` |
| `deploy/prim/deploy.sh` | `SERVICES=(...)` (line 11) | Codegen marker `BEGIN:PRIM:SERVICES` |
| `deploy/prim/setup.sh` | `SERVICES=(...)` (line 12) | Same marker |
| `deploy/prim/healthcheck.sh` | `ENDPOINTS=(...)` (lines 8-15) | Marker `BEGIN:PRIM:ENDPOINTS` |

For bash scripts: add codegen markers, extend `gen-prims.ts` to inject them. `pnpm gen:prims` keeps them in sync.

---

## Phase 3: Quality Gate Runner

**Goal**: `bun scripts/gate-check.ts <prim> <target-status>` — validates all gates for a transition. Subsumes `pre-deploy.ts`.

### Gate definitions

**building → testing** (local quality):
1. `packages/<id>/src/index.ts` exists
2. `pnpm --filter @primsh/<id> check` passes (lint + typecheck + unit tests)
3. `pnpm --filter @primsh/<id> test:smoke` passes (if script exists in package.json)
4. Coverage ≥ `gates.coverage_threshold` (default 80%) — uses `@vitest/coverage-v8`
5. No `TODO`/`FIXME` in `packages/<id>/src/` (unless `gates.allow_todo: true`)
6. prim.yaml has required fields: `id`, `name`, `endpoint`, `port`, `env`, `pricing`

**testing → deployed** (infra ready):
1. All building→testing gates still pass
2. systemd unit exists at `deploy/prim/services/prim-<id>.service`
3. Caddy block exists for `<endpoint>` in Caddyfile
4. DNS A record for `<endpoint>` resolves to VPS IP (<VPS_IP>)
5. External deps reachable (reuse from pre-deploy.ts: Qdrant, Stalwart, Base RPC checks)
6. Env vars from prim.yaml `env[]` are set in current environment

**deployed → live** (confirmed working):
1. `GET https://<endpoint>/` returns 200 + `{ status: "ok" }`
2. x402 flow: paid endpoint returns 402 (verifies middleware is active)
3. Manual sign-off — `gates.approved_by` field populated in prim.yaml

### Implementation

- Core logic in `scripts/lib/gate-check.ts` (importable by deploy-prim.ts)
- CLI wrapper in `scripts/gate-check.ts`
- `pre-deploy.ts` becomes a thin wrapper: `runGateCheck(prim, "deployed")`
- Add `@vitest/coverage-v8` as workspace devDep
- Add `coverage` config to each `packages/*/vitest.config.ts`

### Root script

```json
"gate": "bun scripts/gate-check.ts"
```

Usage: `pnpm gate track testing`, `pnpm gate wallet live`

---

## Phase 4: Deploy Automation

**Goal**: `bun scripts/deploy-prim.ts <name>` generates all deploy artifacts from prim.yaml. Eliminates hand-written systemd/Caddy/env per prim.

### Generated artifacts

1. **Systemd unit** → `deploy/prim/services/prim-<id>.service`

   Template (identical for all prims except name, port, optional After):
   ```ini
   [Unit]
   Description=prim.sh ${name} service
   After=network.target ${deploy.systemd_after}

   [Service]
   Type=simple
   User=prim
   WorkingDirectory=/opt/prim
   EnvironmentFile=/etc/prim/${id}.env
   ExecStart=/home/prim/.bun/bin/bun run packages/${id}/src/index.ts
   Restart=on-failure
   RestartSec=5

   [Install]
   WantedBy=multi-user.target
   ```

2. **Caddy fragment** → `deploy/prim/generated/<id>.caddy`
   ```
   ${endpoint} {
       import security_headers
       request_body { max_size ${deploy.max_body_size} }
       reverse_proxy localhost:${port}
   }
   ```
   Plus any `deploy.extra_caddy` entries.

3. **Env template** → `deploy/prim/generated/<id>.env.template`
   Generated from prim.yaml `env[]` with commented placeholders + PORT.

4. **Assembled Caddyfile** — Split current Caddyfile into:
   - `deploy/prim/Caddyfile.header` (global config + security_headers snippet, ~24 lines)
   - Per-prim fragments in `deploy/prim/generated/*.caddy`
   - Script concatenates header + all fragments → `deploy/prim/Caddyfile`

### Script flow

```
bun scripts/deploy-prim.ts <name>          # Generate artifacts only
bun scripts/deploy-prim.ts <name> --check  # Dry-run diff
```

Steps:
1. Load prim.yaml, validate required fields
2. Run gate-check for `testing → deployed` transition
3. Generate systemd unit, Caddy fragment, env template
4. Assemble full Caddyfile from header + all fragments
5. Write generated files to repo
6. Print next steps for VPS deploy (manual SSH for now, `--apply` later)

### Retire setup.sh env case block

The 125-line `case "$svc" in` block (setup.sh lines 87-212) gets replaced with:
```bash
for svc in "${SERVICES[@]}"; do
  TEMPLATE="$REPO_DIR/deploy/prim/generated/$svc.env.template"
  if [[ -f "$TEMPLATE" && ! -f "$ENV_FILE" ]]; then
    cp "$TEMPLATE" "$ENV_FILE"
  fi
done
```

---

## Phase 5: Smoke Test Standard

**Goal**: Define what every smoke test must cover. Update track.sh as reference implementation.

### Smoke test contract

Every package with `status ≥ building` must have `test/smoke.test.ts` covering:

| # | Check | Current state |
|---|-------|--------------|
| 1 | App default export defined | All 10 have this |
| 2 | `GET /` → 200 + `{ service: "<name>.sh", status: "ok" }` | Only track has this |
| 3 | Paid endpoint → 402 without payment | None test this |
| 4 | Happy path via Hono test client (mocked provider) | None in smoke.test.ts |
| 5 | Error case: 400 on invalid input | None in smoke.test.ts |

Every package should also have `test/smoke-live.test.ts` (run via `pnpm test:smoke`, excluded from default `pnpm test`) covering:

| # | Check |
|---|-------|
| 1 | Real provider happy path (requires API key env var) |
| 2 | Response shape assertions (all fields present, correct types) |
| 3 | At least one error case against real provider |

### Implementation

- Upgrade `packages/track/test/smoke.test.ts` to cover checks 1-5 as reference implementation
- Add `test:smoke` script to all package.json files that don't have it
- Document standard in `CLAUDE.md` under "Smoke Test Standard" section
- Gate runner (Phase 3) enforces: smoke test must exist and pass for `building → testing`

---

## Sequencing

```
Phase 1 (Status + Schema)  ──┬──→ Phase 2 (Shared Loader) ──→ Phase 3 (Gate Runner)
                              │                                        │
                              └──→ Phase 5 (Smoke Standard)    Phase 4 (Deploy Auto)
                                   (parallel with 2-3)         (depends on 2+3)
```

Phases 1 and 5 can start immediately in parallel. Phase 4 is last since it builds on everything else.

### Conflict with SITE-1

Two overlap points with `tasks/active/site-1-ssr-2026-02-26.md`:

1. **Caddyfile** — I-2 Phase 4 splits the monolithic Caddyfile into `Caddyfile.header` + per-prim fragments. SITE-1 Phase 6 adds a `prim.sh` block to the Caddyfile. **I-2 must land first** so SITE-1 writes a fragment (`generated/site.caddy`) instead of editing a monolith that's about to be split.

2. **Status value names** — I-2 renames `testing → deployed`, `built → building`. SITE-1's badge mapping references old names. SITE-1 must use the new names if I-2 lands first.

No conflict on `prim.yaml` — I-2 adds `gates`/`deploy` keys, SITE-1 adds `accent`/content keys (different fields).

**Run order: I-2 → SITE-1.** No worktrees needed — these are sequential, not parallel.

---

## Before closing

- [ ] Run `pnpm check` (lint + typecheck + test pass)
- [ ] Run `bun scripts/gen-prims.ts --check` to verify no codegen drift
- [ ] All 10 prim.yaml files migrated to new status values
- [ ] All 6 hardcoded arrays replaced with data-driven reads or codegen markers
- [ ] Assembled Caddyfile matches current Caddyfile functionally (diff to verify)
- [ ] Generated systemd units match current hand-written units (diff to verify)
- [ ] gate-check.ts tested with both passing and failing prims
- [ ] track.sh smoke.test.ts covers all 5 standard checks (reference impl)
