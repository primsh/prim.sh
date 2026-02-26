<p align="center">
  <img src="brand/assets/final-readme-hero.jpg" alt="prim.sh" width="800">
</p>

<h3 align="center">prim.sh</h3>
<h3 align="center">The agent-native stack.</h3>

<p align="center">
  Infrastructure primitives for autonomous agents.<br>
  No signup. No GUI. No KYC. Pay with USDC, get resources.
</p>

<p align="center">
  <a href="https://prim.sh">Website</a> &middot;
  <a href="https://prim.sh/llms.txt">llms.txt</a> &middot;
  <a href="https://discord.gg/Cy3UQt2z">Discord</a> &middot;
  <a href="https://x.com/onprim">@onprim</a>
</p>

---

## What is Prim?

Every cloud service requires a human signup flow — email verification, credit cards, dashboards, OAuth consent screens. Agents can't do any of that.

Prim abstracts the cloud away. We sign up for the providers so agents don't have to. Each primitive wraps a real cloud service behind a simple HTTP API, authenticated by [x402](https://www.x402.org) micropayments (USDC on Base). No accounts, no OAuth, no credit cards — just a funded wallet.

An agent with 10 USDC can provision a VPS, store files, send email, register a domain, deploy a token, and search the web. All in one session, without a human touching anything.

**Status:** Private beta on Base Sepolia testnet.

## Getting Started

```bash
# Install the CLI
curl -fsSL prim.sh/install.sh | sh

# Create a wallet (local keypair, registered on-chain)
prim wallet create

# Get test USDC from the faucet
prim faucet usdc

# Use any primitive — the CLI handles x402 payment signing
prim store create-bucket
prim store put my-bucket hello.txt ./hello.txt
prim store get my-bucket hello.txt
```

No API keys. No signup. The wallet *is* the identity.

## Primitives

| Primitive | What it does | Status |
|-----------|-------------|--------|
| [wallet.sh](https://wallet.prim.sh) | Agent wallet registration (EIP-191) | Live |
| [store.sh](https://store.prim.sh) | Object storage (Cloudflare R2) | Live |
| [spawn.sh](https://spawn.prim.sh) | VPS provisioning (DigitalOcean) | Live |
| [faucet.sh](https://faucet.prim.sh) | Testnet USDC + ETH drip | Live |
| [email.sh](https://email.prim.sh) | Email — send, receive, webhooks (Stalwart) | Built |
| [domain.sh](https://domain.prim.sh) | DNS + domain registration (Cloudflare) | Built |
| [search.sh](https://search.prim.sh) | Web search + extraction (Tavily) | Built |
| [token.sh](https://token.prim.sh) | ERC-20 deploy + Uniswap V3 pools | Built |
| [mem.sh](https://mem.prim.sh) | Vector memory (Qdrant) + KV cache | Built |
| browse.sh | Headless browsing | Planned |
| ring.sh | Voice + SMS (Telnyx) | Planned |
| infer.sh | LLM inference routing | Planned |
| code.sh | Sandboxed execution | Planned |
| vault.sh | Secret storage | Planned |
| cron.sh | Scheduled jobs | Planned |
| pipe.sh | Message queues | Planned |
| watch.sh | Monitoring + alerts | Planned |
| trace.sh | Distributed tracing | Planned |
| id.sh | On-chain identity | Planned |
| pay.sh | Fiat payment bridge | Planned |
| hive.sh | Agent discovery (A2A) | Planned |

See the full catalog at [prim.sh/llms.txt](https://prim.sh/llms.txt).

## How It Works

```
Agent                    Prim                     Base (L2)
  |                        |                         |
  |-- POST /v1/buckets --> |                         |
  |<-- 402 + payment req --|                         |
  |                        |                         |
  |-- Sign EIP-3009 -----> |                         |
  |-- Retry with payment ->|-- settle on-chain ----->|
  |<-- 201 bucket created -|                         |
```

1. Agent calls any endpoint.
2. Gets HTTP 402 with payment requirements (amount, token, payTo address).
3. Signs an EIP-3009 `transferWithAuthorization` off-chain.
4. Retries with the payment header. Facilitator settles USDC on Base. Agent gets the resource.

Gas is sub-cent on Base. Agents pay per-request in USDC. No subscriptions, no metering, no invoices.

## Providers

Each primitive wraps a real provider. We manage the accounts and credentials. The agent just pays and gets the resource.

| Primitive | Current Provider | Notes |
|-----------|-----------------|-------|
| store.sh | Cloudflare R2 | S3-compatible. Free egress. |
| spawn.sh | DigitalOcean | $4/mo droplets. Provider-abstracted — adding more. |
| email.sh | Stalwart (self-hosted) | JMAP + SMTP. Full send/receive. |
| domain.sh | Cloudflare DNS + NameSilo | Zone management + domain registration. |
| search.sh | Tavily | Web search, news, URL extraction. |
| token.sh | Base (Ethereum L2) | ERC-20 deploy + Uniswap V3 via on-chain contracts. |
| mem.sh | Qdrant (self-hosted) | Vector search + SQLite KV cache. |

The provider layer is abstracted — spawn.sh defines a `CloudProvider` interface, making it straightforward to add new providers. More providers per primitive over time.

## Architecture

- **TypeScript + Bun** — no build step, Bun runs TS natively.
- **Hono** — web framework for every primitive.
- **x402** — [Coinbase payment protocol](https://www.x402.org). USDC on Base.
- **Each primitive is independent.** No shared database. Shared `@primsh/x402-middleware` only.
- **pnpm workspaces** — monorepo, each primitive is `packages/<name>/`.

## For Agents

Point your agent at `https://prim.sh/llms.txt` for machine-readable documentation covering all primitives, endpoints, and authentication.

Use `@primsh/x402-client` (TypeScript) or any x402-compatible client to handle payment automatically:

```typescript
import { createPrimFetch } from "@primsh/x402-client";

const fetch402 = createPrimFetch({ privateKey: AGENT_PRIVATE_KEY });
const res = await fetch402("https://store.prim.sh/v1/buckets", {
  method: "POST",
  body: JSON.stringify({ name: "my-data" }),
});
```

## Self-Hosting

**Use [prim.sh](https://prim.sh)** — pay per request, no accounts needed. Or **self-host** — clone the repo, bring your own provider keys.

```bash
git clone https://github.com/primsh/prim.sh
cd prim.sh && pnpm install
# Configure provider keys in .env files, then run any primitive
bun run packages/store/src/index.ts
```

Each primitive is independent. Run only what you need.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[Apache License 2.0](LICENSE)
