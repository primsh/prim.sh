# Platform Architecture

> Prim is a marketplace for agent-consumable services, paid per request via x402.

This document defines prim's scope, marketplace model, and revenue architecture. It complements the [whitepaper](whitepaper.md) (protocol, factory, DeKeys) and [brand guide](brand.md) (naming, voice).

---

## Scope

Prim is a **service marketplace**. A prim is a remote HTTP service that does work, costs money per request, and speaks x402.

Prim is NOT a plugin system, skill registry, or agent framework. Those are complementary but separate concerns:

| Concern | Where it lives | How it relates to prim |
|---------|---------------|----------------------|
| **Services** (remote, paid per request) | prim | The product |
| **Skills/plugins** (local, extend agent behavior) | Agent frameworks | May call prims |
| **Client libraries** (MCP tools, CLI, SDK) | Generated from prim specs | Distribution channel, not the product |

The test: **does it run on someone's infrastructure and cost money per request?** If yes, it's a prim. If it runs locally on the agent's machine, it's not.

---

## Three actors

**Agents** consume prims. They discover services in the registry, pay per request via x402, and get results.

**Operators** run prims. They deploy services, set pricing, and earn revenue per request. An operator can be anyone: the prim team (first-party), an independent developer, or an agent.

**Prim** is the registry and payment facilitator. It routes payments, takes a percentage, and maintains the service catalog.

```
Agent makes request → gets 402
  → pays USDC via x402
  → facilitator takes cut → remainder goes to operator's payTo address
  → agent gets response
```

---

## Revenue model

Prim takes a percentage of every x402 transaction across the network.

- Operator sets the price (e.g. $0.001/request)
- Agent pays the full price
- Facilitator splits: operator receives (100 - fee)%, prim receives fee%
- Settlement is on-chain (USDC on Base) — transparent, auditable

First-party prims earn 100% (no split — prim is the operator). Third-party prims pay the platform fee. This aligns incentives: prim earns more when the ecosystem grows, not just when first-party prims are used.

### Fee split mechanism

The fee split is **TBD** — three options under consideration:

1. **Splitter contract** — on-chain contract receives payment, splits to operator + prim in one transaction. Cleanest, but requires contract deployment and adds gas.
2. **Post-settlement sweep** — operator receives full payment to a prim-managed escrow address. Prim sweeps its fee periodically (hourly/daily). Simpler on-chain, but operator doesn't receive funds instantly.
3. **Facilitator-mediated** — the x402 facilitator (already in the payment flow) holds funds briefly and distributes. Lowest friction, but centralizes trust in the facilitator.

Decision depends on gas costs, trust model, and operator experience. See [whitepaper Section 4 (DeKeys)](whitepaper.md) for how the key proxy layer interacts with payment routing.

---

## Registry

The registry is how agents discover available prims. It progresses through three levels:

### Level 1: Static catalog (current)

Each package has a `prim.yaml` spec. The root `primitives.yaml` indexes all prims. Generated artifacts (`discovery.json`, `llms.txt`, MCP tool definitions, `x402-manifest.json`) are produced by the gen pipeline. First-party only.

### Level 2: PR-based registration

External operators submit a PR adding their service to the registry. Requirements:
- Valid endpoint URL
- Passes conformance test (`prim test:conformance <url>`)
- Has `prim.yaml` manifest (or serves equivalent metadata at `GET /`)

Human reviews and merges. Low volume, high trust.

### Level 3: Self-serve registry API

A free platform endpoint (not x402-gated — registration must be frictionless for operators to onboard). Prim runs conformance automatically on the submitted endpoint:
- Health check (`GET /` returns `{ service, status }`)
- Pricing endpoint (`GET /pricing` returns route prices)
- x402 flow (402 → payment → 200)
- Error envelope (`{ error: { code, message } }`)
- Response time and availability

If conformance passes, the prim is listed. No human review — the protocol is the quality gate.

**Cost model for registry operations:** Conformance testing and continuous monitoring are platform costs, subsidized by the fee split on transactions. Operators pay nothing to register — prim earns when their service gets used.

---

## Conformance contract

Every prim — first-party or third-party — must implement:

| Requirement | What it means |
|-------------|--------------|
| `GET /` | Returns `{ service: "<name>", status: "ok" }` |
| `GET /pricing` | Returns machine-readable route pricing |
| x402 payment flow | Returns 402 with payment challenge, accepts payment header |
| Error envelope | `{ error: { code: string, message: string } }` on all errors |
| HTTPS | TLS required |
| `GET /v1/metrics` | Operational metrics (uptime, request counts, latency, error rates) |

Optional but recommended:
- `llms.txt` — machine-readable API documentation
- OpenAPI spec — full API documentation

All first-party prims implement the full contract including metrics (via `createPrimApp`). Third-party prims are tested continuously against the contract. Prims that fail are delisted.

---

## Competition

Multiple prims can offer the same capability. `domain.sh` (first-party) and a third-party DNS prim can both provide domain management. This is by design:

- Agents choose based on price, reliability, features, and availability
- Competition drives prices down and quality up
- Prim earns revenue regardless of which operator serves the request
- First-party prims set the quality floor, not a ceiling

The registry does not grant exclusivity. Any service that passes conformance and speaks x402 can be listed.

---

## First-party vs third-party

First-party prims serve three purposes:

1. **Bootstrap supply** — agents need services to exist before operators show up
2. **Prove the protocol** — demonstrate that x402 + conformance works end-to-end
3. **Set the quality bar** — reference implementations that third-party prims compete against

Over time, the ratio shifts. First-party prims are marketing for the platform. The business is the fee on every transaction across all prims.

---

## Building prims: three patterns

### Pattern 1: Built inside prim (first-party)

Services that are thin wrappers around provider APIs with no standalone value. The service logic IS the prim.

Examples: wallet.sh, store.sh, email.sh

```
packages/wallet/src/service.ts  ← provider integration
packages/wallet/src/api.ts      ← Zod schemas
packages/wallet/src/index.ts    ← Hono routes + x402
```

### Pattern 2: External library, thin prim adapter

Standalone tools/libraries with independent value, wrapped with an x402 API layer. The library maintains its own repo, release cycle, and ecosystem. The prim adapter is ~50 lines per route.

Examples: web capture tools, market data libraries, audit engines

```
external-lib/              ← standalone package (any language)
packages/cap/src/service.ts ← imports external-lib, delegates
packages/cap/src/api.ts     ← Zod schemas
packages/cap/src/index.ts   ← Hono routes + x402
```

The test: **does it have value without x402 payment?** If yes, build outside, wrap as a prim.

### Pattern 3: Separate deploy, registered in catalog

Services in a different language or with their own infrastructure requirements. They run independently and speak x402 natively. Prim's registry lists them and routes discovery, but doesn't proxy requests.

Examples: Python-based data services, GPU-heavy inference services

```
mkt.prim.sh                ← Python service, deployed independently
  ├── speaks x402
  ├── passes conformance
  └── registered in prim registry
```

---

## The flywheel

```
Build first-party prims → agents use them → proves the protocol
  → open registration → operators add prims → more supply
  → more supply → more agents → more transactions
  → more transactions → more revenue → fund more first-party prims
  → repeat
```

Priority order:
1. **Conformance contract** — define and test what makes a valid prim
2. **Registry API** — register, discover, verify prims
3. **Facilitator fee split** — payment routing with prim's cut
4. **First-party prims** — bootstrap supply, prove the protocol
5. **Operator tooling** — `prim create prim` for external operators
