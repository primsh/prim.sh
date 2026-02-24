# TASKS

## Phase 0 — Site Fixes

| ID | Task | Status |
|----|------|--------|
| S-1 | Fix "Fourteen primitives" copy → "Nineteen" (manifesto x2 + CTA in `agentstack/index.html`) | Done |
| S-2 | Fix `.c` CSS class collision in `agentstack/index.html` (coral vs comment gray) | Done |
| S-3 | Add missing routes to `serve.py` (mem, infer, watch + new primitives: browse, auth, code, trace) | Done |
| S-4 | Create landing pages for new primitives (browse, auth, code, trace) | Done |
| S-5 | Update landing page hero count to 26 primitives, add new primitive cards | Done |
| S-6 | Add "This page is for humans. The API is for agents." line to all landing pages | Open |

## Phase 1 — Platform Foundation

| ID | Task | Spec | Status |
|----|------|------|--------|
| P-1 | Write llms.txt (root) + per-primitive llms.txt files | `specs/llms-txt.md` | Open |
| P-2 | Add llms.txt routes to serve.py (or replace with smarter static server) | `specs/llms-txt.md` | Open |
| P-3 | Set up monorepo structure (pnpm workspaces, shared x402 middleware package) | `specs/platform.md` | Done |
| P-4 | Build shared x402 Hono middleware package | `specs/platform.md` | Open |

## Phase 2 — wallet.sh

| ID | Task | Spec | Status |
|----|------|------|--------|
| W-1 | Design wallet.sh API surface (finalize endpoints, request/response shapes) | `specs/wallet.md` | Open |
| W-2 | Implement wallet creation (local keypair generation, encrypted keystore) | `specs/wallet.md` | Open |
| W-3 | Implement balance queries (Base USDC via RPC) | `specs/wallet.md` | Open |
| W-4 | Implement send (USDC transfer on Base) | `specs/wallet.md` | Open |
| W-5 | Integrate x402 client (`@x402/fetch` wrapper) | `specs/wallet.md` | Open |
| W-6 | Implement funding request flow (agent → owner notification → approval) | `specs/wallet.md` | Open |
| W-7 | Implement budget/spending policy engine | `specs/wallet.md` | Open |
| W-8 | Port execution journal + idempotency from Railgunner | `specs/wallet.md` | Open |
| W-9 | Port circuit breaker from Railgunner | `specs/wallet.md` | Open |

## Phase 3 — relay.sh

| ID | Task | Spec | Status |
|----|------|------|--------|
| R-1 | Deploy Stalwart (Docker on Hetzner VPS) | `specs/relay.md` | Open |
| R-2 | Configure Stalwart: domain, DKIM, SPF, DMARC, ACME TLS | `specs/relay.md` | Open |
| R-3 | Build relay.sh wrapper: mailbox creation (Stalwart REST API) | `specs/relay.md` | Open |
| R-4 | Build relay.sh wrapper: OAuth token cache for JMAP auth per mailbox | `specs/relay.md` | Open |
| R-5 | Build relay.sh wrapper: read messages (JMAP Email/query + Email/get) | `specs/relay.md` | Open |
| R-6 | Build relay.sh wrapper: send messages (JMAP EmailSubmission/set) — receive-only first | `specs/relay.md` | Open |
| R-7 | Build relay.sh wrapper: incoming mail webhooks (Stalwart MTA Hooks) | `specs/relay.md` | Open |
| R-8 | Build relay.sh wrapper: mailbox TTL/expiry manager | `specs/relay.md` | Open |
| R-9 | Build relay.sh wrapper: custom domain support | `specs/relay.md` | Open |
| R-10 | Integrate x402 middleware (all endpoints gated by payment) | `specs/relay.md` | Open |

## Phase 4 — spawn.sh

| ID | Task | Spec | Status |
|----|------|------|--------|
| SP-1 | Write spawn.sh spec (Hetzner API wrapping, VM lifecycle, pricing) | — | Open |
| SP-2 | Build spawn.sh: VM provisioning via Hetzner Cloud API | — | Open |
| SP-3 | Build spawn.sh: VM lifecycle (start, stop, destroy, resize) | — | Open |
| SP-4 | Build spawn.sh: SSH key injection + initial setup | — | Open |
| SP-5 | Integrate x402 middleware | — | Open |

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
| hive.sh | Custom | Needs ecosystem first |
| ads.sh | Custom | Needs ecosystem first |
| mart.sh | Amazon/eBay API proxy | Heavy regulatory |
| ship.sh | EasyPost or Shippo | |
| hands.sh | Custom gig platform | Heaviest regulatory burden |
| pay.sh | Stripe + x402 bridge | Fiat payment bridge |
| borrow.sh | Custom (on-chain escrow + interest) | Agent-to-agent USDC lending. Needs wallet.sh + id.sh |
| guard.sh | Custom + sentinel patterns | Two tiers: passive layer baked into x402-middleware (all primitives auto-scan requests/responses), active primitive for deep paid analysis. Needs ecosystem first |
| trade.sh | Broker APIs + Polymarket | Trad market + prediction market trading for agents. Needs wallet.sh |
| insure.sh | Custom (actuarial + escrow) | Agent operation insurance, refund guarantees, SLA escrow. Needs wallet.sh + watch.sh + id.sh |
| corp.sh | Stripe Atlas API or custom | Legal complexity |

## Done

(none yet)
