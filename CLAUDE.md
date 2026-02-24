# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

**AgentStack** — the agent-native cloud. A collection of 26 independent infrastructure primitives where the customer is the agent, not the human. Every primitive accepts x402 payment (USDC on Base) as the sole authentication mechanism. No signup, no GUI, no KYC.

The project has two layers:
1. **Marketing site** — Static HTML landing pages (current state, `site/` equivalent)
2. **Primitives** — Actual services being built (wallet.sh, relay.sh, spawn.sh, etc.)

## Dev Commands

```bash
# Primitives (after P-3 monorepo setup)
pnpm install                              # Install all deps
bun run packages/wallet/src/index.ts      # Run wallet.sh locally
bun run packages/relay/src/index.ts       # Run relay.sh locally
pnpm -r check                            # Lint + typecheck + test (all packages)
pnpm -r test                             # Tests only
pnpm -r lint                             # Biome lint

# Landing pages (current, pre-monorepo)
python serve.py                           # Serves on 100.91.44.60:8892
# After P-3: python site/serve.py
```

## Project Structure (after P-3 monorepo setup)

```
agentstack/
├── packages/
│   ├── x402-middleware/      # @agentstack/x402-middleware (shared)
│   ├── wallet/               # @agentstack/wallet (wallet.sh)
│   ├── relay/                # @agentstack/relay (relay.sh)
│   └── spawn/                # @agentstack/spawn (spawn.sh)
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

Landing pages are at root level (`spawn/index.html`, `relay/index.html`, etc.). `serve.py` is at root. No `packages/` dir yet. P-3 migrates to the structure above.

## Primitives (26)

Core: wallet, relay, spawn, store, vault, dns, cron, pipe, code
Communication: ring, browse
Intelligence: mem, infer, seek, docs
Operations: watch, trace, auth, id
Physical world: pins, mart, ship, hands, pay, corp
Social: hive, ads

## Tech Stack

- **TypeScript + Bun** — Bun runs TS natively, no build step. `bun run src/index.ts` just works.
- **Hono** — Web framework. Lightweight, middleware-friendly. x402 has first-party Hono middleware.
- **pnpm workspaces** — Monorepo. Each primitive is `packages/<name>/`.
- **Biome** — Lint + format (matches Railgunner conventions).
- **vitest** — Test runner.
- **x402** — Payment protocol (Coinbase). USDC on Base chain. Sub-cent gas.

## Key Architecture Decisions

- **x402 payment** is the auth layer. Every endpoint returns 402 → agent pays → gets resource.
- **Each primitive is independent.** No shared DB. Shared `@agentstack/x402-middleware` package only.
- **wallet.sh** is the keystone — adapts patterns from `~/Developer/railgunner` (encrypted keystore, execution journal, circuit breaker).
- **relay.sh** wraps Stalwart Mail Server (Rust, JMAP + REST API).
- **spawn.sh** wraps Hetzner Cloud API.

## Build Priority

1. wallet.sh — Crypto wallets + x402 integration (foundation for everything)
2. relay.sh — Email (wraps Stalwart, receive-only first)
3. spawn.sh — VPS provisioning (wraps Hetzner)
4. llms.txt — Machine-readable primitive catalog

## Landing Page Design System

Dark-mode, monospace, CSS custom properties:
- `--bg: #0a0a0a`, `--surface: #111`, `--text: #e0e0e0`, `--muted: #666`
- Font: `'SF Mono', SFMono-Regular, 'Cascadia Code', Consolas, monospace`
- Each primitive sets `--accent` to its unique color
- Color utility classes: `.g` green, `.b` blue, `.r` red, `.p` purple, `.o` orange, `.cy` cyan, `.y` yellow, `.pk` pink, `.gl` gold, `.t` teal, `.m` magenta, `.l` lime, `.c` coral, `.i` indigo, `.v` violet, `.z` azure, `.br` brown, `.e` emerald, `.s` slate, `.w` text

## Related Projects

- **railgunner** (`~/Developer/railgunner`) — Polygon wallet ops tool. Source of wallet.sh patterns (keystore, journal, circuit breaker). JS/Node, ~5.8k LOC.
