# Cost Transparency

You deserve to know what you're paying for.

Every x402 price on prim.sh is derived from a real provider cost plus a margin we disclose here. No "contact sales." No opaque per-seat pricing. The numbers are public, the formula is simple, and the source of truth is [`specs/pricing.yaml`](../specs/pricing.yaml) in this repo.

If our margins look unreasonable, fork the repo and run it yourself. That's the point.

---

## Infrastructure

Fixed monthly costs shared across all primitives. These are amortized across call volume, not charged per-call. At moderate volume the per-call share rounds to zero.

| Item | Cost | Notes |
|------|------|-------|
| DigitalOcean VPS | $12/mo | s-1vcpu-2gb. Runs wallet, store, email, faucet, spawn, search, mem, token, domain |
| Cloudflare | $0/mo | Free plan -- R2 free tier, DNS free, Pages free |
| Qdrant | $0/mo | Self-hosted on VPS |
| Stalwart Mail Server | $0/mo | Self-hosted on VPS |
| Domain (prim.sh) | ~$4.17/mo | $50/yr amortized |
| X Premium (@useprim) | $11/mo | Marketing / social presence |
| **Total fixed** | **~$27/mo** | |

---

## Per-Call Costs

Grouped by primitive. All prices in USDC. Provider cost is what we pay upstream. x402 price is what the agent pays. Margin is `(price - cost) / price`.

Source: [`specs/pricing.yaml`](../specs/pricing.yaml)

### wallet.sh

All operations are SQLite reads/writes against a self-hosted database. Zero provider cost.

| Endpoint | Provider Cost | x402 Price | Margin |
|----------|--------------|------------|--------|
| `GET /v1/wallets` | $0.00 | $0.001 | 100% |
| `GET /v1/wallets/{address}` | $0.00 | $0.001 | 100% |
| `DELETE /v1/wallets/{address}` | $0.00 | $0.01 | 100% |
| `GET /v1/wallets/{address}/fund-requests` | $0.00 | $0.001 | 100% |
| `POST /v1/wallets/{address}/fund-request` | $0.00 | $0.001 | 100% |
| `POST /v1/fund-requests/{id}/approve` | $0.00 | $0.01 | 100% |
| `POST /v1/fund-requests/{id}/deny` | $0.00 | $0.001 | 100% |
| `GET /v1/wallets/{address}/policy` | $0.00 | $0.001 | 100% |
| `PUT /v1/wallets/{address}/policy` | $0.00 | $0.005 | 100% |
| `POST /v1/wallets/{address}/pause` | $0.00 | $0.001 | 100% |
| `POST /v1/wallets/{address}/resume` | $0.00 | $0.001 | 100% |

Free routes: `GET /`, `POST /v1/wallets` (wallet creation is free).

### store.sh

Object storage via Cloudflare R2. Metadata operations are free. Object read/write costs are R2 API operation fees.

| Endpoint | Provider Cost | x402 Price | Margin |
|----------|--------------|------------|--------|
| `POST /v1/buckets` | $0.00 | $0.05 | 100% |
| `GET /v1/buckets` | $0.00 | $0.001 | 100% |
| `GET /v1/buckets/{id}` | $0.00 | $0.001 | 100% |
| `DELETE /v1/buckets/{id}` | $0.00 | $0.01 | 100% |
| `PUT /v1/buckets/{id}/objects/*` | $0.0000045 | $0.001 | 99% |
| `GET /v1/buckets/{id}/objects` | $0.00000036 | $0.001 | 99% |
| `GET /v1/buckets/{id}/objects/*` | $0.00000036 | $0.001 | 99% |
| `DELETE /v1/buckets/{id}/objects/*` | $0.00 | $0.001 | 100% |
| `GET /v1/buckets/{id}/quota` | $0.00 | $0.001 | 100% |
| `PUT /v1/buckets/{id}/quota` | $0.00 | $0.01 | 100% |
| `POST /v1/buckets/{id}/quota/reconcile` | $0.0000045 | $0.05 | 99% |

### spawn.sh

VPS provisioning via DigitalOcean. Most operations are free API calls. Server creation is a **risk item** -- see below.

| Endpoint | Provider Cost | x402 Price | Margin |
|----------|--------------|------------|--------|
| `POST /v1/servers` | **$4.00/mo** | $0.01 | **-39,900%** |
| `GET /v1/servers` | $0.00 | $0.001 | 100% |
| `GET /v1/servers/{id}` | $0.00 | $0.001 | 100% |
| `DELETE /v1/servers/{id}` | $0.00 | $0.005 | 100% |
| `POST /v1/servers/{id}/start` | $0.00 | $0.002 | 100% |
| `POST /v1/servers/{id}/stop` | $0.00 | $0.002 | 100% |
| `POST /v1/servers/{id}/reboot` | $0.00 | $0.002 | 100% |
| `POST /v1/servers/{id}/resize` | $0.00 | $0.01 | 100% |
| `POST /v1/servers/{id}/rebuild` | $0.00 | $0.005 | 100% |
| `POST /v1/ssh-keys` | $0.00 | $0.001 | 100% |
| `GET /v1/ssh-keys` | $0.00 | $0.001 | 100% |
| `DELETE /v1/ssh-keys/{id}` | $0.00 | $0.001 | 100% |

### email.sh

Self-hosted Stalwart Mail Server. All operations hit local JMAP/REST + SQLite. Zero provider cost.

| Endpoint | Provider Cost | x402 Price | Margin |
|----------|--------------|------------|--------|
| `POST /v1/mailboxes` | $0.00 | $0.05 | 100% |
| `GET /v1/mailboxes` | $0.00 | $0.001 | 100% |
| `GET /v1/mailboxes/{id}` | $0.00 | $0.001 | 100% |
| `DELETE /v1/mailboxes/{id}` | $0.00 | $0.01 | 100% |
| `POST /v1/mailboxes/{id}/renew` | $0.00 | $0.01 | 100% |
| `GET /v1/mailboxes/{id}/messages` | $0.00 | $0.001 | 100% |
| `GET /v1/mailboxes/{id}/messages/{msgId}` | $0.00 | $0.001 | 100% |
| `POST /v1/mailboxes/{id}/send` | $0.00 | $0.01 | 100% |
| `POST /v1/mailboxes/{id}/webhooks` | $0.00 | $0.01 | 100% |
| `GET /v1/mailboxes/{id}/webhooks` | $0.00 | $0.001 | 100% |
| `DELETE /v1/mailboxes/{id}/webhooks/{whId}` | $0.00 | $0.001 | 100% |
| `POST /v1/domains` | $0.00 | $0.05 | 100% |
| `GET /v1/domains` | $0.00 | $0.001 | 100% |
| `GET /v1/domains/{id}` | $0.00 | $0.001 | 100% |
| `POST /v1/domains/{id}/verify` | $0.00 | $0.01 | 100% |
| `DELETE /v1/domains/{id}` | $0.00 | $0.01 | 100% |

### search.sh

Web search and extraction via Tavily API. Extract is a **risk item** -- at cost, 0% margin.

| Endpoint | Provider Cost | x402 Price | Margin |
|----------|--------------|------------|--------|
| `POST /v1/search` | $0.005 | $0.01 | 50% |
| `POST /v1/search/news` | $0.005 | $0.01 | 50% |
| `POST /v1/extract` | **$0.005** | **$0.005** | **0%** |

### token.sh

ERC-20 deployment and Uniswap V3 pools on Base L2. On-chain operations carry gas costs. Gas spikes are a **risk item**.

| Endpoint | Provider Cost | x402 Price | Margin |
|----------|--------------|------------|--------|
| `POST /v1/tokens` | ~$0.10 | $1.00 | 90% |
| `GET /v1/tokens` | $0.00 | $0.001 | 100% |
| `GET /v1/tokens/{id}` | $0.00 | $0.001 | 100% |
| `POST /v1/tokens/{id}/mint` | ~$0.01 | $0.10 | 90% |
| `GET /v1/tokens/{id}/supply` | $0.00 | $0.001 | 100% |
| `POST /v1/tokens/{id}/pool` | ~$0.05 | $0.50 | 90% |
| `GET /v1/tokens/{id}/pool` | $0.00 | $0.001 | 100% |
| `GET /v1/tokens/{id}/pool/liquidity-params` | $0.00 | $0.001 | 100% |

### mem.sh

Vector memory (self-hosted Qdrant) + KV cache (SQLite). Embedding calls go through Google's embedding API.

| Endpoint | Provider Cost | x402 Price | Margin |
|----------|--------------|------------|--------|
| `POST /v1/collections` | $0.00 | $0.01 | 100% |
| `GET /v1/collections` | $0.00 | $0.001 | 100% |
| `GET /v1/collections/{id}` | $0.00 | $0.001 | 100% |
| `DELETE /v1/collections/{id}` | $0.00 | $0.01 | 100% |
| `POST /v1/collections/{id}/upsert` | ~$0.0001 | $0.001 | 90% |
| `POST /v1/collections/{id}/query` | ~$0.0001 | $0.001 | 90% |
| `PUT /v1/cache/{namespace}/{key}` | $0.00 | $0.0001 | 100% |
| `GET /v1/cache/{namespace}/{key}` | $0.00 | $0.0001 | 100% |
| `DELETE /v1/cache/{namespace}/{key}` | $0.00 | $0.0001 | 100% |

### domain.sh

DNS zones via Cloudflare (free plan) + domain registration via NameSilo. Registration pricing is **dynamic** -- see risk items.

| Endpoint | Provider Cost | x402 Price | Margin |
|----------|--------------|------------|--------|
| `GET /v1/domains/search` | $0.00 | $0.001 | 100% |
| `POST /v1/domains/quote` | $0.00 | $0.001 | 100% |
| `POST /v1/domains/register` | varies ($8-40/yr) | dynamic | varies |
| `GET /v1/domains/{domain}/status` | $0.00 | $0.001 | 100% |
| `POST /v1/zones` | $0.00 | $0.05 | 100% |
| `GET /v1/zones` | $0.00 | $0.001 | 100% |
| `GET /v1/zones/{id}` | $0.00 | $0.001 | 100% |
| `DELETE /v1/zones/{id}` | $0.00 | $0.01 | 100% |
| `PUT /v1/zones/{zone_id}/activate` | $0.00 | $0.001 | 100% |
| `GET /v1/zones/{zone_id}/verify` | $0.00 | $0.001 | 100% |
| `POST /v1/zones/{zone_id}/mail-setup` | $0.00 | $0.005 | 100% |
| `POST /v1/zones/{zone_id}/records/batch` | $0.00 | $0.005 | 100% |
| `POST /v1/zones/{zone_id}/records` | $0.00 | $0.001 | 100% |
| `GET /v1/zones/{zone_id}/records` | $0.00 | $0.001 | 100% |
| `GET /v1/zones/{zone_id}/records/{id}` | $0.00 | $0.001 | 100% |
| `PUT /v1/zones/{zone_id}/records/{id}` | $0.00 | $0.001 | 100% |
| `DELETE /v1/zones/{zone_id}/records/{id}` | $0.00 | $0.001 | 100% |

Free routes: `GET /`, `GET /llms.txt`, `POST /v1/domains/recover`, `POST /v1/domains/{domain}/configure-ns`.

### faucet.sh

Testnet USDC and ETH faucet. All endpoints are free and rate-limited. No paid routes.

---

## How We Calculate Price

```
x402_price = provider_cost + infra_amortization + margin
```

**Infra amortization** is the per-call share of fixed infrastructure costs ($27/mo). At moderate call volume this rounds to effectively zero -- a few thousand calls per month means each call carries fractions of a cent in fixed overhead. We don't add it to the price today.

**Worked example -- search.sh `POST /v1/search`:**

```
$0.005  Tavily API cost
$0.000  infra amortization (rounds to zero)
$0.005  margin (50%)
------
$0.01   x402 price
```

For self-hosted services (wallet, email, mem), provider cost is $0. The x402 price is pure margin that covers infrastructure and development costs.

---

## Risk Items

Endpoints where the margin model breaks or needs work.

### spawn.sh `POST /v1/servers` -- negative margin (-39,900%)

One-time $0.01 x402 charge creates a DigitalOcean droplet that costs $4/mo ongoing. This is unsustainable. The fix is a recurring billing model -- hourly or daily x402 charges, or an upfront deposit. Future task; currently accepted as a beta subsidy.

### search.sh `POST /v1/extract` -- zero margin (0%)

Tavily extract costs $0.005/call and we charge $0.005. This is a deliberate loss leader. Extract drives adoption of the search bundle (search + news + extract). If Tavily raises prices, we raise ours.

### token.sh `POST /v1/tokens` -- gas spike risk

90% margin under normal Base L2 conditions (~$0.10 gas for deploy). But mainnet congestion can push gas above $1, making the $1.00 x402 price a loss. Plan: add a gas price oracle for dynamic pricing. Same risk applies to `POST /v1/tokens/{id}/mint` ($0.10 price, ~$0.01 gas) and `POST /v1/tokens/{id}/pool` ($0.50 price, ~$0.05 gas), though the margin buffer is larger on those.

### domain.sh `POST /v1/domains/register` -- dynamic pricing

NameSilo wholesale cost varies by TLD ($8-40/yr). The x402 price is quoted dynamically via the `/v1/domains/quote` endpoint. Margin depends on the markup logic covering all TLD pricing tiers. No fixed margin guarantee.

---

## Margin Model

Three phases. We're in the first one.

### Phase 1: Beta (current)

At cost or near-cost. Goal is adoption, not revenue. Some endpoints are loss leaders (search extract, spawn provisioning). We eat the difference. The stack needs users more than it needs margin.

### Phase 2: Soft Launch

Small margin added across the board. Enough to cover infrastructure plus a modest runway. All markup is disclosed in this document. No hidden fees introduced -- every price change updates `specs/pricing.yaml` and this doc simultaneously.

### Phase 3: Full Launch

Community-governed pricing. Token holders vote on margin targets. All cost data stays public. The transparency infrastructure built now (this doc, the pricing YAML, the expense dashboard) becomes the governance input layer.

---

## Live Expense Dashboard

`bun scripts/expenses.ts` generates a live margin report from actual API usage and on-chain revenue (BIZ-2). This document is the static explainer. The dashboard is the live audit. Between the two, every cent is accounted for.

---

*Last updated: 2026-02-26*
*Source of truth: [`specs/pricing.yaml`](../specs/pricing.yaml)*
