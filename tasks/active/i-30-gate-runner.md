# Gate Runner — Agent Test Loop

**Tasks**: I-30, I-31, I-32, I-33, I-34

## Context

We ran manual smoke tests (groups 1-6) using Claude Code subagents. Results: 29 pass, 2 fail, 7 blocked across 38 tests. That process was manual and unrepeatable. The gate runner automates it into a CI quality gate.

The loop: **prim factory creates prims → gate runner validates them → agent canary approves → live.**

## Prim lifecycle

```
building → testing → live
```

| Status | Meaning | Gate runner | Agent canary | CI failure |
|--------|---------|-------------|--------------|------------|
| building | Code exists, not on VPS | n/a | n/a | n/a |
| testing | On VPS, API contract validated | passes (deterministic HTTP) | runs (LLM exercises service) | soft-fail (warn) |
| live | Fully validated, marketed | passes | passes | **hard-fail** |

**Two layers of validation:**

1. **Gate runner** (deterministic) — proves API contract: correct status codes, response shapes, x402 wiring. Fast, repeatable, runs in CI on every push.
2. **Agent canary** (LLM via infer.sh) — proves agent usability: reads llms.txt, gets a wallet, tries to use the service end-to-end. Catches confusing errors, missing docs, workflows agents can't figure out. Runs on schedule or manual trigger.

A prim moves from `testing` → `live` only when both layers pass.

## Status

| Task | Description | Status |
|------|-------------|--------|
| I-30 | Gate runner script (`scripts/gate-runner.ts`) — local mode | **done** |
| I-31 | Infer test group in smoke-test-plan.json (4 tests) | **done** |
| I-32 | CI gate workflow (`.github/workflows/gate.yml`) | pending |
| I-33 | `gen:gate` — codegen test entries from prim.yaml routes_map | **done** |
| I-34 | Agent canary (`--canary` flag on gate runner) | **done** |

### What's built

- `scripts/gate-runner.ts` — deterministic HTTP runner with:
  - `--dry-run`: lists all 8 groups, 68 tests
  - `--group <id>`: run a single group
  - `--ci`: gating logic (testing prims soft-fail, live prims hard-fail)
  - Template variable substitution + capture store (cross-test data flow)
  - Shape matching (loose schema: `"string"`, `"array (non-empty)"`, etc.)
  - x402 payment via `createPrimFetch` from `@primsh/x402-client`
  - Results written to `tests/runs/<date>-gate.json`
- `scripts/gen-gate.ts` — codegen missing smoke-test-plan.json entries from prim.yaml routes_map
- `tests/smoke-test-plan.json` — 8 groups, 68 tests (discovery, onboarding, store, search, email, spawn, infer, wallet)

### What's verified

- `--dry-run`: all groups display correctly
- `--group discovery`: 6/6 health checks pass against live endpoints
- `--ci` gating: testing prim failure → non-blocking (exit 0 + warning); live prim failure → hard-fail (exit 1)
- Results file written to `tests/runs/`
- `gen:gate --check`: all live routes have test coverage (idempotent)

### What's NOT built yet

- **`--spawn` mode** (Phase A + D): VPS provisioning, wallet setup, teardown
- **Full paid-route run**: Requires `AGENT_PRIVATE_KEY` env var or keystore at `~/.prim/keys/`
- **CI workflow** (I-32): `.github/workflows/gate.yml`
- **Agent canary** (I-34): `--canary` flag on gate runner

## Architecture

```
scripts/gate-runner.ts
│
├── [default] Deterministic mode — HTTP requests + shape assertions
│   ├── Free routes: raw fetch
│   ├── Paid routes: createPrimFetch (auto x402 payment)
│   ├── Collect results (pass/fail/blocked per test)
│   └── Report + gate decision (exit code for CI)
│
├── [--canary] Agent canary mode — LLM exercises the service
│   ├── For each group: send group prompt + prim's llms.txt to infer.sh
│   ├── Agent reasons about the API, makes real x402 calls
│   ├── Agent reports: did each step work? any confusion?
│   ├── Collect structured results + UX observations
│   └── Report canary verdict (pass/warn/fail)
│
└── [--spawn, NOT BUILT] VPS isolation mode
    ├── Spawn VPS via spawn.sh API
    ├── Install deps, create wallet, fund via faucet
    ├── Run tests on VPS
    └── Tear down VPS
```

## I-32: CI gate workflow

**File**: `.github/workflows/gate.yml`

Trigger: push to main, or PR that modifies `packages/*/prim.yaml`.

Steps:
1. Detect which prims changed status (diff prim.yaml files)
2. Categorize: new prim (building→testing) vs already live
3. Run `bun scripts/gate-runner.ts --ci --group <changed-prims>`
4. Gating:
   - testing prim below threshold: annotate PR with warning, don't fail
   - live prim below threshold: fail the workflow
5. Post results as PR comment (test summary table)

Needs: funded wallet (GH secret), spawn.sh access for `--spawn` mode.

## I-33: gen:gate codegen

**Status: done**

`scripts/gen-gate.ts` reads prim.yaml `routes_map` for live prims, diffs against existing tests, and emits missing entries with correct endpoints, template vars, expected shapes (from api.ts), dependencies, and captures.

- 42 → 68 tests generated
- Idempotent (`--check` verifies, `pnpm gen:gate` regenerates)
- Hand-written tests preserved (only adds tests with `generated: true`)
- Wired into package.json as `pnpm gen:gate`

## I-34: Agent canary

**Flag**: `--canary` on gate-runner.ts

For each test group, instead of deterministic HTTP calls:
1. Build a prompt: group's `prompt` field + the prim's `llms.txt` content
2. Send to infer.sh (`POST /v1/chat`) with the prompt
3. Agent reasons about the API, decides what calls to make
4. Agent makes real x402 calls (via the funded wallet)
5. Agent reports structured results: which steps worked, which were confusing, UX notes

The canary tests things the gate runner can't:
- Can an agent understand the llms.txt well enough to use the API?
- Are error messages actionable?
- Do multi-step workflows (create → use → delete) make sense?
- Are there undocumented gotchas?

Output: same results format as gate runner, plus a `ux_notes` array per group.

### Canary prompt template

```
You are testing {{service_name}} ({{endpoint}}).

Read the API documentation below, then complete the following tasks:
{{group_prompt}}

For each task:
1. Decide which API call to make based on the docs
2. Make the call (you have a funded wallet for x402 payments)
3. Report: did it work? was anything confusing?

## API Documentation
{{llms_txt}}
```

### Implementation approach

- Use infer.sh's `/v1/chat` with tool_use — define tools for HTTP GET/POST/PUT/DELETE
- Agent calls the tools, gate runner executes them via primFetch
- Parse agent's final message for structured results
- Fall back to "fail" if agent gets confused or times out

## Key files

- `scripts/gate-runner.ts` — the runner
- `scripts/gen-gate.ts` — test codegen
- `tests/smoke-test-plan.json` — test definitions (68 tests)
- `tests/runs/` — result artifacts
- `.github/workflows/gate.yml` — CI integration (I-32, not yet built)
- `packages/*/prim.yaml` — status field drives gating

## Before closing

- [x] `bun scripts/gate-runner.ts --dry-run` shows all test groups (8 groups, 68 tests)
- [x] `bun scripts/gate-runner.ts --group discovery` passes (health checks only)
- [x] Results written to `tests/runs/`
- [x] `--ci` exit code is 0 when all live prims pass
- [x] `gen:gate --check` — all live routes have test coverage
- [ ] Full paid-route run completes (requires funded wallet)
- [ ] CI workflow runs on push (I-32)
- [ ] Agent canary exercises at least one prim end-to-end (I-34)
