# ADR: Non-Custodial Wallet Architecture

> wallet.sh should not hold private keys. Agents manage their own keys; wallet.sh provides registration, balance oracle, policy engine, and funding coordination.

**Date:** 2026-02-25
**Status:** Accepted

## Context

wallet.sh (W-2 through W-9) is fully custodial: generates keypairs server-side, encrypts with AES-256-GCM via `WALLET_MASTER_KEY`, stores ciphertext in SQLite, decrypts to sign ERC-20 transfers. This creates three problems:

1. **Security liability.** A compromised `WALLET_MASTER_KEY` exposes every agent's private key. The blast radius is total.
2. **Regulatory risk.** Holding and transmitting value on behalf of others looks like money transmission. No license = legal exposure.
3. **Contradiction with agent sovereignty.** prim.sh's thesis is "the customer is the agent." Custodial keys mean the server is the custodian, not the agent.

### Ecosystem context

The ecosystem already handles key management:
- **Coinbase AgentKit / Payments MCP** — managed wallets with policy controls
- **Turnkey** — non-custodial key infrastructure (HSM-backed, API-driven)
- **Privy** — embedded wallets with social recovery
- **Raw EOA** — agent generates a key locally, stores in env var

prim.sh should not compete with these. It should work with all of them.

### What wallet.sh is good at (and should keep)

- **Address registry** — which addresses belong to which agent identity
- **Balance oracle** — live USDC balance queries via RPC
- **Policy engine** — per-wallet spending limits (maxPerTx, maxPerDay, pause/resume)
- **Funding coordination** — fund request lifecycle (create → approve/deny)
- **Execution journal** — idempotent operation tracking with event log
- **Circuit breaker** — global emergency pause

None of these require holding private keys.

## Decision

### 1. Non-custodial, no opt-in custody — clean break

No "custody mode" toggle. No gradual migration. Delete `keystore.ts`, drop `encrypted_key` column, remove `WALLET_MASTER_KEY` requirement. This is a pre-production system with zero real users — clean break costs nothing.

### 2. wallet.sh becomes: registry + oracle + policy + funding

| Capability | Before (custodial) | After (non-custodial) |
|-----------|-------------------|---------------------|
| Key generation | Server-side | Agent's problem |
| Key storage | AES-256-GCM in SQLite | Agent's problem |
| Registration | Create → claim token → claim | EIP-191 signature verification |
| Balance query | Same | Same |
| Send USDC | Server decrypts key, signs tx | Removed — agent signs with own key |
| Fund request approve | Server sends USDC | Returns address+amount; human sends directly |
| Policy engine | Same | Same |

### 3. EIP-191 signature for wallet registration

Agent proves ownership of an address by signing a structured message:

```
Register <address> with prim.sh at <ISO-timestamp>
```

Server verifies via viem's `verifyMessage()`. Timestamp must be within 5 minutes to prevent replay. Address normalized with `getAddress()` before message construction.

| address_valid | timestamp_fresh (<5min) | signature_valid | result |
|---------------|------------------------|-----------------|--------|
| No | * | * | 400 invalid_request |
| Yes | No | * | 400 signature_expired |
| Yes | Yes | No | 403 invalid_signature |
| Yes | Yes | Yes | 201 registered |

### 4. `@prim/x402-client` is the published agent-side SDK

Agents install `@prim/x402-client` and use `createPrimFetch()` — a drop-in `fetch` wrapper that auto-handles 402 responses with x402 payment. Accepts either a raw private key or a viem Account (works with Turnkey, Privy, etc.).

### 5. Fund request approve returns instructions, not transactions

Current: `approveFundRequest()` calls `sendUsdc()` server-side.
New: Returns `{ fundingAddress, amount, chain }`. Human sends USDC directly from Coinbase/MetaMask/etc. Balance updates via on-chain reads.

### 6. Removed endpoints

- `POST /v1/wallets/:address/send` — agent sends directly with own signer
- `POST /v1/wallets/:address/swap` — was a stub, never implemented

## Consequences

- **`keystore.ts` deleted.** 81 lines of AES-256-GCM encryption code removed.
- **`x402-client.ts` extracted** to `@prim/x402-client` package. No longer wallet-internal.
- **`WALLET_MASTER_KEY` no longer required.** One fewer secret to manage.
- **`encrypted_key` column dropped.** `claim_token` column dropped. `created_by` becomes NOT NULL.
- **`sendUsdc()` function deleted.** 120 lines of transaction signing + journal integration removed.
- **Test suite shrinks then grows.** ~30 custodial tests deleted, ~16 registration + x402-client tests added.
- **Fund request approve is no longer atomic.** Human must send manually. Trade-off: simpler, no custody, but adds a manual step.

## Revisit triggers

- If agent demand for managed custody is overwhelming (>50% of users asking)
- If a regulatory framework explicitly permits non-custodial key relay without MTL
- If EIP-7702 delegation matures enough to provide programmatic spending limits without custody
