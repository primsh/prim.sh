# Gate Runner — Agent Test Loop

**Tasks**: I-30, I-31, I-32

## Context

We ran manual smoke tests (groups 1-6) using Claude Code subagents. Results: 29 pass, 2 fail, 7 blocked across 38 tests. That process was manual and unrepeatable. The gate runner automates it into a CI quality gate.

The loop: **prim factory creates prims → gate runner validates them → live.**

## Architecture

```
scripts/gate-runner.ts
│
├── 1. Spawn VPS via spawn.sh API (or reuse existing)
├── 2. On VPS: install prim CLI, create wallet, fund via faucet
├── 3. On VPS: run test groups from smoke-test-plan.json
│     └── Agent uses infer.sh for reasoning + prim CLI for x402 calls
├── 4. Collect results (pass/fail/blocked per test ID)
├── 5. Tear down VPS
└── 6. Report + gate decision
```

## Gating logic

| Prim status change | Test result | CI outcome |
|-------------------|-------------|------------|
| New prim → deployed | Tests pass | Prim can go live |
| New prim → deployed | Tests fail (below threshold) | Warn, don't block CI. Prim stays building. |
| Already live prim | Tests pass | CI passes |
| Already live prim | Tests fail | **CI fails** — regression detected |

Threshold: configurable per prim in prim.yaml (default: 100% for live prims, 80% for new prims).

## I-30: Gate runner script

**File**: `scripts/gate-runner.ts`

### CLI interface

```bash
# Run all groups against live endpoints
bun scripts/gate-runner.ts

# Run specific prim's test group only
bun scripts/gate-runner.ts --group store

# Run with spawned VPS isolation
bun scripts/gate-runner.ts --spawn

# CI mode: enforce gating thresholds, exit code reflects pass/fail
bun scripts/gate-runner.ts --ci

# Dry run: show what would be tested
bun scripts/gate-runner.ts --dry-run
```

### Phases

**Phase A: Environment setup** (when `--spawn`)
1. Call spawn.sh API: `POST /v1/ssh-keys` (register ephemeral key)
2. Call spawn.sh API: `POST /v1/servers` (create small Ubuntu VPS)
3. Poll `GET /v1/servers/:id` until active
4. SSH in, install Bun + prim CLI
5. Create wallet: `prim wallet create`
6. Register wallet: `prim wallet register`
7. Fund via faucet: `POST faucet.prim.sh/v1/faucet/usdc`
8. Add wallet to allowlist (internal API)

**Phase B: Run tests** (for each group in smoke-test-plan.json)
- For each test in group:
  - Execute the HTTP request (using prim CLI or curl with x402)
  - Compare actual response against expected
  - Record: actual_status, actual_body, result (pass/fail/blocked), run_note
- If `--spawn`: run on the VPS via SSH
- If local: run directly from this machine

**Phase C: Collect and report**
- Write results to `tests/runs/<timestamp>-<mode>.json`
- Print summary table: group → pass/fail/blocked counts
- In `--ci` mode: apply gating logic, set exit code

**Phase D: Teardown** (when `--spawn`)
- Delete server via spawn.sh API
- Delete SSH key
- Always runs, even if tests fail (try/finally)

### Local mode (no --spawn)

Skip phase A. Use existing wallet at `~/.prim/`. Run tests directly from the current machine against live endpoints. This is the fast path for local dev.

### Key design decisions

- **No infer.sh agent for MVP**: The runner executes tests deterministically (HTTP calls + response assertions), not via an LLM agent. The LLM agent approach (groups 1-6 style) is valuable for UX testing but too nondeterministic for a CI gate. Add agent-mode later as `--agent` flag.
- **x402 payment**: Use `@primsh/x402-client` for programmatic payment signing. The runner needs a funded wallet.
- **Parallelism**: Groups run sequentially (some depend on prior state like wallet funding). Tests within a group can parallelize if no `depends_on`.

## I-31: Infer test group

Add to `tests/smoke-test-plan.json`:

```json
{
  "id": "infer",
  "name": "LLM Inference (infer.sh)",
  "prompt": "...",
  "tests": ["INF-H1", "INF-T1", "INF-T2", "INF-T3"]
}
```

Tests:
- INF-H1: `GET /` → 200, `{ service: "infer.sh", status: "ok" }`
- INF-T1: `POST /v1/chat` → 402 (confirm x402 wired), then with payment → 200 + valid ChatResponse
- INF-T2: `POST /v1/embed` → 402, then with payment → 200 + valid EmbedResponse
- INF-T3: `GET /v1/models` → 402, then with payment → 200 + `{ data: [...] }`

## I-32: CI gate workflow

**File**: `.github/workflows/gate.yml`

Trigger: push to main, or PR that modifies `packages/*/prim.yaml`.

Steps:
1. Detect which prims changed status (diff prim.yaml files)
2. Categorize: new prim (building→deployed) vs already live
3. Run `bun scripts/gate-runner.ts --ci --group <changed-prims>`
4. Gating:
   - New prim below threshold: annotate PR with warning, don't fail
   - Live prim below threshold: fail the workflow
5. Post results as PR comment (test summary table)

Needs: funded wallet (GH secret), spawn.sh access for `--spawn` mode.

## Key files

- `scripts/gate-runner.ts` — the runner
- `tests/smoke-test-plan.json` — test definitions
- `tests/runs/` — result artifacts
- `.github/workflows/gate.yml` — CI integration
- `packages/*/prim.yaml` — status field drives gating

## Before closing

- [ ] `bun scripts/gate-runner.ts --dry-run` shows all test groups
- [ ] `bun scripts/gate-runner.ts --group discovery` passes (health checks only, no payment needed)
- [ ] Results written to `tests/runs/`
- [ ] `--ci` exit code is 0 when all live prims pass
