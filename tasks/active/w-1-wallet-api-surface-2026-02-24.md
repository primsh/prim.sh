# W-1: Design wallet.sh API surface

**Status:** Plan
**Spec:** `specs/wallet.md`
**Depends on:** P-4 (x402 middleware — done)
**Blocks:** W-2 through W-9 (all wallet implementation tasks)

## Context

`specs/wallet.md` lists endpoints and describes flows but doesn't define request/response JSON shapes, error envelopes, status codes, or pricing. W-2 through W-9 need a concrete API contract to implement against. This task finalizes that contract.

**What this task produces:** A single file — `packages/wallet/src/api.ts` — exporting TypeScript types for every request body, response body, and error shape. Plus route definitions with x402 pricing wired into the Hono app. No business logic, no database, no crypto operations — just the type contract and route stubs that return `501 Not Implemented`.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Crypto library | **viem** (not ethers.js) | x402 ecosystem uses viem. `generatePrivateKey`, `privateKeyToAccount`, `readContract`, `signTypedData` are all viem. No reason to bring in ethers. |
| Wallet identifier | **Address itself** (no `wal_xxx` ID) | The spec says "wallet address IS identity." Adding a synthetic ID creates two identifiers for the same thing. Use `0x...` address everywhere. |
| Amount format | **String with decimals** (`"10.50"`) in API, **bigint** internally | Agents send/receive human-readable amounts. Internal code converts to raw USDC units (6 decimals). `"10.50"` → `10_500_000n`. |
| Pagination | **Cursor-based** (`after` + `limit`) | History grows unbounded. Offset pagination degrades. Cursor = last item's ID or timestamp. |
| Owner vs agent auth | **x402 wallet address = caller identity** | Every paid request has a wallet address from the payment header (via `c.get("walletAddress")`). That address is the caller. Owner = the address that created the wallet. |
| Error envelope | **`{ error: { code, message, details? } }`** | Consistent across all primitives. `code` is machine-readable (`"insufficient_balance"`), `message` is human-readable. |
| Chain identifier | **CAIP-2** (`"eip155:8453"`) | Matches x402 network format. Extensible to other chains later. |
| Timestamp format | **ISO 8601 strings** in API, **Unix ms integers** in SQLite | JSON-friendly for API consumers. Integer storage for SQLite efficiency. |
| Swap endpoint | **Deferred** | Spec lists `POST /v1/wallets/:address/swap` but swap routing (1inch/Paraswap) is complex and not needed for v1. Stub it as 501. Focus on send + balance. |

## Correction to spec

The spec says "Transaction execution (ethers.js v6)". This should be **viem**. The x402 SDK (`@x402/evm`) uses viem internally for EIP-3009 signing. Using ethers would mean two EVM libraries. Update `specs/wallet.md` to reflect this.

## API Contract

### Standard error envelope (all endpoints)

```json
{
  "error": {
    "code": "insufficient_balance",
    "message": "Wallet has 2.50 USDC but 10.00 requested",
    "details": { "balance": "2.50", "requested": "10.00" }
  }
}
```

Error codes (exhaustive for v1):
- `not_found` — wallet/resource doesn't exist (404)
- `forbidden` — caller doesn't own the wallet (403)
- `insufficient_balance` — not enough USDC (422)
- `wallet_paused` — circuit breaker active (409)
- `policy_violation` — exceeds spending limit (422)
- `duplicate_request` — idempotency key already used with different payload (409)
- `invalid_request` — bad input (400)
- `not_implemented` — endpoint stubbed (501)

### Ownership model

**Who can call what:**

| Endpoint | Who can call | How identity is determined |
|----------|-------------|--------------------------|
| `POST /v1/wallets` | Anyone (free) | No identity — new wallet is unowned until first funded |
| `GET /v1/wallets` | Any paying wallet | `c.get("walletAddress")` — lists wallets created by this address |
| `GET /v1/wallets/:address` | Owner of `:address` | `c.get("walletAddress")` must equal the wallet's `createdBy` |
| `DELETE /v1/wallets/:address` | Owner | Same |
| `POST .../send` | Owner | Same |
| `GET .../history` | Owner | Same |
| `POST .../fund-request` | The wallet itself (agent) | `c.get("walletAddress")` must equal `:address` |
| `GET .../fund-requests` | Owner | Same as GET wallet |
| `POST /v1/fund-requests/:id/approve` | Owner of the wallet that made the request | Owner identity from payment |
| `POST /v1/fund-requests/:id/deny` | Owner | Same |
| `GET .../policy` | Owner | Same |
| `PUT .../policy` | Owner | Same |
| `POST .../pause` | Owner | Same |
| `POST .../resume` | Owner | Same |

**Decision table — ownership check:**

| `c.get("walletAddress")` | wallet.createdBy | `:address` param | Access? |
|---------------------------|-----------------|------------------|---------|
| `0xOwner` | `0xOwner` | any owned wallet | Yes |
| `0xAgent` | `0xOwner` | `0xAgent` | Only for fund-request (agent acts on its own behalf) |
| `0xOther` | `0xOwner` | any | No → 403 |
| `undefined` | — | — | Only `POST /v1/wallets` (free endpoint) |

**Note: inversion-prone logic.** The fund-request endpoint flips the typical ownership check — the *wallet itself* (agent) calls it, not the owner. Verify this path is tested independently.

### Endpoint specifications

#### `POST /v1/wallets` — Create wallet (FREE)

Request:
```json
{ "chain": "eip155:8453" }
```
`chain` is optional, defaults to `"eip155:8453"`.

Response (201):
```json
{
  "address": "0xabc...",
  "chain": "eip155:8453",
  "balance": "0.00",
  "funded": false,
  "createdAt": "2026-02-24T12:00:00.000Z"
}
```

No `createdBy` field in response — this wallet has no owner until it receives its first x402-authenticated request. The first paying caller who accesses this wallet becomes its owner (recorded in DB as `createdBy`).

**Wait — this creates an ownership race condition.** If the wallet address is returned to the creator, anyone who knows the address could call a paid endpoint first and claim ownership. **Resolution:** `createdBy` is set at creation time using a different mechanism. Two options:

| Option | How | Tradeoff |
|--------|-----|----------|
| A: Optional `owner` field in create request | `{ "chain": "...", "owner": "0xOwnerAddr" }` | Requires the creator to already have a wallet (chicken-and-egg for first wallet) |
| B: First funded interaction claims ownership | First `c.get("walletAddress")` to hit any paid endpoint on this wallet becomes owner | Race condition if address leaks before owner funds it |
| **C: Return a claim token** | Response includes `claimToken` (random secret). First request with `X-Claim-Token` header claims ownership. | No race. Works for first wallet. One extra header. |

**Recommendation: Option C.** The create response includes a `claimToken`. The creator passes this token in the `X-Claim-Token` header on their first paid request to any endpoint on this wallet. That request's `walletAddress` becomes `createdBy`. Token is single-use, burned after claim.

Revised response (201):
```json
{
  "address": "0xabc...",
  "chain": "eip155:8453",
  "balance": "0.00",
  "funded": false,
  "claimToken": "ctk_a1b2c3d4e5f6...",
  "createdAt": "2026-02-24T12:00:00.000Z"
}
```

#### `GET /v1/wallets` — List wallets

No request body. Query params: `?limit=20&after=0xLastAddress`.

Response (200):
```json
{
  "wallets": [
    {
      "address": "0xabc...",
      "chain": "eip155:8453",
      "balance": "12.50",
      "funded": true,
      "paused": false,
      "createdAt": "2026-02-24T12:00:00.000Z"
    }
  ],
  "cursor": "0xabc..."
}
```

`cursor` is `null` when no more results.

#### `GET /v1/wallets/:address` — Wallet detail

Response (200):
```json
{
  "address": "0xabc...",
  "chain": "eip155:8453",
  "balance": "12.50",
  "funded": true,
  "paused": false,
  "createdBy": "0xOwner...",
  "policy": {
    "maxPerTx": "100.00",
    "maxPerDay": "500.00",
    "dailySpent": "42.00",
    "dailyResetAt": "2026-02-25T00:00:00.000Z"
  },
  "createdAt": "2026-02-24T12:00:00.000Z"
}
```

Balance is fetched live from Base RPC (not cached). `policy` is `null` if no policy set.

#### `DELETE /v1/wallets/:address` — Deactivate wallet

No request body. Soft-delete (sets `deactivatedAt`, stops accepting requests).

Response (200):
```json
{
  "address": "0xabc...",
  "deactivated": true,
  "deactivatedAt": "2026-02-24T12:00:00.000Z"
}
```

Deactivated wallets still hold funds on-chain. The owner can reactivate or sweep funds via direct chain interaction. wallet.sh just stops serving API requests for it.

#### `POST /v1/wallets/:address/send` — Send USDC

Request:
```json
{
  "to": "0xRecipient...",
  "amount": "10.00",
  "idempotencyKey": "idk_unique123"
}
```

`idempotencyKey` is required. Prevents double-sends on retry. From Railgunner's execution journal pattern.

Response (200):
```json
{
  "txHash": "0x...",
  "from": "0xabc...",
  "to": "0xRecipient...",
  "amount": "10.00",
  "chain": "eip155:8453",
  "status": "confirmed",
  "confirmedAt": "2026-02-24T12:00:05.000Z"
}
```

`status` values: `"pending"` (tx submitted), `"confirmed"` (1+ block confirmations), `"failed"` (reverted).

If `idempotencyKey` was already used with the same payload, returns the original result (200). If used with a different payload → 409 `duplicate_request`.

**Idempotency decision table:**

| Key exists? | Same payload? | Action |
|-------------|--------------|--------|
| No | — | Execute, store result |
| Yes | Yes | Return stored result (200) |
| Yes | No | Return 409 `duplicate_request` |

"Same payload" = canonicalized JSON of `{ to, amount }` matches. `idempotencyKey` alone doesn't determine sameness — the payload must also match. **Flag: this is inversion-prone.** A mismatch returns 409, not a re-execution. Test both branches.

#### `POST /v1/wallets/:address/swap` — Swap tokens (DEFERRED)

Returns 501 in v1. Body shape reserved for future:
```json
{
  "from": { "token": "USDC", "amount": "10.00" },
  "to": { "token": "ETH" },
  "idempotencyKey": "idk_swap123"
}
```

#### `GET /v1/wallets/:address/history` — Transaction history

Query params: `?limit=50&after=txn_cursor&type=send|receive|all`

Response (200):
```json
{
  "transactions": [
    {
      "txHash": "0x...",
      "type": "send",
      "from": "0xabc...",
      "to": "0xdef...",
      "amount": "10.00",
      "chain": "eip155:8453",
      "status": "confirmed",
      "timestamp": "2026-02-24T12:00:05.000Z"
    }
  ],
  "cursor": "txn_abc123"
}
```

History is from the execution journal (local DB), not from chain indexing. Only transactions made through wallet.sh appear. External transfers (direct on-chain sends) are not tracked.

#### `POST /v1/wallets/:address/fund-request` — Request funding

Called by the wallet/agent itself, not the owner.

Request:
```json
{
  "amount": "10.00",
  "reason": "Need to provision a VPS via spawn.sh"
}
```

Response (201):
```json
{
  "id": "fr_a1b2c3",
  "walletAddress": "0xabc...",
  "amount": "10.00",
  "reason": "Need to provision a VPS via spawn.sh",
  "status": "pending",
  "createdAt": "2026-02-24T12:00:00.000Z"
}
```

#### `GET /v1/wallets/:address/fund-requests` — List fund requests

Called by the owner. Query params: `?status=pending|approved|denied&limit=20&after=fr_cursor`

Response (200):
```json
{
  "requests": [
    {
      "id": "fr_a1b2c3",
      "walletAddress": "0xabc...",
      "amount": "10.00",
      "reason": "...",
      "status": "pending",
      "createdAt": "2026-02-24T12:00:00.000Z"
    }
  ],
  "cursor": "fr_a1b2c3"
}
```

#### `POST /v1/fund-requests/:id/approve` — Approve fund request

Called by owner. Triggers a USDC transfer from owner's wallet to agent's wallet.

Request: empty body (or `{}`).

Response (200):
```json
{
  "id": "fr_a1b2c3",
  "status": "approved",
  "txHash": "0x...",
  "approvedAt": "2026-02-24T12:01:00.000Z"
}
```

**Note:** This requires the owner to have a wallet managed by wallet.sh (so wallet.sh can sign the transfer). If the owner's wallet is external, this endpoint can't execute the transfer — it can only mark the request as approved and expect the owner to send funds manually. **v1 scope: owner must have a wallet.sh-managed wallet.**

#### `POST /v1/fund-requests/:id/deny` — Deny fund request

Request:
```json
{ "reason": "Budget exceeded for this month" }
```
`reason` is optional.

Response (200):
```json
{
  "id": "fr_a1b2c3",
  "status": "denied",
  "reason": "Budget exceeded for this month",
  "deniedAt": "2026-02-24T12:01:00.000Z"
}
```

#### `GET /v1/wallets/:address/policy` — Get spending policy

Response (200):
```json
{
  "walletAddress": "0xabc...",
  "maxPerTx": "100.00",
  "maxPerDay": "500.00",
  "allowedPrimitives": ["relay.sh", "spawn.sh"],
  "dailySpent": "42.00",
  "dailyResetAt": "2026-02-25T00:00:00.000Z"
}
```

`allowedPrimitives` is `null` if unrestricted. `maxPerTx` / `maxPerDay` are `null` if no limit set.

#### `PUT /v1/wallets/:address/policy` — Set spending policy

Request:
```json
{
  "maxPerTx": "100.00",
  "maxPerDay": "500.00",
  "allowedPrimitives": ["relay.sh", "spawn.sh"]
}
```

All fields optional. `null` to remove a limit. Response: same shape as GET.

#### `POST /v1/wallets/:address/pause` — Emergency pause

Request:
```json
{ "scope": "all" }
```

`scope` values: `"all"`, `"send"`, `"swap"`. Defaults to `"all"`. From Railgunner's circuit breaker.

Response (200):
```json
{
  "walletAddress": "0xabc...",
  "paused": true,
  "scope": "all",
  "pausedAt": "2026-02-24T12:00:00.000Z"
}
```

#### `POST /v1/wallets/:address/resume` — Resume after pause

Request:
```json
{ "scope": "all" }
```

Response (200):
```json
{
  "walletAddress": "0xabc...",
  "paused": false,
  "scope": "all",
  "resumedAt": "2026-02-24T12:00:00.000Z"
}
```

### x402 Pricing

| Endpoint | Price | Rationale |
|----------|-------|-----------|
| `POST /v1/wallets` | **FREE** | Bootstrap exception — can't pay before having a wallet |
| `GET /v1/wallets` | $0.001 | Read-only, cheap |
| `GET /v1/wallets/:address` | $0.001 | Read-only, includes live RPC balance fetch |
| `DELETE /v1/wallets/:address` | $0.01 | Destructive, discourage frivolous deactivation |
| `POST .../send` | $0.01 | Write operation, triggers on-chain tx |
| `POST .../swap` | $0.01 | Write operation (deferred) |
| `GET .../history` | $0.001 | Read-only |
| `POST .../fund-request` | $0.001 | Write but no on-chain tx |
| `GET .../fund-requests` | $0.001 | Read-only |
| `POST .../approve` | $0.01 | Triggers on-chain tx |
| `POST .../deny` | $0.001 | Write, no on-chain tx |
| `GET .../policy` | $0.001 | Read-only |
| `PUT .../policy` | $0.005 | Write, stored config change |
| `POST .../pause` | $0.001 | Emergency — keep cheap |
| `POST .../resume` | $0.001 | Emergency — keep cheap |

## Phase 1 — Type definitions

### File: `packages/wallet/src/api.ts`

Define TypeScript types for every request/response shape listed above. Group by domain:

- `WalletCreateRequest`, `WalletCreateResponse`
- `WalletListResponse`, `WalletDetailResponse`
- `SendRequest`, `SendResponse`
- `HistoryResponse`, `TransactionRecord`
- `FundRequestCreateRequest`, `FundRequestResponse`, `FundRequestListResponse`
- `PolicyResponse`, `PolicyUpdateRequest`
- `PauseRequest`, `PauseResponse`, `ResumeResponse`
- `ApiError` (the error envelope)
- `CursorPagination` (generic `{ cursor: string | null }`)

No runtime validation yet — just types. Zod schemas come in W-2+ when handlers need input validation.

## Phase 2 — Route stubs with pricing

### File: `packages/wallet/src/index.ts`

Replace the current minimal app with full route definitions. Each route:
1. Has the correct HTTP method and path
2. Is wired into x402 middleware with the pricing table above
3. Returns `501 Not Implemented` with the error envelope
4. Has the correct TypeScript return type annotation

Update the `createAgentStackMiddleware` call to include all paid routes in the pricing config and `POST /v1/wallets` + `GET /` in `freeRoutes`.

## Phase 3 — Spec update

### File: `specs/wallet.md`

- Replace "ethers.js v6" with "viem" in the architecture diagram
- Add note about claim token ownership model
- Add note about viem as the crypto library choice

## Phase 4 — Tests

### File: `packages/wallet/test/api.test.ts`

Test the route stubs using Hono's test client:

```
assert response.status === 201 for POST /v1/wallets (free, returns stub)
assert response.status === 402 for GET /v1/wallets without payment header
assert response.status === 402 for POST /v1/wallets/:address/send without payment header
assert response.status === 501 for all stub routes (when payment would be bypassed in test)
assert response body matches { error: { code: "not_implemented" } } for stub routes
assert GET / returns 200 { service: "wallet.sh", status: "ok" } (health check, free)
```

Mock the facilitator as in x402-middleware tests (stub `/supported` endpoint).

## Dependency direction

```
viem (npm)  ←  @agentstack/wallet  →  @agentstack/x402-middleware  →  @x402/*
                     ↓
               bun:sqlite (runtime)
```

- `@agentstack/wallet` depends on: `hono`, `@agentstack/x402-middleware` (workspace), `viem` (new dep)
- `@agentstack/wallet` does NOT depend on `@x402/*` directly
- `viem` is added as a dependency in this task (needed for types like `Address`, `Hex`)
- `bun:sqlite` is a runtime import, no npm dep needed

## Files changed (summary)

| File | Action |
|------|--------|
| `packages/wallet/src/api.ts` | **New** — all request/response types |
| `packages/wallet/src/index.ts` | Replace stub with full route definitions + pricing |
| `packages/wallet/package.json` | Add `viem` dependency |
| `packages/wallet/test/api.test.ts` | **New** — route stub tests |
| `specs/wallet.md` | Update ethers.js → viem, add ownership model notes |

## Before closing

- [ ] Run `pnpm -r check` (lint + typecheck + test pass across all packages)
- [ ] Re-read each endpoint spec above and locate the route definition + type that enforces it
- [ ] For every boolean condition (ownership check, idempotency match, pause check), verify both True and False paths are covered by tests
- [ ] Verify all 15 endpoints are registered in the Hono app (count them)
- [ ] Verify the pricing config in `createAgentStackMiddleware` matches the pricing table above (no endpoint missing, no price mismatch)
- [ ] Verify `POST /v1/wallets` is in `freeRoutes` and returns 201 without payment
- [ ] Verify `specs/wallet.md` no longer references ethers.js
