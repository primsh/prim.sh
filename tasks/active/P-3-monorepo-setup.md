# P-3: Set Up Monorepo Structure

## Context

AgentStack is currently a collection of static HTML landing pages with no build tooling, no git, and no package management. We need to initialize the project as a proper TypeScript monorepo that can host the shared x402 middleware and individual primitive services while preserving the existing landing pages.

## Goals

- Single git repo with pnpm workspaces
- Shared x402 middleware package importable by all primitives
- Each primitive is an independent package with its own deps, entry point, and tests
- Landing pages preserved and still servable
- CI-ready (lint, typecheck, test from root)

## Structure

```
agentstack/
├── packages/
│   ├── x402-middleware/           # @agentstack/x402-middleware
│   │   ├── src/
│   │   │   ├── index.ts          # Re-exports middleware + types
│   │   │   ├── middleware.ts     # Hono x402 payment middleware wrapper
│   │   │   └── types.ts         # Shared types (RouteConfig, PaymentResult, etc.)
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── wallet/                   # @agentstack/wallet (wallet.sh)
│   │   ├── src/
│   │   │   ├── index.ts          # Hono app entry point
│   │   │   ├── routes/           # Route handlers
│   │   │   └── services/         # Business logic
│   │   ├── test/
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── relay/                    # @agentstack/relay (relay.sh)
│   │   └── (same pattern)
│   │
│   └── spawn/                    # @agentstack/spawn (spawn.sh)
│       └── (same pattern)
│
├── site/                         # Landing pages (moved from root)
│   ├── agentstack/index.html
│   ├── spawn/index.html
│   ├── wallet/index.html         # Renamed from pay/ or new
│   ├── relay/index.html
│   ├── ... (all 26 primitive landing pages)
│   ├── index.html                # Root landing page
│   └── serve.py                  # Dev server (updated paths)
│
├── specs/                        # Product specs (stays at root)
├── tasks/                        # Task tracking (stays at root)
├── TASKS.md
├── CLAUDE.md
├── .gitignore
├── package.json                  # Workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json            # Shared TS config
└── biome.json                    # Shared lint/format (matches Railgunner tooling)
```

## Files to Create

### pnpm-workspace.yaml
```yaml
packages:
  - "packages/*"
```

### Root package.json
- `name`: "agentstack"
- `private`: true
- Scripts: `test`, `check` (lint + typecheck + test), `lint`, `format`, `typecheck`
- DevDeps: `typescript`, `@biomejs/biome`

### tsconfig.base.json
- Target: ESNext, module: ESNext, moduleResolution: bundler
- Strict mode
- Each package extends this with its own paths

### .gitignore
- `node_modules/`, `dist/`, `.env`, `*.db`, `server.log`

### biome.json
- Double quotes, tabs or spaces (match Railgunner conventions)
- Lint rules aligned with Railgunner's biome.json

## Migration Steps

1. `git init` in agentstack root
2. Move landing page files into `site/` subdirectory
3. Update `serve.py` paths to reference `site/` prefix
4. Create root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `biome.json`, `.gitignore`
5. Create `packages/x402-middleware/` skeleton (package.json, tsconfig.json, src/index.ts)
6. Create `packages/wallet/` skeleton
7. Create `packages/relay/` skeleton
8. `pnpm install`
9. Verify: `bun run packages/wallet/src/index.ts` starts (even if it's just a hello-world Hono app)
10. Verify: `pnpm -r check` passes (lint + typecheck + test with empty skeletons)
11. Initial commit

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Runtime | Bun | Runs TypeScript natively — no build step, no tsc. Fast startup. Native SQLite driver (useful for wallet.sh journal). |
| Package manager | pnpm | Workspace support, fast, disk-efficient. Bun can also run pnpm workspaces. |
| Linter/formatter | Biome | Matches Railgunner. Fast. Single tool for lint + format. |
| TS config | Strict, ESNext | Modern, catches bugs. Each package extends base. |
| Landing pages | Move to `site/` | Keeps root clean. Primitive dirs (spawn/, relay/, etc.) no longer conflict with package dirs. |
| Test runner | vitest | Fast, native ESM, TS support. Bun-compatible. |

## Open Questions

1. **Landing page dir names vs package dir names** — Currently `spawn/index.html` is at root level. Moving to `site/spawn/index.html` avoids conflict with `packages/spawn/`. Alternative: keep landing pages at root and put code in `packages/` — no conflict since different dirs. Leaning toward `site/` move for clarity.
2. **Deploy target** — Each package needs a `dev` and `start` script. Bun runs Hono apps directly: `bun run src/index.ts`. Cloudflare Workers support comes later.

## Dev Commands (after setup)

```bash
pnpm install                              # Install all deps
bun run packages/wallet/src/index.ts      # Run wallet.sh locally
bun run packages/relay/src/index.ts       # Run relay.sh locally
pnpm -r check                            # Lint + typecheck + test (all packages)
pnpm -r test                             # Tests only
pnpm -r lint                             # Biome lint
pnpm -r format                           # Biome format
python site/serve.py                      # Serve landing pages
```

## Before Closing

- [ ] `pnpm install` succeeds from clean checkout
- [ ] `bun run packages/wallet/src/index.ts` starts a Hono server
- [ ] `pnpm -r check` passes (lint + typecheck + test)
- [ ] `python site/serve.py` still serves landing pages correctly
- [ ] All 26 landing page routes work after path migration
- [ ] Initial git commit with clean history
