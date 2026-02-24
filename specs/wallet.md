# wallet.sh Spec

> Crypto wallets for agents. Create, fund, spend, swap. x402-native.

## What It Does

wallet.sh is the keystone primitive. It gives agents autonomous financial capability:

- **Create wallets** — Agent gets a Base wallet with no human signup
- **Receive funds** — Owner sends USDC to the agent's wallet (or agent earns from other agents)
- **Spend via x402** — Agent pays for any agentstack primitive (or any x402-enabled service) automatically
- **Request funding** — Agent asks its owner for more money when balance is low
- **Swap tokens** — Convert between tokens (USDC ↔ ETH, cross-chain bridges)
- **Balance + history** — Check balances, view transaction history
- **Budget controls** — Owner sets spending limits, per-primitive caps, auto-pause thresholds

## Relationship to Railgunner

Railgunner is a Polygon-focused wallet operations tool with privacy features (Railgun shield/unshield). wallet.sh is the agentstack primitive with broader scope.

### What wallet.sh takes from Railgunner
- Execution journal + idempotency pattern (prevent double-spends on retry)
- Circuit breaker (emergency pause by scope)
- Encrypted keystore + wallet registry
- Structured logging with correlation IDs
- CLI harness patterns

### What wallet.sh adds
- **Base chain support** (primary chain for x402)
- **x402 client integration** (`@x402/fetch` wrapper for paying other primitives)
- **Funding request flow** (agent → owner notification → owner approves → funds sent)
- **Budget/spending policy** (max per-tx, max per-day, per-primitive limits)
- **Multi-chain** (Base primary, Polygon for Railgun privacy features, extensible)
- **HTTP API as primary interface** (Railgunner is CLI-first, wallet.sh is API-first)

### What wallet.sh does NOT include from Railgunner
- Railgun shield/unshield (available as optional module, not core)
- PolyTrader integration specifics
- QuickSwap-specific swap logic (replaced by generic DEX routing)

## Architecture

```
Agent (any agentstack primitive, or external)
    ↓
wallet.sh HTTP API (Hono + x402 middleware)
    ↓
Wallet Service
    ├── Wallet creation (local key generation or CDP)
    ├── Balance queries (Base RPC / multi-chain)
    ├── Transaction execution (ethers.js v6)
    ├── x402 client (wraps @x402/fetch for outbound payments)
    ├── Budget policy engine (from Railgunner's privacy-policy pattern)
    └── Execution journal (from Railgunner, SQLite)
    ↓
Base chain (primary) / Polygon (optional) / other EVM chains
```

## API Surface

### Wallet Management

```
POST   /v1/wallets                  # Create a new wallet
GET    /v1/wallets                  # List wallets owned by caller
GET    /v1/wallets/:address         # Get wallet details + balances
DELETE /v1/wallets/:address         # Deactivate wallet
```

### Spending

```
POST   /v1/wallets/:address/send   # Send USDC to an address
POST   /v1/wallets/:address/swap   # Swap tokens (USDC ↔ ETH, etc.)
GET    /v1/wallets/:address/history # Transaction history
```

### Funding

```
POST   /v1/wallets/:address/fund-request   # Agent requests funds from owner
GET    /v1/wallets/:address/fund-requests   # List pending requests
POST   /v1/fund-requests/:id/approve        # Owner approves (sends funds)
POST   /v1/fund-requests/:id/deny           # Owner denies
```

### Budget & Policy

```
GET    /v1/wallets/:address/policy          # Get spending policy
PUT    /v1/wallets/:address/policy          # Set spending limits
POST   /v1/wallets/:address/pause           # Emergency pause (circuit breaker)
POST   /v1/wallets/:address/resume          # Resume after pause
```

### x402 Client

wallet.sh also acts as an **x402 client library** that other primitives can use. When an agent calls relay.sh, the relay.sh service doesn't handle payment — the agent's x402-enabled HTTP client (powered by wallet.sh) handles the 402 flow automatically.

This means wallet.sh has two roles:
1. **Service** — HTTP API for wallet management (create, fund, send, swap)
2. **Library** — x402 fetch wrapper that agents import to pay for things

## Wallet Creation Flow

```
Agent (or human setting up an agent)
    ↓
POST /v1/wallets
    { "chain": "eip155:8453" }    ← Base mainnet
    ↓
wallet.sh generates a keypair locally (no CDP dependency)
    ↓
Stores encrypted private key in keystore (from Railgunner's keystore-crypto)
    ↓
Returns:
    {
      "address": "0xabc...",
      "chain": "eip155:8453",
      "balance": "0.00",
      "funded": false
    }
    ↓
Agent (or owner) sends USDC to this address on Base
    ↓
Agent is now autonomous — can pay for any x402 service
```

### The human bottleneck

One human action is required: funding the wallet with USDC. After that, the agent is fully autonomous. The "fund request" flow minimizes even this — the agent can programmatically ask the owner for funds and the owner can approve via a simple API call or notification.

## Funding Request Flow

This is the "agent requests money from owner" feature:

```
Agent detects low balance (or needs funds for a specific action)
    ↓
POST /v1/wallets/:address/fund-request
    { "amount": "10.00", "reason": "Need to provision a VPS via spawn.sh" }
    ↓
wallet.sh stores the request, notifies owner via:
    - Webhook (configurable URL)
    - pipe.sh channel (if owner subscribes)
    - relay.sh email (if configured)
    ↓
Owner reviews and approves:
POST /v1/fund-requests/:id/approve
    ↓
wallet.sh executes the transfer from owner's wallet to agent's wallet
    ↓
Agent receives funds, continues operating
```

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Key generation | Local (no CDP dependency) | Simpler. Agent owns its own keys. CDP is optional for managed wallets. |
| Key storage | Encrypted keystore (AES-GCM, from Railgunner) | Battle-tested in Railgunner. No external KMS dependency. |
| Primary chain | Base (eip155:8453) | x402 default. Sub-cent gas. USDC native. |
| Runtime | Bun | Runs TS natively. Native SQLite driver (`bun:sqlite`). |
| State store | SQLite via `bun:sqlite` (from Railgunner's execution journal pattern) | Embedded, zero-config. Bun has native SQLite — no `better-sqlite3` needed. |
| x402 client | `@x402/fetch` wrapper | First-party Coinbase SDK. Handles full 402 flow. |
| Swap routing | Generic DEX aggregator (1inch/Paraswap API) | Not locked to QuickSwap like Railgunner. |

## Unknowns

1. **Key custody** — Local keystore is fine for single-server (Bun + SQLite). If wallet.sh moves to Cloudflare Workers, we need a different storage approach (KV? Durable Objects? External vault?).
2. **Multi-agent wallets** — Can multiple agents share a wallet? Or does each agent get its own? Leaning toward 1:1 for simplicity.
3. **Owner authentication** — The fund-request approval flow requires the owner to authenticate. How? x402 payment from the owner's wallet? Signed message? API key?
4. **Regulatory** — wallet.sh is not a custodial service if the agent holds its own keys. But the fund-request flow (where wallet.sh transfers from owner to agent) could look like money transmission. Need to verify.
5. **Railgunner as dependency** — Import railgunner as a library for its keystore/journal/circuit-breaker? Or copy the patterns into wallet.sh? Leaning toward copy — keeps wallet.sh self-contained.
