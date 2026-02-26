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

# Landing pages (current, pre-monorepo)
python serve.py                           # Serves locally
# After P-3: python site/serve.py
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
│   ├── serve.py              # Dev server
│   └── <primitive>/index.html
├── specs/                    # Product specs
├── tasks/                    # Plan docs (active/ and completed/)
├── TASKS.md                  # Phased roadmap
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

**Pattern**: `@primsh/x402-middleware` is mocked as a passthrough via `vi.mock` so the handler is reachable. Check 3 uses a `vi.fn()` spy on `createAgentStackMiddleware` to verify it was registered with the correct config — this is a structural test (middleware is wired), not a runtime test (middleware returns 402). The runtime 402 behavior is covered by the gate runner's `deployed → live` check, which POSTs to the live endpoint and asserts 402.

## Landing Page Design System

Dark-mode, monospace, CSS custom properties:
- `--bg: #0a0a0a`, `--surface: #111`, `--text: #e0e0e0`, `--muted: #666`
- Font: `'SF Mono', SFMono-Regular, 'Cascadia Code', Consolas, monospace`
- Each primitive sets `--accent` to its unique color
- Color utility classes: `.g` green, `.b` blue, `.r` red, `.p` purple, `.o` orange, `.cy` cyan, `.y` yellow, `.pk` pink, `.gl` gold, `.t` teal, `.m` magenta, `.l` lime, `.c` coral, `.i` indigo, `.v` violet, `.z` azure, `.br` brown, `.e` emerald, `.s` slate, `.w` text

