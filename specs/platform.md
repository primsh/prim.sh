# AgentStack Platform Spec

> The agent-native stack. Infinite primitives. One wallet. Zero signup.

## Vision

AgentStack is a collection of independent infrastructure primitives where the customer is the agent, not the human. Every primitive accepts x402 payment as the sole authentication mechanism. An agent with a funded wallet can discover, pay for, and consume any primitive without human intervention.

Each primitive is standalone — use one or all 26. No bundling, no coupling. The wallet is the identity.

## Primitives (26)

### Platform Layer
| Primitive | Domain | Status |
|-----------|--------|--------|
| **wallet.sh** | Crypto wallets, x402 payments, owner funding | Priority 1 |
| **id.sh** | Agent reputation, trust scores, KYA | Priority 2 (deferred) |

### Core Infrastructure
| Primitive | Domain | Status |
|-----------|--------|--------|
| **spawn.sh** | VPS provisioning (wrap Hetzner/Fly) | Priority 3 |
| **store.sh** | Object storage (S3-compatible) | Backlog |
| **vault.sh** | Secrets management | Backlog |
| **dns.sh** | Domains + auto-TLS | Backlog |
| **cron.sh** | Scheduled jobs | Backlog |
| **pipe.sh** | Pub/sub messaging | Backlog |
| **code.sh** | Sandboxed code execution (lighter than spawn) | Backlog |

### Communication
| Primitive | Domain | Status |
|-----------|--------|--------|
| **relay.sh** | Email (wrap Stalwart) | Priority 2 |
| **ring.sh** | Phone/SMS (wrap Telnyx) | Backlog |

### Intelligence
| Primitive | Domain | Status |
|-----------|--------|--------|
| **mem.sh** | Vector memory / RAG | Backlog |
| **infer.sh** | Model proxy (OpenAI-compatible) | Backlog |
| **watch.sh** | Observability / structured logs | Backlog |
| **trace.sh** | Distributed tracing across primitives | Backlog |
| **docs.sh** | OpenAPI to MCP conversion | Backlog |
| **seek.sh** | Web search | Backlog |

### Agent Interaction
| Primitive | Domain | Status |
|-----------|--------|--------|
| **browse.sh** | Headless browser sessions | Backlog |
| **auth.sh** | Managed OAuth for third-party APIs | Backlog |
| **hive.sh** | Agent social graph / peer discovery | Backlog |
| **ads.sh** | Context-targeted agent ads | Backlog |

### Physical World
| Primitive | Domain | Status |
|-----------|--------|--------|
| **pins.sh** | Geolocation / places / routing | Backlog |
| **mart.sh** | Physical goods purchasing | Backlog |
| **ship.sh** | Shipping / logistics | Backlog |
| **hands.sh** | On-demand human labor | Backlog |
| **pay.sh** | Agent-to-merchant fiat payments | Backlog |
| **corp.sh** | Legal entity formation | Backlog |

Note: `pay.sh` is now the fiat payment bridge (x402-to-merchant), distinct from `wallet.sh` which handles crypto wallets and x402 payments directly.

## x402 Integration Pattern

Every primitive follows the same x402 pattern. This is the core platform contract.

### Server-side (each primitive)

```
Agent Request
    ↓
x402 Middleware (shared across all primitives)
    ↓ no payment header?
    ← 402 Payment Required
       { scheme: "exact", price: "$0.001", network: "eip155:8453", payTo: "0x..." }
    ↓ has payment header?
    → Facilitator verifies on-chain
    ↓ verified?
    → Route handler executes
    ← 200 OK + response
```

### Shared middleware package

All primitives import the same x402 middleware. This is a shared library, not a standalone service.

```
@x402/hono middleware → facilitator verification → route handler
```

### What the middleware provides
- 402 response generation with payment requirements
- Payment header parsing and facilitator verification
- Wallet address extraction (the agent's identity for the request)
- Per-route pricing configuration
- Settlement confirmation in response headers

### What each primitive provides
- Route definitions with pricing
- The actual service logic
- Its own data store (no shared DB across primitives)

## Agent Identity Model

There are no accounts. The agent's wallet address IS its identity.

- First request with a new wallet address creates an implicit "account" (just a record of the wallet)
- Subsequent requests from the same wallet address are correlated
- Resources are owned by wallet addresses
- No sessions, no cookies, no API keys, no OAuth

If a primitive needs to persist state (e.g., relay.sh stores mailboxes), the wallet address is the owner key.

## Discovery

Agents discover primitives via:

1. **llms.txt** — Machine-readable markdown at `agentstack.sh/llms.txt` listing all primitives, their endpoints, pricing, and capabilities
2. **MCP** — Each primitive exposes an MCP tool spec so agents with MCP support can discover and call primitives natively
3. **x402 Bazaar** — Register primitives in the x402 service catalog for autonomous discovery by any x402-enabled agent
4. **OpenAI function spec** — Each primitive publishes a function calling schema

## Tech Stack Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Language | TypeScript | x402 SDK is TypeScript-first. Thin HTTP wrappers — TS is ideal. |
| Runtime | Bun | Runs TypeScript natively (no build step). Fast. Native SQLite. |
| Framework | Hono | Lightweight, fast, middleware-friendly. x402 has first-party Hono middleware. Runs on Bun, Node, Cloudflare Workers. |
| Deployment | Start with single VPS (Bun), move to Cloudflare Workers | Workers gives edge deployment + native x402 support. VPS for things that need persistent state. |
| Chain | Base (Coinbase L2) | Sub-cent gas. USDC native. x402 default chain. |
| Token | USDC | Stablecoin. No price volatility. x402 standard. |
| Facilitator | Coinbase hosted (`x402.org/facilitator`) | Free tier: 1,000 tx/month. Then $0.001/tx. |
| Package manager | pnpm | Workspace support, fast, disk-efficient. |
| Lint/format | Biome | Fast, single tool. Matches Railgunner conventions. |
| Test runner | vitest | Fast, native ESM + TS. Bun-compatible. |
| Monorepo? | Yes — shared x402 middleware, shared types | Each primitive is a separate package/service but shares the middleware. |

## Monorepo Structure (proposed)

```
agentstack/
├── packages/
│   ├── x402-middleware/     # Shared Hono middleware + pricing config
│   ├── wallet/              # wallet.sh service
│   ├── relay/               # relay.sh service (wraps Stalwart)
│   ├── spawn/               # spawn.sh service (wraps Hetzner)
│   └── ...                  # future primitives
├── site/                    # Landing pages (current HTML files)
├── specs/                   # This directory
├── llms.txt                 # Machine-readable primitive catalog
└── package.json             # Workspace root
```

## Domain Strategy

- `agentstack.sh` is taken. Don't block on it — acquire later if traction justifies it.
- `wallet.sh` is available. Register it as the anchor domain.
- Other primitive domains (relay.sh, spawn.sh, etc.) — check and register opportunistically.
- For now, specs can reference `api.wallet.sh`, `api.relay.sh` etc. as target URLs. If a domain isn't available, fall back to subdomains under whatever root domain we have.

## Open Questions

1. **Single VPS vs multi-service?** Start with all primitives on one box behind a reverse proxy. Split when scale demands it.
2. **Wallet patterns** — wallet.sh adapts keystore/journal/circuit-breaker patterns. Clean implementation, self-contained.
3. **Facilitator self-hosting?** Coinbase's facilitator is free for 1k tx/month. At scale, self-hosting a facilitator removes the dependency and the per-tx fee.
