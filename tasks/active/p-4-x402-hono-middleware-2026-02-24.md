# P-4: Build shared x402 Hono middleware package

**Status:** Plan
**Spec:** `specs/platform.md` (x402 Integration Pattern section)
**Depends on:** P-3 (monorepo — done)
**Blocks:** W-1+ (all wallet.sh endpoints), R-10 (relay x402 gate), SP-5 (spawn x402 gate)

## Context

Every AgentStack primitive gates its endpoints behind x402 payment. The current `@agentstack/x402-middleware` package (created in P-3) is a no-op stub with custom types that don't match the official x402 API.

**Key discovery:** Coinbase publishes `@x402/hono` (v2.4.0) — a first-party Hono middleware that handles the full 402 flow (payment header parsing, facilitator verification, settlement). There is no need to implement the protocol from scratch.

**What this task does:** Replace the stub with a thin wrapper around `@x402/hono` that adds AgentStack-specific concerns:
- Simplified configuration (one `payTo` address + price per route, not nested `accepts` arrays)
- Wallet address extraction from payment context (the agent's identity for route handlers)
- Free-endpoint bypass (e.g., `POST /v1/wallets` must be free — can't pay before having a wallet)
- Re-export of useful types so primitives import from `@agentstack/x402-middleware` only

## Goals

1. Primitives can gate any route behind x402 payment with ~5 lines of config
2. Route handlers can access the paying agent's wallet address via Hono context
3. Specific routes can be marked free (bypass payment)
4. All x402 protocol complexity is hidden behind the wrapper
5. Tests verify the middleware integration without hitting a real facilitator

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Build vs wrap | Wrap `@x402/hono` | Official middleware handles protocol, headers, facilitator. No reason to reimplement. |
| Config API | Flat `{ "POST /v1/wallets/:address/send": "$0.01" }` map | Simpler than `@x402/hono`'s nested `RouteConfig.accepts[]`. One network, one scheme for now. |
| Chain | Base mainnet (`eip155:8453`) default, configurable | All AgentStack primitives run on Base. |
| Facilitator | `https://x402.org/facilitator` default | Coinbase's hosted facilitator. Self-host later. |
| Free routes | Explicit `freeRoutes: string[]` option | wallet.sh `POST /v1/wallets` is the canonical free endpoint. Others may follow. |
| Wallet address | Extracted from payment payload, set on Hono context variable | Route handlers call `c.get("walletAddress")` to get the paying agent's address. |
| Scheme | `@x402/evm` `ExactEvmScheme` only | EVM exact-amount is the only scheme AgentStack needs now. SVM later. |

## Phase 1 — Replace stub types and middleware

### Files to modify

**`packages/x402-middleware/package.json`**
- Add dependencies: `@x402/core`, `@x402/hono`, `@x402/evm`
- Keep `hono` as peer dependency (already there)
- Add `@types/node` as dev dependency if needed for test mocks

**`packages/x402-middleware/src/types.ts`** — Replace entirely
- `AgentStackRouteConfig`: simplified flat map `Record<string, string | RouteConfig>` where string value is shorthand for price (e.g., `"$0.001"`)
- `AgentStackMiddlewareOptions`: `{ payTo: string; network?: string; facilitatorUrl?: string; freeRoutes?: string[] }`
- Re-export useful types from `@x402/core/types`: `PaymentRequired`, `PaymentPayload`, `Network`

**`packages/x402-middleware/src/middleware.ts`** — Replace entirely
- `createAgentStackMiddleware(options, routes)` → returns Hono `MiddlewareHandler`
- Internally:
  1. Create `HTTPFacilitatorClient` with options.facilitatorUrl
  2. Create `x402ResourceServer` and register `ExactEvmScheme` for the configured network
  3. Transform flat `routes` map into `@x402/hono` `RoutesConfig` format (expand `"$0.001"` to full `{ accepts: [{ scheme: "exact", price, network, payTo }] }`)
  4. Mark `freeRoutes` by excluding them from the routes config (they won't trigger 402)
  5. Return `paymentMiddleware(transformedRoutes, server)`
- Wallet address extraction: use `ProtectedRequestHook` or post-handler hook on `x402ResourceServer` to read the decoded payment payload and set `c.set("walletAddress", address)` on the Hono context

**`packages/x402-middleware/src/index.ts`** — Update exports
- Export `createAgentStackMiddleware` (renamed from `createX402Middleware`)
- Export all types
- Re-export `x402ResourceServer` and `HTTPFacilitatorClient` for advanced use

### Wallet address extraction — design detail

The `@x402/hono` middleware decodes the `Payment-Signature` header internally but doesn't expose the decoded payload to downstream handlers. Two approaches:

| Approach | How | Tradeoff |
|----------|-----|----------|
| A: Decode header ourselves | Read `Payment-Signature` header in a pre-middleware, base64-decode, extract `payload.authorization.from` | Duplicates parsing but zero coupling to x402 internals |
| B: Use `ProtectedRequestHook` | Register hook on `x402ResourceServer` that receives `HTTPRequestContext` with parsed payment data | Cleaner but depends on hook receiving wallet address (verify in x402 source) |

**Recommendation: Approach A.** The `Payment-Signature` header is a stable protocol contract (base64-encoded JSON with a known schema). Parsing it ourselves is ~5 lines and doesn't depend on x402 internal hook signatures. Wrap this in a second Hono middleware that runs before the x402 middleware:

```
agentstack-identity-middleware → x402-payment-middleware → route handler
```

The identity middleware:
1. Reads `Payment-Signature` or `X-Payment` header
2. If present: base64-decode → JSON parse → extract signer address → `c.set("walletAddress", address)`
3. If absent: skip (free route or will get 402'd by the next middleware)

For free routes, `walletAddress` will be `undefined` — route handlers must handle this (wallet creation doesn't need it).

### Payment header schema (from x402 spec, EVM exact scheme)

The `Payment-Signature` header base64-decodes to:

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "eip155:8453",
  "payload": {
    "signature": "0x...",
    "authorization": {
      "from": "0xAgentWalletAddress",  // ← this is what we extract
      "to": "0xPayToAddress",
      "value": "1000",
      "validAfter": "0",
      "validBefore": "...",
      "nonce": "0x..."
    }
  }
}
```

**Decision table — wallet address availability:**

| Has payment header | Free route | `c.get("walletAddress")` |
|--------------------|------------|--------------------------|
| Yes                | No         | `"0xAbc..."` (from decoded header) |
| Yes                | Yes        | `"0xAbc..."` (still extracted) |
| No                 | Yes        | `undefined` |
| No                 | No         | `undefined` (will 402 before reaching handler) |

## Phase 2 — tsconfig fix for declaration emit

The current `tsconfig.json` doesn't emit `.d.ts` files. Add `"declaration": true` to `compilerOptions` so consuming packages get type information from `dist/`.

**File:** `packages/x402-middleware/tsconfig.json`
- Add `"declaration": true` to `compilerOptions`

## Phase 3 — Tests

**`packages/x402-middleware/test/middleware.test.ts`** — Replace smoke test

Test cases using Hono's test client (`app.request()`):

1. **Free route bypasses payment** — Request to a free route → 200, no payment headers required
   - Assert: `response.status === 200`

2. **Paid route without payment header returns 402** — Request without `Payment-Signature` → 402
   - Assert: `response.status === 402`
   - Assert: response has `Payment-Required` header (base64-encoded)
   - Assert: decoded header contains `accepts` array with correct `payTo`, `network`, `price`

3. **Wallet address extracted from payment header** — Inject a mock `Payment-Signature` header with known `from` address
   - Assert: route handler receives `c.get("walletAddress") === "0xTestAddress"`

4. **Invalid payment header handled gracefully** — Malformed base64 in `Payment-Signature`
   - Assert: `walletAddress` is `undefined`, request proceeds to x402 middleware (which will 402)

**Testing strategy for facilitator calls:** The `HTTPFacilitatorClient` makes HTTP calls to the facilitator. For unit tests, either:
- Mock the facilitator client (inject a stub `FacilitatorClient` into `x402ResourceServer`)
- Use `msw` (Mock Service Worker) to intercept facilitator HTTP calls

Prefer facilitator client injection since `x402ResourceServer` accepts it as a constructor arg.

**Exact assertions:**
```
assert response.status === 402 when no Payment-Signature header on paid route
assert response.status === 200 when requesting a free route without payment
assert c.get("walletAddress") === "0xTestAddress" when Payment-Signature contains from: "0xTestAddress"
assert c.get("walletAddress") === undefined when Payment-Signature header is absent
assert c.get("walletAddress") === undefined when Payment-Signature header is malformed base64
```

## Phase 4 — Wire into one primitive (wallet.sh)

**`packages/wallet/package.json`**
- Add dependency: `@agentstack/x402-middleware` (workspace link)

**`packages/wallet/src/index.ts`**
- Import `createAgentStackMiddleware` from `@agentstack/x402-middleware`
- Apply middleware with pricing config and `freeRoutes: ["POST /v1/wallets"]`
- Update existing `GET /` health check to remain free (add to freeRoutes)

This is a minimal wiring — just enough to prove the middleware works in a real primitive. Full wallet.sh endpoints are W-1+.

## Dependency direction

```
@x402/core ← @x402/evm ← @agentstack/x402-middleware ← @agentstack/wallet
@x402/hono ←──────────────┘                              @agentstack/relay
                                                          @agentstack/spawn
```

- `@agentstack/x402-middleware` depends on `@x402/core`, `@x402/hono`, `@x402/evm`
- Primitives depend on `@agentstack/x402-middleware` (workspace link) and `hono` (direct)
- Primitives never import from `@x402/*` directly — all x402 surface goes through the wrapper

## Files changed (summary)

| File | Action |
|------|--------|
| `packages/x402-middleware/package.json` | Add `@x402/core`, `@x402/hono`, `@x402/evm` deps |
| `packages/x402-middleware/src/types.ts` | Replace with AgentStack-specific types + re-exports |
| `packages/x402-middleware/src/middleware.ts` | Replace stub with wrapper around `@x402/hono` |
| `packages/x402-middleware/src/index.ts` | Update exports |
| `packages/x402-middleware/tsconfig.json` | Add `declaration: true` |
| `packages/x402-middleware/test/middleware.test.ts` | Replace smoke test with real tests |
| `packages/wallet/package.json` | Add `@agentstack/x402-middleware` dep |
| `packages/wallet/src/index.ts` | Wire middleware into app |

## Before closing

- [ ] Run `pnpm -r check` (lint + typecheck + test pass across all packages)
- [ ] Re-read each goal and locate the line of code that enforces it
- [ ] For every boolean condition (free route check, header presence), verify both True and False paths are covered by tests
- [ ] Verify `declaration: true` produces `.d.ts` files in `dist/`
- [ ] Confirm primitives import only from `@agentstack/x402-middleware`, never from `@x402/*` directly
- [ ] Verify wallet address extraction works with the actual `Payment-Signature` header format (base64 → JSON → `payload.authorization.from`)
