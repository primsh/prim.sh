# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

**Prim** (`prim.sh`) — the agent-native stack. A simple shell around existing services that require human signup flows, made accessible to agents through a single payment protocol. 27 independent infrastructure primitives. x402 payment (USDC on Base) is the sole auth. No signup, no GUI, no KYC. See `BRAND.md` for naming conventions.

The project has two layers:
1. **Marketing site** — Static HTML landing pages (current state, `site/` equivalent)
2. **Primitives** — Actual services being built (wallet.sh, email.sh, spawn.sh, etc.)

## Dev Commands

```bash
# Primitives (after P-3 monorepo setup)
pnpm install                              # Install all deps
bun run packages/wallet/src/index.ts      # Run wallet.sh locally
bun run packages/email/src/index.ts       # Run email.sh locally
pnpm -r check                            # Lint + typecheck + test (all packages)
pnpm -r test                             # Tests only
pnpm -r lint                             # Biome lint

# Landing pages
bun run site/serve.ts                         # Serves locally on :3000
```

## Project Structure (after P-3 monorepo setup)

```
prim/
├── packages/
│   ├── x402-middleware/      # @primsh/x402-middleware (shared)
│   ├── wallet/               # @primsh/wallet (wallet.sh)
│   ├── email/                # @primsh/email (email.sh)
│   └── spawn/                # @primsh/spawn (spawn.sh)
├── site/                     # Landing pages (HTML, moved from root)
│   ├── serve.ts              # Dev server (Bun)
│   └── <primitive>/index.html
├── specs/                    # Product specs
├── tasks/                    # Plan docs (active/ and completed/)
│   ├── tasks.json            # SOT for all task data
│   └── tasks.schema.json     # JSON Schema draft 2020-12
├── package.json              # Workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── biome.json
```

### Current structure (pre-monorepo)

Landing pages are at root level (`spawn/index.html`, `email/index.html`, etc.). `serve.py` is at root. No `packages/` dir yet. P-3 migrates to the structure above.

## Primitives (27)

Core: wallet, email, spawn, store, vault, dns, cron, pipe, code
Communication: ring, browse
Intelligence: mem, infer, seek, docs
Operations: watch, trace, auth, id
Physical world: pins, mart, ship, hands, pay, corp
Social: hive, ads

## Tech Stack

- **TypeScript + Bun** — Bun runs TS natively, no build step. `bun run src/index.ts` just works.
- **Hono** — Web framework. Lightweight, middleware-friendly. x402 has first-party Hono middleware.
- **pnpm workspaces** — Monorepo. Each primitive is `packages/<name>/`.
- **Biome** — Lint + format.
- **vitest** — Test runner.
- **x402** — Payment protocol (Coinbase). USDC on Base chain. Sub-cent gas.

## Key Architecture Decisions

- **x402 payment** is the auth layer. Every endpoint returns 402 → agent pays → gets resource.
- **Each primitive is independent.** No shared DB. Shared `@primsh/x402-middleware` package only.
- **wallet.sh** is the keystone — encrypted keystore, execution journal, circuit breaker.
- **email.sh** wraps Stalwart Mail Server (Rust, JMAP + REST API).
- **spawn.sh** wraps Hetzner Cloud API.

## Build Priority

1. wallet.sh — Crypto wallets + x402 integration (foundation for everything)
2. email.sh — Email (wraps Stalwart, receive-only first)
3. spawn.sh — VPS provisioning (wraps Hetzner)
4. llms.txt — Machine-readable primitive catalog

## Code Conventions

Biome enforces lint + format (2-space indent, 100-char lines, `organizeImports`, `noExplicitAny`, `useImportType`). These conventions go beyond Biome — Claude review enforces them:

### API shape

- Response fields use **snake_case**: `tx_hash`, `wallet_address`, `created_at`
- Timestamps are ISO 8601: `new Date().toISOString()`
- Money values are **decimal strings** to avoid float precision: `"5.25"` not `5.25`

### TypeScript

- **`interface`** for request/response contracts and object shapes
- **`type`** for discriminated unions, literal unions, and type operators
- Use `import type { ... }` for type-only imports
- No `any` — use `unknown` + type guards

### Error handling

Services return a discriminated union, never throw for business logic:

```typescript
type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string };
```

Handlers check `if (!result.ok)` and map to `c.json({ error: { code, message } }, status)`. Only JSON parsing and external SDK calls use try/catch. Re-throw unhandled exceptions — never swallow silently.

### Imports (ordering)

1. Node.js built-ins (`node:crypto`, `node:fs`)
2. Third-party packages (`viem`, `hono`)
3. Internal packages (`@primsh/x402-middleware`)
4. Local modules (`./db.ts`, `./api.ts`)

### Hono app structure

Every primitive uses `createPrimApp()` from `@primsh/x402-middleware/create-prim-app`:

1. Define route → price map (`const ROUTES = { ... } as const`)
2. Call `createPrimApp({ serviceName, routes, pricing, ... })`
3. Register routes — extract caller via `c.get("walletAddress")`
4. `export default app`

### Security (Claude review must flag)

- Hardcoded secrets, API keys, or private keys in source
- `process.env` access without fallback or validation
- Missing ownership checks on protected routes
- SQL/NoSQL injection vectors
- Unvalidated user input passed to external APIs

## Smoke Test Standard

Every primitive package has two test files:

- **`test/smoke.test.ts`** — Unit-level smoke tests. Included in `pnpm test`. Uses Hono test client + `vi.mock` (no real API keys). Must pass in CI.
- **`test/smoke-live.test.ts`** — Live integration tests against real providers. Excluded from default `pnpm test`. Run via `pnpm test:smoke`.

### 5-check contract (`smoke.test.ts`)

Reference implementation: `packages/track/test/smoke.test.ts`

1. App default export is defined
2. `GET /` → 200 + `{ service: "<name>.sh", status: "ok" }`
3. x402 middleware is registered — spy asserts `createAgentStackMiddleware` was called with `payTo`, `freeRoutes: ["GET /"]`, and the paid route map
4. `POST /v1/<route>` with mocked service layer → 200 with valid response shape
5. `POST /v1/<route>` with missing/invalid input → 400

**Pattern**: `@primsh/x402-middleware` is mocked as a passthrough via `vi.mock` so the handler is reachable. Check 3 uses a `vi.fn()` spy on `createAgentStackMiddleware` to verify it was registered with the correct config — this is a structural test (middleware is wired), not a runtime test (middleware returns 402). The runtime 402 behavior is covered by the gate runner's `testing → live` check, which POSTs to the live endpoint and asserts 402.

## Git Workflow

**All new work must use a worktree-based branch → PR flow. No direct commits to `main`.**

### Process

1. Create a worktree on a new branch — use `/prim_git_wt_b_c_p <task-id> <slug>`
2. Implement the task inside `.worktrees/<slug>/`
3. Run `pnpm -r check` — must pass before committing
4. Commit, push, open PR via `gh pr create`
5. After merge, clean up: `git worktree remove .worktrees/<slug>`

### Branch naming

`<scope>/<task-id>-<slug>` — e.g., `i/i-39-api-key-costs`, `hrd/hrd-30-console-warn`, `ops/ops-13-health-alerting`

Scope = lowercased task ID prefix. If no task ID: `fix/`, `feat/`, `chore/`.

### Commit messages

Conventional commit format enforced by `.githooks/commit-msg`:

`type(scope): subject` — scope optional, subject ≤72 chars

Types: `feat|fix|chore|docs|refactor|test|ci|perf|build|style`

### Rules

- Never push directly to `main`
- Never use `--no-verify` or `--force-push` unless explicitly instructed
- PRs require CI to pass before merge

## CI Automation

Ten workflows automate the PR-to-deploy pipeline (`.github/workflows/`):

| Workflow | Trigger | What it does |
|----------|---------|-------------|
| `ci.yml` | push to main, PRs | Lint, typecheck, test, gen check, audit, safeguards, secret scan, commit lint |
| `review.yml` | PR open/push, `@claude` comment | Claude reviews for architecture, security, logic, x402 wiring, test gaps; fixes and pushes |
| `ci-heal.yml` | CI failure on PR branch | Claude reads failed logs, fixes code, pushes |
| `rebase.yml` | push to main, manual | Forward-merges main into conflicted PRs; Claude resolves real conflicts |
| `auto-merge.yml` | PR open/push (bots only) | Auto-merges dependabot/renovate patch/minor bumps |
| `deploy.yml` | CI passes on main | Rsync to VPS + Cloudflare Pages deploy + smoke check |
| `release.yml` | tag push (`v*`) | Bundle CLI, upload to R2, create GitHub Release |
| `stale.yml` | weekly cron | Mark/close stale issues and PRs |
| `dedupe.yml` | issue opened | Detect duplicate issues by title similarity |

### The shipping flywheel

```
PR opens → Claude review (fix + push) → CI runs → auto-merge (squash)
  → main updates → rebase bot resolves conflicts on other PRs
  → CI reruns → auto-merge → deploy to VPS + Cloudflare Pages
  → if CI breaks on a PR → ci-heal fixes it → CI reruns → auto-merge
```

### Branch protection (main)

- **Required checks**: Lint, Typecheck, Test, Gen check, Audit, Safeguards, Secret scan (commit lint is advisory only)
- **`strict: false`** — PRs merge in parallel without needing to be up-to-date with main
- **Squash merge only.** Auto-delete branches after merge.
- Claude review is NOT a required check — it's advisory + auto-fix

### Constraints

- Claude review will always fail on PRs that modify `review.yml` (GitHub security feature — expected, not blocking)
- Merge queue requires GitHub Enterprise or public repo (I-42, deferred)
- Rebase bot allows 15s for GitHub to recalculate mergeability after main moves — sometimes insufficient; use manual `workflow_dispatch` as fallback

## Task Management

Full conventions: `tasks/README.md`. Key rules for this project:

### Sections

| Abbrev | Scope |
|--------|-------|
| HRD | Code quality, security, reliability |
| PRIMS | Feature work on specific services |
| INFRA | CI, tooling, observability, cross-cutting |
| COMM | Docs, Discord, brand, marketing |
| BKLG | Future primitives, deferred ideas |

### ID Prefixes

| Prefix | Scope | Prefix | Scope |
|--------|-------|--------|-------|
| L | Legacy launch (migrated) | HRD | Hardening |
| W | wallet.sh | E | email.sh |
| SP | spawn.sh | ST | store.sh |
| TK | token.sh | D | domain.sh |
| SE | search.sh | TR | track.sh |
| M | mem.sh | FC | faucet.sh |
| OPS | Operations | OBS | Observability |
| BIZ | Business | SEC | Security |
| I | Internal tooling | SITE | Marketing site |
| COM | Community | X4 | x402 middleware |

### Task SOT

`tasks/tasks.json` is the sole source of truth. **TASKS.md does not exist and must never be generated or referenced.** All task reads and writes go through `tasks/tasks.json` directly.

### Completion workflow

1. Update `status` to `"done"` in `tasks/tasks.json`
2. If plan doc exists: `git mv tasks/active/<plan>.md tasks/completed/`

### What does NOT belong in tasks.json

- Research notes (go to `tasks/research/`)
- Milestone retrospectives (go to `tasks/completed/milestones.md`)
- Plan doc indexes (live in `tasks/README.md`)
- Generated markdown views (no TASKS.md — read tasks.json directly)

## Landing Page Design System

Dark-mode, monospace, CSS custom properties:
- `--bg: #0a0a0a`, `--surface: #111`, `--text: #e0e0e0`, `--muted: #666`
- Font: `'SF Mono', SFMono-Regular, 'Cascadia Code', Consolas, monospace`
- Each primitive sets `--accent` to its unique color
- Color utility classes: `.g` green, `.b` blue, `.r` red, `.p` purple, `.o` orange, `.cy` cyan, `.y` yellow, `.pk` pink, `.gl` gold, `.t` teal, `.m` magenta, `.l` lime, `.c` coral, `.i` indigo, `.v` violet, `.z` azure, `.br` brown, `.e` emerald, `.s` slate, `.w` text

## Factory Workflow

<!-- BEGIN:PRIM:FACTORY -->
**Gen commands** (run from repo root):

| Command | What it does |
|---------|-------------|
| `pnpm gen` | Run all generators (prims, mcp, cli, openai, tests, docs) |
| `pnpm gen:check` | Check all generated files are up to date (CI) |
| `pnpm gen:prims` | Regenerate site cards, llms.txt, status badges, pricing rows |
| `pnpm gen:mcp` | Regenerate MCP server configs |
| `pnpm gen:cli` | Regenerate CLI tool definitions |
| `pnpm gen:openai` | Regenerate OpenAI plugin manifests |
| `pnpm gen:tests` | Regenerate smoke test scaffolds |
| `pnpm gen:docs` | Regenerate per-package READMEs + this section |

**Creating a new primitive:**

```bash
pnpm create-prim           # Interactive wizard — creates prim.yaml, package, tests
pnpm gen                   # Regenerate all downstream files
```

**Adding a provider to an existing primitive:**

```bash
pnpm create-prim --provider   # Interactive provider scaffolder
```

**Regenerating docs after changes:**

```bash
pnpm gen:docs              # Regenerate READMEs from prim.yaml + api.ts
pnpm gen:docs --check      # Verify READMEs are fresh (CI gate)
```
<!-- END:PRIM:FACTORY -->

