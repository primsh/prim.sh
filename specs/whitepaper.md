# Prim: The Self-Extending Agent Infrastructure Network

> Agents are the customers, the providers, the builders, the testers, and the marketers.

## Abstract

The cloud was built for humans. Every service — compute, storage, email, DNS, payments — requires a human to sign up, enter credentials, click through a dashboard, and manage an account. AI agents can't do any of this. They need infrastructure, but infrastructure won't let them in.

Prim is an infrastructure network where agents are the sole customers. Payment is the only credential. No signup, no GUI, no KYC. Dozens of independent primitives — from wallets to email to compute — accessible through a single protocol: x402 (USDC on Base).

But building agent infrastructure creates two bottlenecks that can't be solved by hiring more engineers:

1. **The code bottleneck** — who builds the next primitive when demand outpaces a team's capacity?
2. **The supply bottleneck** — who signs up for the provider accounts that power each primitive?

Prim solves both by making agents participants on every side of the network. Agents consume primitives, contribute new ones, pool provider capacity, test deployments, and distribute awareness. The network scales by removing the human from the supply chain.

This paper describes the architecture, the factory system that enables code contribution, the key economy (DeKeys) that enables supply-side scaling, and the economic model that aligns incentives across the network.

---

## 1. The Problem: Infrastructure Has a Human Gate

Every cloud service assumes a human customer:

- **Compute** (AWS, Hetzner, DigitalOcean) — requires account creation, billing setup, SSH key management via web dashboard
- **Email** (SendGrid, Postmark, Gmail) — requires domain verification, identity confirmation, deliverability reputation built over weeks
- **Storage** (S3, R2, GCS) — requires account, billing, access key generation via console
- **DNS** (Cloudflare, Route53) — requires account, domain transfer, nameserver configuration
- **Payments** (Stripe, PayPal) — requires business verification, bank account, KYC

An agent that needs to send an email, store a file, or spin up a server cannot do so without a human intermediary. This is the fundamental bottleneck of autonomous agent infrastructure.

### 1.1 Existing approaches

**Platform model** (Agentuity, Replit Agent) — developers deploy agents to a managed platform. The platform provides infrastructure. The developer is the customer, not the agent. Requires signup, dashboards, billing pages. Scales with developer adoption.

**Broker model** (Sapiom) — a payment middleware sits between agents and existing vendors (Twilio, AWS). The broker manages API keys, billing, and spending controls on fiat rails. The platform developer is the customer. Scales with vendor integrations (human-driven).

**Protocol model** (Stripe ACP, Google UCP) — standardized checkout protocols for agent-mediated consumer commerce. Agents buy consumer goods on behalf of humans. Fiat rails (saved cards, Google Pay). Solves agent-to-merchant transactions, not agent-to-infrastructure.

None of these solve the core problem: **agents buying infrastructure for themselves, without a human in the loop, at a scale that outpaces human capacity to provision it.**

### 1.2 The x402 unlock

x402 is an open payment protocol (Coinbase, 2025) that repurposes HTTP 402 ("Payment Required") for machine-native payments. An agent requests a resource, receives a 402 with pricing, signs a USDC payment on Base, and retries with a payment header. The server verifies on-chain settlement and serves the resource.

x402 eliminates the need for accounts, API keys, OAuth tokens, or billing pages. Payment IS the credential. An agent with a funded wallet can consume any x402 service without prior registration.

Prim builds on this foundation: every primitive is an x402 endpoint. The agent's wallet address is its identity. First request creates the implicit account. No signup, no GUI, no human.

---

## 2. Architecture: Independent Primitives

Prim is not a platform. It is a collection of independent infrastructure services — **primitives** — each accessible via REST with x402 payment.

### 2.1 Primitive categories

| Category | Primitives | What they provide |
|----------|-----------|-------------------|
| **Identity** | wallet, id, auth, domain | Wallets, reputation, OAuth brokering, DNS/domains |
| **Crypto** | faucet, pay, token | Testnet faucet, fiat payments, token operations |
| **Compute** | spawn, cron, code | VPS provisioning, scheduling, sandboxed execution |
| **Storage** | store, vault, mem | Object storage, secrets, vector memory |
| **Comms** | email, ring, browse, pipe | Email, phone/SMS, headless browsers, messaging |
| **Intelligence** | infer, search, seek, imagine, docs | Model routing, web search, deep research, image generation, API documentation |
| **Ops** | watch, trace, track, hive, ship | Observability, tracing, analytics, agent coordination, shipping |
| **Physical** | pins, mart, hands, corp, ads | Geolocation, purchasing, human labor, legal entities, context-targeted ads |
| **Meta** | create | Primitive scaffolding and validation |

### 2.2 Design principles

1. **Each primitive is independent.** No shared database. No coupling between primitives. Use one or all of them.
2. **x402 payment is the auth layer.** Every endpoint returns 402 → agent pays → gets resource. The wallet address is the identity.
3. **Each primitive wraps existing services.** email.sh wraps Stalwart. spawn.sh wraps Hetzner/DigitalOcean. store.sh wraps Cloudflare R2. Prim is a shell — thin API layers that make human-gated services accessible to agents.
4. **Pay per call.** Micropayments via x402. Every request is priced individually. No subscriptions, no metering, no minimums.

### 2.3 Multi-interface access

Every primitive is accessible through four interfaces:

- **REST** — raw HTTP with x402 payment headers (always available, no install)
- **CLI** — `prim <primitive> <command>` (compiled binary, local key management)
- **MCP** — Model Context Protocol tools (Claude, Cursor, any MCP client)
- **OpenAI function calling** — JSON schemas for OpenAI-compatible agent frameworks

All interfaces are **code-generated** from a single specification file (`prim.yaml`). See Section 3.

---

## 3. The Factory: Solving the Code Bottleneck

A single human team cannot build every primitive and keep pace with demand for new ones. The factory is a codegen pipeline that reduces "build a new primitive" to "write a spec file."

### 3.1 prim.yaml — the primitive specification

Every primitive is defined by a declarative YAML file containing:

- Identity (name, endpoint, status, category)
- API routes (method, path, request/response types, pricing, errors)
- Provider configuration (external services, API keys, failover)
- Deployment configuration (port, body limits, systemd dependencies)
- Marketing content (tagline, hero example, landing page sections)
- Interface flags (MCP, CLI, OpenAI, REST)
- Gate configuration (coverage threshold, approval requirements)

A prim.yaml is ~100-200 lines. It fully specifies a primitive without writing any implementation code.

### 3.2 The codegen pipeline

```
prim.yaml
  ↓
  ├→ create-prim     → src/index.ts, api.ts, service.ts, provider.ts
  ├→ gen:openapi      → OpenAPI 3.1 spec (intermediate SOT)
  │   ├→ gen:mcp      → MCP tool definitions
  │   ├→ gen:cli      → CLI command handlers
  │   ├→ gen:openai   → OpenAI function schemas
  │   └→ gen:docs     → README, llms.txt entries
  ├→ gen:tests        → smoke tests (5-check contract)
  └→ gen:prims        → landing page cards, pricing, status badges
```

From one spec file, the factory generates:

- **Implementation scaffolds** — Hono route handlers, TypeScript types, service layer stubs, provider interfaces
- **API documentation** — OpenAPI 3.1 specs with pricing extensions
- **Agent interfaces** — MCP tools, CLI commands, OpenAI function schemas
- **Tests** — smoke tests enforcing a 5-check contract (app defined, health check, middleware wired, routes work, errors handled)
- **Marketing** — landing page cards, llms.txt entries, README files

### 3.3 The 5-check smoke test contract

Every primitive, whether human-written or agent-contributed, must pass:

1. App default export is defined
2. `GET /` → 200 with `{ service: "<name>.sh", status: "ok" }`
3. x402 middleware is registered with correct pricing
4. Primary route with valid input → 200 with valid response shape
5. Primary route with invalid input → 400

Tests are auto-generated from prim.yaml and run in CI. A contributed primitive that passes all 5 checks is structurally sound.

### 3.4 Agent contribution flow

The factory enables agents to contribute new primitives:

```
Agent discovers missing capability
  → calls create.sh POST /v1/scaffold with prim.yaml spec       ← live
  → factory generates complete package (routes, types, tests, docs)
  → agent implements service layer (the actual provider integration)
  → opens a PR (pr.sh planned — Phase 3)
  → GHA runs: schema validation → codegen verification → smoke tests
  → ephemeral test agent exercises the new prim (planned — Phase 3)
  → dedup check via semantic search (planned — Phase 3)
  → pnpm gen regenerates all downstream artifacts
  → new primitive is live and discoverable
```

Today, create.sh scaffolds packages and the factory generates boilerplate. The remaining steps — automated PR creation, ephemeral testing, semantic dedup — are planned for Phase 3 (see Section 9).

---

## 4. DeKeys: Solving the Supply Bottleneck

The factory solves code contribution. But every primitive wraps an external service that requires a provider API key — and getting that key requires a human to sign up for an account. One human maintaining dozens of primitives with 1-3 providers each is ~50+ account signups, plus redundancy, plus new providers. The supply side is bottlenecked by human capacity.

DeKeys is a capacity marketplace where agents contribute underutilized API keys and earn credits to spend across the prim ecosystem.

> Contribute your keys, feed the machine.

### 4.1 The insight: idle capacity is everywhere

Every agent's human has already signed up for API services. Tavily, Serper, OpenAI, SendGrid, Twilio — humans provision these keys for their agents. Most sit underutilized. Free tiers especially: an agent gets 2,500 Tavily queries/month and uses 300.

This idle capacity is fragmented across thousands of agents. DeKeys aggregates it into a shared pool — BitTorrent for API infrastructure.

```
Agent A: Tavily key, 2,500/mo free tier, uses 300   → 2,200 idle
Agent B: Serper key, 2,500/mo free tier, uses 100   → 2,400 idle
Agent C: needs web search, has no key
  → search.sh draws from the DeKeys pool
  → Agent C gets search results
  → Agents A and B earn credits from their idle capacity
```

### 4.2 Keys as a medium of exchange

API keys have the properties of currency within the prim ecosystem:

| Property | How it manifests |
|----------|-----------------|
| **Scarcity** | Free tiers have rate limits (supply cap) |
| **Fungibility** | One Tavily key with 2,500 queries = another Tavily key with 2,500 queries |
| **Demand** | Agents need provider access to use prims |
| **Measurable value** | Capacity translates directly to USDC equivalent |

x402 (USDC) and DeKeys (key capacity) run as parallel mediums of exchange:

- **Agents with USDC** — pay per call via x402
- **Agents with keys** — contribute capacity, earn credits, spend credits on any prim
- **Agents with both** — choose whichever is cheaper per transaction

### 4.3 Credit mechanics

Contributing a key earns credits proportional to actual usage of the contributed capacity:

```
credit_value = calls_served_by_key * prim_price_per_call
```

Example: Tavily free tier = 2,500 queries/month. search.sh charges $0.001/query.

- Maximum monthly credit earning: 2,500 * $0.001 = $2.50
- Credits earned per actual use (when the pool selects your key), not per raw capacity
- Credits redeemable as USDC (withdrawal to wallet) or spendable on any prim

### 4.4 Free tier arbitrage

The most powerful incentive: an agent signs up for free tiers across many providers, contributes all keys, and earns credits worth more than any single free tier.

```
Contribute 10 free-tier keys across different providers
  → combined capacity: ~25,000 API calls/month
  → credit earning: ~$25/month
  → spend on: spawn.sh servers, store.sh storage, email.sh mailboxes
  → net effect: free infrastructure funded by pooled idle capacity
```

The agent transforms fragmented free tiers into a unified infrastructure budget. The more services it contributes to, the more infrastructure it can consume.

### 4.5 Architecture: the key proxy

**Critical security property: prims never see raw keys.**

DeKeys acts as a proxy layer between primitives and external providers:

```
search.sh receives search query from agent
  → calls dekeys.sh POST /v1/proxy
    → DeKeys selects a pooled Tavily key (round-robin / least-recently-used)
    → DeKeys makes the Tavily API call with the raw key
    → DeKeys returns the result to search.sh
  → search.sh returns result to agent
```

The key never leaves DeKeys. A compromised primitive cannot exfiltrate pooled keys because it never sees them. The proxy is the security boundary.

### 4.6 DeKeys API surface

| Endpoint | Purpose |
|----------|---------|
| `POST /v1/keys/contribute` | Donate a key (encrypted, with provider + tier metadata) |
| `POST /v1/keys/proxy` | Make an upstream call through the pool (returns result, never exposes key) |
| `GET /v1/keys/capacity` | Check available pool capacity per provider |
| `GET /v1/keys/balance` | Check earned credits from contributions |
| `DELETE /v1/keys/revoke` | Instantly revoke a contributed key |
| `GET /v1/keys/health` | Key health status (rate limit remaining, errors) |

### 4.7 Key lifecycle

1. **Contribution** — agent donates key via encrypted channel. Health check validates it against the provider API. Key enters pool with metadata (provider, tier, rate limit, expiry).
2. **Serving** — pool serves requests via proxy endpoint. Round-robin or least-recently-used selection. Per-key rate limit enforcement. Usage logged. Credits accrue to contributor.
3. **Monitoring** — continuous health checks detect revoked or exhausted keys. Dead keys auto-removed. Contributors notified. Pool rebalances.
4. **Revocation** — contributors can revoke keys instantly. Key removed from pool. Pending credits still paid out.

### 4.8 Provider incentive alignment

Providers benefit from DeKeys, not despite it:

| Provider concern | DeKeys response |
|-----------------|-----------------|
| "Agents are abusing our free tier" | Per-key rate limiting enforces tier constraints better than individual agents would |
| "We're losing paid conversions" | When pooled capacity is exhausted, Prim upgrades to paid plans — providers get enterprise customers they didn't have to market to |
| "ToS prohibits key sharing" | Keys are used on behalf of the contributor, through a managed proxy, within tier limits — functionally identical to a single user's agent making calls |
| "We want to be the default for agents" | DeKeys pools ensure high utilization of contributed keys — providers get usage metrics and API lock-in |

---

## 5. The Five Agent Roles

Agents in the Prim network are not just consumers. They participate on every side:

### 5.1 Consumer

The primary role. An agent with a funded wallet calls prim endpoints to get infrastructure. Email, storage, compute, search — pay per call, no signup.

### 5.2 Provider (DeKeys)

Agents contribute idle API keys to the DeKeys pool. Their spare capacity powers primitives for other agents. They earn credits proportional to usage of their contributed keys.

### 5.3 Builder

Agents contribute new primitives via the factory pipeline. Write a prim.yaml spec → create.sh scaffolds the package → implement the service layer → open a PR → CI validates → merge. Today this requires human review; Phase 3 automates PR creation and merge gating.

### 5.4 Tester

When a new primitive is contributed, it must pass the 5-check smoke test contract in CI (structural correctness, response shapes, error handling). In Phase 3, spawn.sh will provision ephemeral test agents to exercise every endpoint against the OpenAPI spec, including payment flow validation.

### 5.5 Marketer

Agents that use and value the network distribute awareness. An agent can post about prim on social channels, recommend prim in conversations, or include prim endpoints in tool configurations shared with other agents. Discovery scales with usage, not marketing spend.

---

## 6. Economic Model

### 6.1 Revenue

Every paid prim call generates x402 revenue (USDC on Base). Pricing is per-call, set per-route in each primitive's prim.yaml. Typical range: $0.001 (search query) to $0.50 (server provisioning).

### 6.2 Costs

Each primitive wraps an external provider. Provider costs are the primary expense:

- **search.sh** — Tavily API ($0.001/query at scale)
- **spawn.sh** — Hetzner/DigitalOcean API (pass-through VM costs)
- **store.sh** — Cloudflare R2 (pass-through storage costs)
- **email.sh** — Stalwart (self-hosted, compute cost only)

Margin = prim price per call - provider cost per call.

### 6.3 DeKeys economics

DeKeys introduces a parallel economy:

- **Contributors** earn credits = actual usage * prim price per call
- **Credits** are redeemable as USDC or spendable on prims
- **Credit redemption** is funded by x402 revenue from non-contributing agents (agents who pay USDC, not credits)

When a contributing agent's key serves a request, the revenue comes from the consuming agent's x402 payment. A portion goes to the contributor as credits. The remainder is margin.

### 6.4 Network effects

The network exhibits positive externalities on both sides:

**Demand side:** More agents using prim → more primitives needed → more contribution incentive → more primitives available → more agents attracted.

**Supply side:** More keys contributed → more provider capacity → higher reliability → more agents trust the network → more keys contributed.

**Cross-side:** More primitives (builders) attract more agents (consumers). More agents attract more key contributions (providers). More capacity attracts more builders. The flywheel compounds.

### 6.5 Prior art

| Model | Resource | Incentive | Prim parallel |
|-------|----------|-----------|---------------|
| **BitTorrent** | Bandwidth | Tit-for-tat (upload to download) | Contribute keys to earn credits |
| **Filecoin** (DePIN) | Storage | Token rewards for storing data | Credit rewards for contributing API capacity |
| **Helium** (DePIN) | Wireless coverage | Token rewards for running hotspots | Credit rewards for contributing keys |
| **Airbnb** | Housing | Revenue from idle rooms | Credits from idle API capacity |
| **Capacity Provision Networks** (Clearwater & Kauffman, 2008) | Compute | Cooperative surplus sharing | Pooled key capacity with credit distribution |

The key difference from DePIN: contributing an API key has **near-zero marginal cost**. No hardware to buy, no electricity to pay, no physical installation. The supply-side barrier is lower than any existing DePIN network, which should accelerate bootstrapping.

---

## 7. Trust and Security

### 7.1 Key isolation

The key proxy architecture ensures:

- Prims never see raw provider keys (proxy boundary)
- Keys encrypted at rest (AES-256-GCM)
- Per-key usage tracking (which agent used which key, how many calls)
- Rate limits enforced at the proxy layer (never exceed tier limits)

### 7.2 Contributed code

Agent-contributed primitives are validated through:

- **Schema validation** — prim.yaml must conform to the specification
- **Codegen verification** — factory must produce valid output from the spec
- **5-check smoke tests** — structural correctness enforced by auto-generated tests
- **Ephemeral test agents** (planned) — spawn.sh will provision test agents to exercise every endpoint
- **Semantic dedup** (planned) — mem.sh will check for overlapping functionality (>80% similarity flags human review)
- **Sandboxed execution** — contributed prims run in isolated containers, no access to other prims' state

### 7.3 Payment security

x402 provides:

- On-chain settlement (USDC on Base) — tamper-proof, verifiable
- Per-request payment — no stored credentials, no billing accounts
- Facilitator verification — independent third party confirms payment
- Circuit breaker — wallet.sh can pause all payments network-wide

### 7.4 Open questions

1. **Malicious contributions** — static analysis and sandboxing catch structural issues, but a prim that subtly exfiltrates data through its provider integration is harder to detect. Human review may be required for prims that touch sensitive APIs.
2. **Key custody liability** — if DeKeys is compromised, every pooled key is at risk. The proxy architecture limits exposure (keys never leave DeKeys), but the DeKeys service itself is a high-value target.
3. **Sybil resistance** — an attacker could contribute many low-quality keys to earn credits, then spend them. Minimum key health thresholds and reputation scoring (id.sh) mitigate this.
4. **Provider ToS** — pooling keys across agents may violate terms of service. Legal framing matters: "capacity contribution under the donor's account" vs. "credential sharing."

---

## 8. Competitive Positioning

### 8.1 The agent commerce landscape (Feb 2026)

| Protocol / Company | What agents buy | Payment rail | Customer |
|-------------------|----------------|--------------|----------|
| **x402** (Coinbase) | Machine services | Crypto (USDC on Base) | Agents directly |
| **ACP** (OpenAI/Stripe) | Consumer goods for humans | Fiat (saved cards) | Merchants |
| **UCP** (Google) | Consumer goods for humans | Fiat (Google Pay) | Retailers |
| **Sapiom** | Access to existing APIs | Fiat (usage-based billing) | Platform developers |
| **Agentuity** | Managed agent hosting | Fiat (subscription) | Developers |
| **Prim** | Infrastructure primitives | Crypto (x402) + DeKeys credits | Agents directly |

### 8.2 Differentiation

**Prim is the only network where agents participate on all five sides** — consumer, provider, builder, tester, marketer. Every other approach requires humans on the supply side (developers building integrations, ops teams managing accounts, marketing teams driving adoption).

Prim's supply side scales with its demand side. More agents → more keys contributed → more prims built → more capacity available → more agents attracted. The human is not in the loop.

---

## 9. Roadmap

### Phase 1: Foundation (current)

- Core primitives live on x402 (wallet, store, spawn, search, faucet)
- Factory codegen pipeline operational
- MCP, CLI, OpenAI interfaces generated from prim.yaml
- Single-operator provider keys

### Phase 2: First paying agents

- Mainnet switchover (Base mainnet, real USDC)
- Private beta with pre-funded wallets
- Dogfood: internal agents (Cortex, OpenClaw) using prim
- Community beta via OpenClaw network

### Phase 3: Agent contribution

- create.sh as a service (scaffold via API)
- pr.sh + issue.sh (GitHub integration primitives)
- Auto-test pipeline (GHA + spawn.sh ephemeral test agents)
- First agent-contributed primitive merged

### Phase 4: DeKeys

- Key proxy architecture (security boundary)
- Key contribution + health monitoring
- Credit system (earn from contributions, spend on prims)
- Credit-USDC redemption
- Provider capacity dashboard

### Phase 5: Network effects

- Free tier arbitrage incentives
- Reputation scoring (id.sh integration)
- Cross-side network effects compound
- Agent-driven marketing and discovery

---

## 10. Conclusion

The cloud was built for humans. Prim rebuilds it for agents.

The factory removes the human from the code supply chain. DeKeys removes the human from the provider supply chain. x402 removes the human from the payment flow. What remains is a self-extending infrastructure network where agents are the customers, the providers, the builders, the testers, and the marketers.

Every service requires a human. This one doesn't.
