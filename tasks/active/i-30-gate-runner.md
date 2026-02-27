# Gate Runner — Agent Test Loop

**Tasks**: I-30, I-31, I-32, I-33

## Context

We ran manual smoke tests (groups 1-6) using Claude Code subagents. Results: 29 pass, 2 fail, 7 blocked across 38 tests. That process was manual and unrepeatable. The gate runner automates it into a CI quality gate.

The loop: **prim factory creates prims → gate runner validates them → live.**

## Status

| Task | Description | Status |
|------|-------------|--------|
| I-30 | Gate runner script (`scripts/gate-runner.ts`) — local mode | **done** |
| I-31 | Infer test group in smoke-test-plan.json (4 tests) | **done** |
| I-32 | CI gate workflow (`.github/workflows/gate.yml`) | pending |
| I-33 | `gen:gate` — codegen test entries from prim.yaml routes_map | pending |

### What's built

- `scripts/gate-runner.ts` — deterministic HTTP runner with:
  - `--dry-run`: lists all 7 groups, 42 tests
  - `--group <id>`: run a single group
  - `--ci`: gating logic (testing prims soft-fail, live prims hard-fail)
  - Template variable substitution + capture store (cross-test data flow)
  - Shape matching (loose schema: `"string"`, `"array (non-empty)"`, etc.)
  - x402 payment via `createPrimFetch` from `@primsh/x402-client`
  - Results written to `tests/runs/<date>-gate.json`
- `tests/smoke-test-plan.json` — 7 groups, 42 tests (discovery, onboarding, store, search, email, spawn, infer)

### What's verified

- `--dry-run`: all groups display correctly
- `--group discovery`: 6/6 health checks pass against live endpoints
- `--ci --group infer`: testing prim failure correctly treated as non-blocking (exit 0 + warning)
- Results file written to `tests/runs/`

### What's NOT built yet

- **`--spawn` mode** (Phase A + D): VPS provisioning, wallet setup, teardown. The runner only has local mode — it runs from the current machine against live endpoints. `--spawn` would create an isolated VPS per run.
- **Full paid-route run**: Requires `AGENT_PRIVATE_KEY` env var or keystore at `~/.prim/keys/`. Health checks work (free routes); paid routes haven't been run through the runner yet.
- **CI workflow** (I-32): `.github/workflows/gate.yml` — triggers on push/PR, runs `--ci`, posts results.
- **Codegen** (I-33): `gen:gate` — auto-generate smoke-test-plan.json entries from prim.yaml `routes_map`.

## Architecture

```
scripts/gate-runner.ts
│
├── 1. [--spawn only, NOT BUILT] Spawn VPS via spawn.sh API
├── 2. [--spawn only, NOT BUILT] On VPS: install prim CLI, create wallet, fund via faucet
├── 3. Run test groups from smoke-test-plan.json  ← BUILT (local mode)
│     ├── Free routes: raw fetch
│     └── Paid routes: createPrimFetch (auto x402 payment)
├── 4. Collect results (pass/fail/blocked per test ID)  ← BUILT
├── 5. [--spawn only, NOT BUILT] Tear down VPS
└── 6. Report + gate decision  ← BUILT
```

## Gating logic

| Prim status change | Test result | CI outcome |
|-------------------|-------------|------------|
| New prim → live | Tests pass | Prim can go live |
| New prim → live | Tests fail (below threshold) | Warn, don't block CI. Prim stays building. |
| Already live prim | Tests pass | CI passes |
| Already live prim | Tests fail | **CI fails** — regression detected |

Threshold: configurable per prim in prim.yaml (default: 100% for live prims, 80% for new prims).

## I-32: CI gate workflow

**File**: `.github/workflows/gate.yml`

Trigger: push to main, or PR that modifies `packages/*/prim.yaml`.

Steps:
1. Detect which prims changed status (diff prim.yaml files)
2. Categorize: new prim (building→live) vs already live
3. Run `bun scripts/gate-runner.ts --ci --group <changed-prims>`
4. Gating:
   - New prim below threshold: annotate PR with warning, don't fail
   - Live prim below threshold: fail the workflow
5. Post results as PR comment (test summary table)

Needs: funded wallet (GH secret), spawn.sh access for `--spawn` mode.

## I-33: gen:gate codegen

Extend `pnpm gen` to auto-generate smoke-test-plan.json entries from prim.yaml `routes_map`.

For each live prim, emit:
- Health check test (free GET /)
- One test per route in `routes_map` (method, endpoint, expected status + response shape from api.ts types)

Manual overrides that can't be codegen'd:
- `captures` (cross-test data flow like bucket_id → subsequent tests)
- Special-case notes (429 = pass on faucet, 409 = pass on wallet registration)
- Group `prompt` (for future LLM agent mode)
- `depends_on` beyond the health check

Approach: generated tests go in a `// BEGIN:GENERATED` / `// END:GENERATED` block. Hand-written overrides live outside that block and take precedence (by test ID).

## Key files

- `scripts/gate-runner.ts` — the runner
- `tests/smoke-test-plan.json` — test definitions
- `tests/runs/` — result artifacts
- `.github/workflows/gate.yml` — CI integration (I-32, not yet built)
- `packages/*/prim.yaml` — status field drives gating

## Before closing

- [x] `bun scripts/gate-runner.ts --dry-run` shows all test groups
- [x] `bun scripts/gate-runner.ts --group discovery` passes (health checks only, no payment needed)
- [x] Results written to `tests/runs/`
- [x] `--ci` exit code is 0 when all live prims pass
- [ ] Full paid-route run completes (requires funded wallet)
- [ ] CI workflow runs on push (I-32)
