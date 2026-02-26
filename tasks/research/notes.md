# Research Notes

Extracted from TASKS.md on 2026-02-26. Technical reference that informed task decisions.

## AP2 vs x402 (2026-02-24)

Google's Agent Payments Protocol (AP2) extends A2A+MCP for agent payments. Google + Coinbase + MetaMask + Ethereum Foundation collaborated on the [A2A x402 extension](https://github.com/google-agentic-commerce/a2a-x402), which adds crypto payments to A2A.

**Resolved questions:**
- AP2 is fiat-native (Mandates: Intent, Cart, Payment). x402 is crypto-native (EIP-3009 on Base). They are complementary, not competitive.
- The A2A x402 extension adds crypto to A2A — it is *not* dual-protocol middleware. No reference implementation exists for a single endpoint accepting both AP2 fiat and x402 crypto. If we want dual-rail, we build it ourselves.
- Facilitator centralization concern is overstated — ecosystem now includes PayAI, Meridian, x402.rs (open-source Rust), 1Shot API, Mogami. The [x402 Foundation](https://blog.cloudflare.com/x402/) (Cloudflare + Coinbase) exists to prevent single-provider lock-in.

**Action:** AP2 dual-protocol is premature. Don't build it now. Track the spec; revisit when AP2 has production adoption beyond Google.

## x402 execution layer for wallet.sh (2026-02-24)

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

## spawn.sh provider abstraction (2026-02-24)

**Problem:** spawn.sh currently wraps Hetzner Cloud directly. Hetzner's TOS prohibits reselling services without written consent. spawn.sh is literally reselling compute via API — this is a compliance risk that could result in account termination.

**Decision:** Abstract the provider layer. spawn.sh should define a `CloudProvider` interface (createServer, deleteServer, start, stop, reboot, resize, rebuild, SSH key CRUD) and implement it per provider. The service layer, DB, ownership model, routes, and x402 pricing stay provider-agnostic.

**Provider comparison:**

| Factor | Hetzner | AWS | GCP | Azure |
|--------|---------|-----|-----|-------|
| Reseller TOS | Prohibits without agreement | Explicit partner/MSP programs | Partner programs | CSP program |
| Comparable instance | CX23 ~$4.50/mo | t4g.nano ~$3/mo (ARM) | e2-micro ~$7/mo | B1ls ~$4/mo |
| API maturity | Simple, limited | Very mature | Mature | Mature |
| Geographic coverage | EU + US (limited) | Global | Global | Global |
| Legal risk | High (no reseller agreement) | Low | Low | Low |

**Plan:** SP-6 extracted CloudProvider interface. DigitalOcean added as launch provider. Hetzner code preserved as one provider behind the interface.

## Provider strategy — two-provider model (2026-02-24)

Cloudflare (DNS + R2 storage) and DigitalOcean (compute). Full ADR: `specs/provider-strategy.md`

## Project rename: AgentStack to Prim (2026-02-25)

"AgentStack" name is taken (existing open-source AI agent framework, Teradata product). Registered `prim.sh` — "primitive shell." Each primitive is a subdomain: `relay.prim.sh`, `wallet.prim.sh`, `spawn.prim.sh`, `domain.prim.sh`.

- **Domain:** `prim.sh` via Namecheap ($34.98/yr), DNS on Cloudflare
- **X handle:** `@useprim`
- **Registrar:** Namecheap (no API access until $50 spend — use GUI for now)
- **DNS provider:** Cloudflare (zone ID: `a16698041d45830e33b6f82b6f524e30`)

## Stalwart mail server reference (2026-02-25)

Stalwart runs on DigitalOcean Droplet `[STALWART_HOST]`. Configured for `relay.prim.sh`.

- **Admin access:** SSH tunnel only (`ssh -L 8080:localhost:8080 root@[STALWART_HOST]`), Basic auth `admin:[REDACTED]`
- **API key for wrapper:** Basic auth `relay-wrapper:[REDACTED]`
- **Settings API format:** `POST /api/settings` with body `[{"type":"insert","prefix":null,"values":[["key","value"]],"assert_empty":false}]` or `[{"type":"clear","prefix":"key.prefix."}]`
- **DKIM:** Dual signing (RSA-2048 selector `rsa`, Ed25519 selector `ed`), keys generated via `POST /api/dkim`
- **DNS records:** `GET /api/dns/records/{domain}` returns recommended DNS records
- **Config reload:** `GET /api/reload` (no restart needed)
- **Domain principal:** `POST /api/principal` with `{"type":"domain","name":"relay.prim.sh"}`

## Wallet-first identity upgrade path (2026-02-24)

ERC-8004 uses CAIP-10 wallet addresses as root identity. DIDs layer on top non-breaking: wallet address becomes `verificationMethod` in DID Document, `alsoKnownAs` bridges old to new. No smart contract changes. Current "wallet = identity" design is correct for v1. id.sh adds DID resolution later.
