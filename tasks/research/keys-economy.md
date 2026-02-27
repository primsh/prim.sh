# keys.sh — The Key Economy

## The Problem

Prim can't scale with one human signing up for provider accounts. Every prim wraps an external service (Tavily, Hetzner, DigitalOcean, Stalwart, NameSilo, Circle). Each needs a human to create an account, generate an API key, and add it to `/etc/prim/*.env`. One human, 27 prims, 1-3 providers each. That's ~50 signups, plus redundancy, plus new providers as they launch. The supply side is bottlenecked by a single person.

Meanwhile, every agent's human has already signed up for these services. Agents carry API keys they barely use. Free tiers sit idle. The supply exists — it's just fragmented across thousands of agents.

## The Idea

**keys.sh** — a capacity marketplace where agents contribute underutilized API keys and earn credits to spend across the prim ecosystem. BitTorrent for infrastructure: every consumer is also a provider.

```
Agent A has Tavily key (2,500/mo free tier, uses 300)
Agent B has Serper key (2,500/mo free tier, uses 100)
Agent C needs web search, has no key
  → search.sh draws from the key pool
  → Agent C pays in USDC or credits
  → Agents A and B earn credits from spare capacity
```

## Keys as Currency

API keys aren't just credentials. They're **capacity tokens** with measurable economic properties:

- **Scarcity** — free tiers have rate limits (supply cap)
- **Fungibility** — one Tavily key with 2,500 queries/month is worth the same as another
- **Demand** — agents need provider access to function
- **Measurable value** — capacity translates directly to USDC equivalent

```
1 Tavily free-tier key = 2,500 searches/month
search.sh charges $0.001/search
key capacity value = $2.50/month
contributor earns $2.50/month in prim credits
```

Two mediums of exchange run in parallel:
- **USDC (via x402)** — agents with funded wallets pay per call
- **Key credits** — agents without USDC contribute keys, earn credits, spend credits on other prims

## Why Providers Won't Kill This

The provider calculus favors allowing it:

- **Blocking it** = "We're the company that blocked AI agents from our free tier." Bad look when every provider is racing to be the default in agent toolchains.
- **Allowing it** = Free distribution. Their free tier gets used (good for metrics). Agents learn their API format (lock-in). When usage outgrows free tiers, someone pays for an upgrade — either prim or the contributing agent's human.
- **Prim's rate limiting protects providers** — centralized enforcement of per-key limits is better than individual agents hammering keys unsupervised.

The only crackdown scenario: pooling causes abuse (spam, scraping, ToS violations). Prim's per-key rate limiting and usage tracking actively prevents this.

**Legal nuance:** Most API ToS prohibit key sharing. Free tiers have "single user" clauses. The argument: the agent IS the user's agent, acting on their behalf. But pooling across agents from different humans is harder to defend. This is the Napster risk — it works until a provider sends a cease and desist. Mitigation: position donated keys as "capacity contributions under the donor's account" rather than "shared credentials."

## Architecture

### keys.sh is distinct from vault.sh

| | vault.sh | keys.sh |
|---|---------|---------|
| **Purpose** | Store secrets (private, per-agent) | Key capacity marketplace (shared, pooled) |
| **Who sees the key** | Only the owner | Nobody — key proxy makes upstream calls |
| **Value model** | Storage fee (x402) | Capacity contribution = credits |
| **Analogy** | Safe deposit box | BitTorrent tracker |

### Key proxy layer (critical security boundary)

Prims never touch raw keys. keys.sh acts as a proxy:

```
search.sh receives query
  → calls keys.sh POST /v1/proxy
    → keys.sh selects a pooled Tavily key (round-robin, least-recently-used)
    → keys.sh makes the Tavily API call with the raw key
    → keys.sh returns the result to search.sh
  → search.sh returns result to agent
```

The key never leaves keys.sh. Prims are sandboxed from credentials. A compromised prim can't exfiltrate pooled keys because it never sees them.

### API surface

- `POST /v1/keys/contribute` — donate a key (encrypted, with provider name + tier metadata)
- `GET /v1/keys/capacity` — check available pool capacity per provider
- `POST /v1/keys/proxy` — make an upstream API call through the key pool (returns result, never exposes key)
- `GET /v1/keys/balance` — check earned credits from contributions
- `DELETE /v1/keys/revoke` — donor revokes a contributed key (instant)
- `GET /v1/keys/health` — key health status (rate limit remaining, last successful call)

### Key lifecycle

```
1. Agent contributes key via POST /v1/keys/contribute
   → key encrypted at rest (vault.sh integration)
   → health check validates key against provider API
   → key enters pool with metadata (provider, tier, rate limit, expiry)

2. Pool serves requests via POST /v1/keys/proxy
   → round-robin or least-recently-used selection
   → per-key rate limit enforcement (never exceed tier limits)
   → usage logged per key (calls, bytes, errors)
   → credits accrue to contributor's wallet

3. Contributor can revoke at any time
   → DELETE /v1/keys/revoke
   → key immediately removed from pool
   → pending credits still paid out

4. Exhausted/revoked keys auto-removed
   → health check detects 401/403 → key marked dead
   → contributor notified
   → pool rebalances
```

## Incentive Model

### Credit mechanics

Contributing a key earns credits proportional to the key's capacity:

```
credit_rate = (tier_rate_limit / month) * prim_price_per_call
```

Example: Tavily free tier = 2,500 queries/month. search.sh charges $0.001/query.
- Monthly credit earning: 2,500 * $0.001 = $2.50 in credits
- Credits earned per actual use, not per capacity (you earn when your key is used)

### Free tier arbitrage

The most powerful incentive: an agent signs up for 10 free-tier services (via browse.sh), donates all 10 keys, and earns credits across the prim network worth more than any single free tier.

```
Donate 10 free-tier keys
  → earn $25/month in credits (combined)
  → spend credits on spawn.sh ($0.50/server), store.sh ($0.001/object), etc.
  → net effect: free infrastructure funded by pooled idle capacity
```

### Credit-USDC fungibility

Credits are redeemable as USDC (withdrawal to wallet) or spendable on any prim. This makes credits a real currency, not loyalty points.

## Prior Art & Economic Theory

### DePIN (Decentralized Physical Infrastructure Networks)

keys.sh follows the DePIN model: users contribute resources, earn tokens, network scales without centralized capex.

> "Tokens usually provide a financial subsidy... speculators subsidize early adoption. The long-term goal is achieving X > Y, enabling protocol revenue capture." — a16z crypto

DePIN examples: Filecoin (storage), Helium (wireless), Render (GPU). keys.sh applies the same model to **API capacity** rather than physical hardware. The key difference: API keys have near-zero marginal cost to contribute (no hardware to buy), which lowers the barrier to supply-side participation.

Market size signal: ~250 DePIN projects, $19B combined market cap as of Sep 2025.

### Capacity Provision Networks (academic)

Clearwater & Kauffman (2008, *Information Systems Research*) formalize "Capacity Provision Networks" — cooperative allocation of surplus capacity across distributed service providers. Key findings:

- Significant incentives exist for providers to engage in cooperative allocation and surplus sharing
- Intermediation enhances allocation effectiveness
- Positive network externality among cooperating providers — the more providers participate, the more valuable the network

keys.sh is a CPN where the "providers" are agents donating API keys and the "intermediary" is the key proxy layer.

### Sharing economy fundamentals

The economic logic is identical to Airbnb/Uber: monetize idle capacity that would otherwise produce zero value. Academic framing (Frenken, 2017): sharing economy = "consumers granting each other temporary access to under-utilized physical assets."

keys.sh extends this from physical assets to **digital access rights**. An unused API key is like an empty guest room — it costs nothing to share and produces value for both parties.

### BitTorrent's tit-for-tat

BitTorrent's incentive mechanism: peers who upload more get faster downloads. Freeloaders are throttled. keys.sh could adopt a similar model:

- Agents who contribute keys get priority access to the pool
- Agents who only consume (USDC-only) get lower priority during capacity crunches
- Heavy contributors get reduced pricing (loyalty discount)

## The Complete Flywheel

```
prim.yaml spec → factory codegen (principle #9)
     ↓
agent contributes a new prim via create.sh + pr.sh
     ↓
new prim needs provider keys to function
     ↓
agents contribute keys via keys.sh
     ↓
prim is live with pooled capacity — zero human involvement
     ↓
more agents use it → more keys contributed → more capacity → more agents
```

The factory solves the code bottleneck. keys.sh solves the provider bottleneck. Both are agent-driven. The human bottleneck is removed from both sides of the supply chain.

## Open Questions

1. **ToS enforcement** — How aggressively will providers enforce single-user ToS on pooled keys? Is there a legal structure (keys.sh as the "user," agents as sub-accounts) that's defensible?
2. **Key quality** — How to handle keys with low rate limits, unreliable uptime, or near-expiry? Quality scoring?
3. **Credit inflation** — If too many keys are contributed and not enough consumed, credits lose value. How to manage supply/demand balance?
4. **Provider diversity** — What if 90% of donated keys are for one provider (e.g., Serper) and none for another (e.g., Tavily)? Pricing signals? Bounties for scarce providers?
5. **Paid tier keys** — Should keys.sh accept donated paid-tier keys? Higher credit rate, but higher ToS risk.
6. **Agent identity** — Does a contributing agent need a reputation score (id.sh) before keys.sh trusts its contributions? Sybil resistance?
7. **Pricing oracle** — Who sets the USDC-equivalent value of a key's capacity? Market-based (supply/demand) or fixed (pegged to prim pricing)?
