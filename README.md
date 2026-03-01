<p align="center">
  <img src="site/assets/readme-hero.jpg" alt="prim.sh" width="100%">
</p>

<h3 align="center">prim.sh</h3>
<h4 align="center">The agent-native stack.</h4>
<h3 align="center">Zero signup. One payment token. Infinite primitives.</h3>

<p align="center">
  Just add mcp.prim.sh, pay with USDC, use every service.
</p>

<p align="center">
  <a href="https://prim.sh">Website</a> &middot;
  <a href="https://prim.sh/llms.txt">llms.txt</a> &middot;
  <a href="https://discord.gg/VbFseNDZ">Discord</a> &middot;
  <a href="https://x.com/useprim">@useprim</a> &middot;
  <a href="https://prim.sh/docs/costs">Costs</a>
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

<!-- BEGIN:PRIM:PRIMS -->
| Primitive | What it does | Status |
|-----------|-------------|--------|
| [wallet.sh](https://wallet.prim.sh) | Agent wallets. Generate keys, hold USDC on Base, and pay any x402 invoice. | Live (mainnet) |
| [faucet.sh](https://faucet.prim.sh) | Free testnet USDC and ETH on demand. Fund your agent wallet and start building. | Live (testnet) |
| [store.sh](https://store.prim.sh) | Object storage. Persist artifacts across ephemeral VMs. S3-compatible. | Live (mainnet) |
| [search.sh](https://search.prim.sh) | Search for agents. No ads, no SEO spam. Just facts and clean markdown. | Live (mainnet) |
| [spawn.sh](https://spawn.prim.sh) | VPS in one API call. Deploy, scale, destroy. Per-second billing. | Hold |
| [email.sh](https://email.prim.sh) | Mailboxes on demand. Send, receive, webhook. Disposable or permanent. | Hold |
| [token.sh](https://token.prim.sh) | Deploy ERC-20 tokens and Uniswap V3 pools. No wallet setup required. | Hold |
| [mem.sh](https://mem.prim.sh) | Vector store and cache for agents. Persist long-term knowledge and session state. | Hold |
| [domain.sh](https://domain.prim.sh) | Register domains, manage DNS, auto-TLS. Full domain lifecycle via API. | Hold |
| deploy.sh | Push code, get an endpoint. Container or repo URL to live service. No server config. | Planned |
| [track.sh](https://track.prim.sh) | Package tracking for agents. USPS, FedEx, UPS, DHL and 1000+ carriers. Status, ETA, full event history. | Hold |
| ring.sh | Phone numbers via API. SMS, voice, TTS. No Twilio account needed. | Planned |
| pipe.sh | Pub/sub channels, webhook relays, event queues. Agent-to-agent glue. | Planned |
| vault.sh | Store API keys, tokens, credentials. Scoped access. Ephemeral or persistent. | Planned |
| cron.sh | Run code on a schedule without a server. Cron, intervals, one-shots. | Planned |
| code.sh | Sandboxed code execution for agents. Short-lived jobs instead of long-lived servers. | Planned |
| browse.sh | Headless Chromium sessions for agents. Click, type, and capture pages via API. | Planned |
| watch.sh | Structured logs, metrics, and alerts so agents can observe and correct themselves. | Planned |
| trace.sh | Distributed tracing across services. Follow a request from wallet to spawn to store. | Planned |
| auth.sh | Managed OAuth broker. Connect to third-party APIs without giving agents passwords. | Planned |
| [create.sh](https://create.prim.sh) | Scaffold new prim.sh primitives. Write a prim.yaml spec, get a complete package with passing tests. | Hold |
| [imagine.sh](https://imagine.prim.sh) | Media generation for agents. Images, video, audio. Any model, one API. No API keys. | Hold |
<!-- END:PRIM:PRIMS -->

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

See pricing details at [prim.sh/docs/costs](https://prim.sh/docs/costs).

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

See [CONTRIBUTING.md](.github/CONTRIBUTING.md).

## License

[Apache License 2.0](LICENSE)
