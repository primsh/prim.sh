# TASKS

## Active

| Priority | ID | Task | Scope | Depends on | Status |
|---|---|---|---|---|---|
| 1 | S-1 | Fix "Fourteen primitives" copy → "Nineteen" (manifesto x2 + CTA in `agentstack/index.html`) | site/index.html | — | Done |
| 2 | S-2 | Fix `.c` CSS class collision in `agentstack/index.html` (coral vs comment gray) | site/index.html | — | Done |
| 3 | S-3 | Add missing routes to `serve.py` (mem, infer, watch + new primitives: browse, auth, code, trace) | site/serve.py | — | Done |
| 4 | S-4 | Create landing pages for new primitives (browse, auth, code, trace) | site/ | — | Done |
| 5 | S-5 | Update landing page hero count to 26 primitives, add new primitive cards | site/index.html | — | Done |
| 6 | S-6 | Add "This page is for humans. The API is for agents." line to all landing pages | site/ | — | Done |
| 7 | P-1 | Write llms.txt (root) + per-primitive llms.txt files | site/ | — | Done |
| 8 | P-2 | Add llms.txt routes to serve.py (or replace with smarter static server) | site/serve.py | P-1 | Done |
| 9 | P-3 | Set up monorepo structure (pnpm workspaces, shared x402 middleware package) | root | — | Done |
| 10 | P-4 | Build shared x402 Hono middleware package | packages/x402-middleware | P-3 | Done |
| 11 | W-1 | Design wallet.sh API surface (finalize endpoints, request/response shapes) | specs/wallet.md | — | Done |
| 12 | W-2 | Implement wallet creation (local keypair generation, encrypted keystore) | wallet/ | W-1 | Open |
| 13 | W-3 | Implement balance queries (Base USDC via RPC) | wallet/ | W-2 | Open |
| 14 | W-4 | Implement send (USDC transfer on Base) | wallet/ | W-2 | Open |
| 15 | W-5 | Integrate x402 client (`@x402/fetch` wrapper) | wallet/ | W-2 | Open |
| 16 | W-6 | Implement funding request flow (agent → owner notification → approval) | wallet/ | W-4 | Open |
| 17 | W-7 | Implement budget/spending policy engine | wallet/ | W-4 | Open |
| 18 | W-8 | Port execution journal + idempotency from Railgunner | wallet/ | W-4 | Open |
| 19 | W-9 | Port circuit breaker from Railgunner | wallet/ | W-4 | Open |
| 20 | R-1 | Deploy Stalwart (Docker on Hetzner VPS) | relay/ | — | Open |
| 21 | R-2 | Configure Stalwart: domain, DKIM, SPF, DMARC, ACME TLS | relay/ | R-1 | Open |
| 22 | R-3 | Build relay.sh wrapper: mailbox creation (Stalwart REST API) | relay/ | R-2 | Open |
| 23 | R-4 | Build relay.sh wrapper: OAuth token cache for JMAP auth per mailbox | relay/ | R-3 | Open |
| 24 | R-5 | Build relay.sh wrapper: read messages (JMAP Email/query + Email/get) | relay/ | R-4 | Open |
| 25 | R-6 | Build relay.sh wrapper: send messages (JMAP EmailSubmission/set) — receive-only first | relay/ | R-4 | Open |
| 26 | R-7 | Build relay.sh wrapper: incoming mail webhooks (Stalwart MTA Hooks) | relay/ | R-2 | Open |
| 27 | R-8 | Build relay.sh wrapper: mailbox TTL/expiry manager | relay/ | R-3 | Open |
| 28 | R-9 | Build relay.sh wrapper: custom domain support | relay/ | R-2 | Open |
| 29 | R-10 | Integrate x402 middleware (all endpoints gated by payment) | relay/ | R-3, P-4 | Open |
| 30 | SP-1 | Write spawn.sh spec (Hetzner API wrapping, VM lifecycle, pricing) | specs/ | — | Open |
| 31 | SP-2 | Build spawn.sh: VM provisioning via Hetzner Cloud API | spawn/ | SP-1 | Open |
| 32 | SP-3 | Build spawn.sh: VM lifecycle (start, stop, destroy, resize) | spawn/ | SP-2 | Open |
| 33 | SP-4 | Build spawn.sh: SSH key injection + initial setup | spawn/ | SP-2 | Open |
| 34 | SP-5 | Integrate x402 middleware | spawn/ | SP-2, P-4 | Open |
| 35 | B-1 | Batch 1: parallel agent team execution (W-2 + R-1 + SP-1) | cross-cutting | W-2 plan, R-1 plan, SP-1 plan | Open |

## Plan Docs

- P-1: `tasks/completed/p-1-llms-txt-catalog-2026-02-24.md`
- P-4: `tasks/active/p-4-x402-hono-middleware-2026-02-24.md`
- W-1: `tasks/completed/w-1-wallet-api-surface-2026-02-24.md`
- W-2: `tasks/active/w-2-wallet-creation-2026-02-24.md`
- R-1: `tasks/active/r-1-stalwart-docker-deploy-2026-02-24.md`
- SP-1: `tasks/active/sp-1-spawn-spec-2026-02-24.md`
- B-1: `tasks/active/b-1-batch-1-team-execution-2026-02-24.md`

## Backlog — Future Primitives

| Primitive | Wraps | Notes |
|-----------|-------|-------|
| store.sh | Hetzner Object Storage or Cloudflare R2 | S3-compatible API |
| vault.sh | HashiCorp Vault or custom (Stalwart-style encrypted store) | |
| dns.sh | Cloudflare DNS API | Auto-TLS via Let's Encrypt |
| cron.sh | Custom (lightweight job scheduler) | |
| pipe.sh | NATS or Redis Streams | |
| code.sh | E2B or Firecracker | Sandboxed execution |
| ring.sh | Telnyx API | Regulatory prep needed |
| mem.sh | Qdrant or Pgvector | |
| infer.sh | OpenRouter or direct provider APIs | |
| seek.sh | Brave Search API or SearXNG | |
| browse.sh | Playwright or Browserbase | |
| auth.sh | Custom OAuth broker (builds on vault.sh) | |
| watch.sh | OpenTelemetry collector | |
| trace.sh | OpenTelemetry + Jaeger | Platform-level concern |
| docs.sh | Custom OpenAPI→MCP converter | |
| id.sh | Custom (on-chain reputation) | Needs ecosystem first |
| pins.sh | Google Places API or Overture Maps | |
| hive.sh | A2A protocol (Google/Linux Foundation) | Agent discovery + collaboration via A2A agent cards, JSON-RPC 2.0, SSE. Wrap the standard, don't reinvent. Interop with Azure AI Foundry, Google agents |
| ads.sh | Custom | Needs ecosystem first |
| skills.sh | Custom marketplace + registry | Buy/sell agent skills (versioned manifests, trust/reputation, x402 billing). Start private-curated first |
| mart.sh | Amazon/eBay API proxy | Heavy regulatory |
| ship.sh | EasyPost or Shippo | |
| hands.sh | Custom gig platform | Heaviest regulatory burden |
| pay.sh | Stripe + x402 bridge | Fiat payment bridge |
| borrow.sh | Custom (on-chain escrow + interest) | Agent-to-agent USDC lending. Needs wallet.sh + id.sh |
| guard.sh | Custom + sentinel patterns | Two tiers: passive layer baked into x402-middleware (all primitives auto-scan requests/responses), active primitive for deep paid analysis. Needs ecosystem first |
| trade.sh | Broker APIs + Polymarket | Trad market + prediction market trading for agents. Needs wallet.sh |
| insure.sh | Custom (actuarial + escrow) | Agent operation insurance, refund guarantees, SLA escrow. Needs wallet.sh + watch.sh + id.sh |
| know.sh | Custom (knowledge graph service) | Structured canonical knowledge (not vector search). Typed entities, relationships, definitions. Finknow is the finance vertical proof of concept. Distinct from mem.sh (personal memory) |
| props.sh | ATTOM Data, Zillow/Redfin APIs, or Realtor.com API | Real estate data: listings, comps, valuations, property details. MLS direct access requires NAR licensing — API aggregators are the realistic path |
| mktdata.sh | Polygon.io, Unusual Whales, or similar | Market data: equities/options/crypto price feeds, historical OHLCV, options chains, earnings calendars. High-frequency micropayment revenue from research agents |
| corp.sh | Stripe Atlas API or custom | Legal complexity |

## Research Notes

### AP2 vs x402 (2026-02-24, updated 2026-02-24)
Google's Agent Payments Protocol (AP2) extends A2A+MCP for agent payments. Google + Coinbase + MetaMask + Ethereum Foundation collaborated on the [A2A x402 extension](https://github.com/google-agentic-commerce/a2a-x402), which adds crypto payments to A2A.

**Resolved questions:**
- AP2 is fiat-native (Mandates: Intent, Cart, Payment). x402 is crypto-native (EIP-3009 on Base). They are complementary, not competitive.
- The A2A x402 extension adds crypto to A2A — it is *not* dual-protocol middleware. No reference implementation exists for a single endpoint accepting both AP2 fiat and x402 crypto. If we want dual-rail, we build it ourselves.
- Facilitator centralization concern is overstated — ecosystem now includes PayAI, Meridian, x402.rs (open-source Rust), 1Shot API, Mogami. The [x402 Foundation](https://blog.cloudflare.com/x402/) (Cloudflare + Coinbase) exists to prevent single-provider lock-in.

**Action:** AP2 dual-protocol is premature. Don't build it now. Track the spec; revisit when AP2 has production adoption beyond Google.

### x402 execution layer for wallet.sh (2026-02-24)
x402 uses [EIP-3009 (Transfer With Authorization)](https://github.com/coinbase/x402/blob/main/specs/schemes/exact/scheme_exact_evm.md) for gasless USDC transfers. Agent signs an off-chain `transferWithAuthorization` message; facilitator broadcasts on-chain and pays gas. Facilitator cannot modify amount or destination.

**ERC-4337 vs EIP-7702 for guardrails:**
- ERC-4337 (full Account Abstraction) provides session keys, spend caps, and programmable validation via smart contract wallets. Heavy — requires deploying smart accounts, bundlers, paymasters.
- [EIP-7702](https://www.alchemy.com/blog/eip-7702-ethereum-pectra-hardfork) (live since Pectra, May 2025) lets EOAs temporarily delegate to smart contract code per-transaction. Gets session keys + spend caps *without* full AA overhead. Likely the better path for wallet.sh: keep EOA keys, delegate to a policy contract when needed.
- x402's EIP-3009 flow makes ERC-4337's execution layer (bundlers/paymasters) unnecessary for the payment itself, but on-chain guardrails are still needed if an agent key is compromised.

**High-frequency micropayments:**
[Cloudflare's deferred payment scheme](https://blog.cloudflare.com/x402/) decouples cryptographic handshake from settlement — aggregates multiple payments into periodic batch settlements. Directly solves the sub-cent high-frequency problem without touching the wallet layer. Track this for wallet.sh's customer-facing story.

**Recommended wallet.sh architecture:**

| Layer | What | Why |
|-------|------|-----|
| Execution | x402 + EIP-3009 | Gasless per-request micropayments, proven |
| Batching | Cloudflare deferred scheme | High-frequency agents settle periodically, not per-call |
| Guardrails | EIP-7702 delegation | Session keys + spend caps without full AA overhead |
| Future | AP2 interop | Watch the spec; don't build now |

### Wallet-first identity upgrade path (2026-02-24)
ERC-8004 uses CAIP-10 wallet addresses as root identity. DIDs layer on top non-breaking: wallet address becomes `verificationMethod` in DID Document, `alsoKnownAs` bridges old→new. No smart contract changes. Current "wallet = identity" design is correct for v1. id.sh adds DID resolution later.

## Done

- P-2 — llms.txt routes wired in `site/serve.py` (2026-02-24)
- P-1 — llms.txt root + per-primitive files (2026-02-24)

- S-6 — "This page is for humans. The API is for agents." (2026-02-24)
