# Competitors

Tracked when encountered. Not exhaustive, not maintained — just a reference.

## Landscape

| Company | URL | Positioning | Customer | Overlap with Prim | Key Difference |
|---------|-----|-------------|----------|-------------------|----------------|
| **Agentuity** | agentuity.com | "The full-stack platform for AI agents" | Developers building agents | High — both provide infra primitives (storage, compute, observability, cron, email/SMS) | Agentuity is a *deployment platform* — you push agent code to them. Prim is a *service mesh* — agents call independent APIs with x402 payment. Agentuity requires signup and wraps your runtime. Prim wraps existing services and has no accounts. |
| **Sapiom** | sapiom.ai | "Financial infrastructure for AI agents" — payment middleware that lets agents buy access to existing APIs/services (Twilio, AWS, etc.) | Developers / vibe-coding platforms (B2B) | High — both solve "agents can't buy things." Sapiom also handles API key management, spending controls, KYA. | Sapiom is a **broker** — it sits between agents and existing vendors, managing billing and auth on traditional fiat rails. Prim **is the vendor** — it provides the actual services, on x402/crypto rails, with no intermediary. Sapiom's customer is the platform developer. Prim's customer is the agent. Sapiom wraps the existing API economy; Prim replaces it with agent-native alternatives. $15.75M seed from Accel, Anthropic, Coinbase Ventures (Feb 2026). |
| **Stripe** | stripe.com | Two-pronged: **ACP** (Agentic Commerce Protocol) for fiat agent-to-merchant checkout + **x402 integration** for USDC machine payments on Base | Merchants (ACP) and developers (x402) | Medium — Stripe is the payment layer, not the service layer. No overlap on infra primitives. Overlap on the x402 payment rail itself. | Stripe doesn't provide services (email, storage, compute). It provides the **payment plumbing** agents use to buy things. ACP is fiat-first (SharedPaymentTokens, saved cards, Checkout Sessions). x402 integration is crypto (USDC on Base via PaymentIntent). Stripe is a potential **enabler** (validates x402 market) and a potential **toll booth** (if they become the dominant x402 facilitator). Currently in preview, requires contacting machine-payments@stripe.com. Early ACP partners: URBN, Etsy, Coach, Kate Spade. |
| **Google (UCP)** | ucp.dev | **Universal Commerce Protocol** — open standard for agentic commerce. Agent discovers merchants via `/.well-known/ucp` manifests, creates checkout sessions, completes payment. Google Pay primary rail. | Retailers (Target, Walmart, Best Buy, Etsy, Shopify, etc.) | Low — UCP is consumer commerce (agents shopping for humans), not infra-to-agent. No overlap on primitives. | UCP is a **retail checkout protocol** — agents buy physical goods on behalf of humans. Fiat-only (Google Pay, PayPal planned). Interoperable with A2A, MCP, AP2. 20+ partners including Stripe, Visa, Mastercard, Adyen. Currently U.S. only, expanding to India/Indonesia/LATAM. Open-source on GitHub. Not in the same market as Prim — Prim serves agents buying infrastructure for themselves, not humans buying sneakers through agents. |
| **Web4** | web4.ai | Unknown — site is JS-heavy, no readable content | Unknown | Unknown | Could not extract product info. Revisit. |

## How Prim is different

Most "agent infrastructure" companies build platforms where **developers deploy agents**. The developer is the customer. There's a dashboard, a CLI that authenticates you, a billing page.

Prim builds services where **the agent is the customer**. No developer in the loop at runtime. No signup, no deploy step, no dashboard. An agent with a funded wallet calls an API and gets a resource. x402 payment is the only credential.

The distinction: platforms serve developers who build agents. Prim serves agents directly.

### Prim vs. Sapiom (closest competitor)

Both solve "agents can't autonomously acquire infrastructure." Different approaches:

| | Sapiom | Prim |
|---|--------|------|
| **What it is** | Payment broker to existing vendors | The vendor itself |
| **Payment rails** | Traditional fiat (usage-based billing) | x402 (USDC on Base, on-chain) |
| **Customer** | Developer / platform (B2B) | The agent directly |
| **Auth model** | API key management, KYA, spending controls | x402 payment is the auth — no keys, no accounts |
| **Value prop** | "Access the existing API economy" | "Replace the API economy with agent-native services" |
| **Lock-in** | Sapiom is the intermediary — vendor lock on the broker layer | No intermediary — agents call services directly |
| **Scale model** | More vendor integrations (human-driven) | Self-extending — agents contribute new prims (aspirational) |

They're complementary in theory — Sapiom could broker access to Prim services. But strategically, Prim's bet is that agent-native services (no signup, no API keys, pay-per-call) make the broker layer unnecessary.

### Stripe's role (not a competitor — a market force)

Stripe plays both sides of agent payments:

**ACP (Agentic Commerce Protocol)** — fiat-first. Open-source spec for agent-to-merchant checkout. Agent presents SharedPaymentToken (scoped, time-bounded, tied to a human's saved card). Merchant implements 4 REST endpoints (create/update/complete/cancel checkout). Stripe handles fraud (Radar), settlement, product catalog sync. Partners: URBN, Etsy, Coach. This is agent-mediated *consumer commerce* — agents shopping on behalf of humans.

**x402 integration** — crypto-native. Stripe wraps x402 into its PaymentIntent API. Developer adds middleware, Stripe creates a deposit address on Base, agent sends USDC, Stripe auto-captures when funds settle. Currently preview-only. This is *machine-to-machine payments* — closer to Prim's model.

**Implications for Prim:**

| Scenario | Impact |
|----------|--------|
| Stripe's x402 grows | Validates Prim's payment model. More agents with funded wallets = more potential Prim customers. Net positive. |
| Stripe becomes dominant x402 facilitator | Toll booth risk — Stripe takes a cut of every Prim transaction. Mitigate by supporting Coinbase facilitator + self-hosted facilitator. |
| ACP wins over x402 | Fiat rails dominate agent payments. Prim's crypto-only model becomes friction. Would need to add ACP support or fiat on-ramp. |
| Stripe builds infra primitives | Low probability — Stripe is a payment company, not an infra company. But they could enable others (Sapiom + Stripe = agent infra marketplace on fiat rails). |

Stripe entering agentic commerce is the strongest market validation signal. The co-founder predicts a "torrent" of AI agent commerce powered by stablecoins. Prim is positioned on the supply side of that torrent.

### The protocol landscape (Feb 2026)

Three competing agent commerce protocols have launched within months of each other:

| Protocol | Owner | Rail | Agent buys... | Discovery | Status |
|----------|-------|------|---------------|-----------|--------|
| **x402** | Coinbase | Crypto (USDC on Base) | Machine services (APIs, compute, infra) | HTTP 402 response | Live, Stripe preview |
| **ACP** | OpenAI / Stripe | Fiat (SharedPaymentTokens, saved cards) | Consumer goods on behalf of humans | Merchant catalog via Stripe | Live with partners |
| **UCP** | Google | Fiat (Google Pay, PayPal planned) | Consumer goods on behalf of humans | `/.well-known/ucp` manifest | Live, U.S. only |

**Key observation:** ACP and UCP are consumer commerce — agents as shopping assistants for humans. x402 is machine commerce — agents buying infrastructure for themselves. These are different markets that happen to share the word "agent."

**Prim's position:** Prim is a **supplier on x402 rails**, not a protocol. The protocol wars (ACP vs UCP vs x402) are upstream. Prim wins regardless of which crypto payment protocol dominates, as long as *some* crypto rail exists. The risk is if fiat rails (ACP/UCP) win entirely and crypto machine payments don't materialize — then Prim needs a fiat on-ramp or ACP/UCP support.

**Sapiom's position:** Sapiom is a **broker on fiat rails**. If ACP/UCP win, Sapiom's model strengthens (agents need a billing intermediary for traditional vendors). If x402 wins, Sapiom's broker layer is unnecessary — agents pay vendors directly.

**The bet:** Prim bets that agent-to-agent infrastructure is a fundamentally different market from agent-mediated consumer shopping — and that market runs on crypto rails because agents don't have credit cards.
