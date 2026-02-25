# D-3: Build domain.sh — Domain Registration Endpoint (Registrar Purchase API)

**Status:** Plan
**Depends on:** D-2 (done — NameSilo client + search endpoint exist)
**Blocks:** D-7 (auto-configure NS after registration)

## Context

An agent that wants a domain today hits a wall after `GET /v1/domains/search` — it can see what's available but can't buy anything. Registration is the keystone between "browsing" and "owning infrastructure." It also unblocks D-7 (post-registration NS auto-config), which closes the full search→buy→configure loop.

The NameSilo client (`namesilo.ts`) already implements `register()` and `setNameservers()`. Cloudflare zone creation (`createZone`) exists in `service.ts`. This task wires them together with a quote-then-purchase flow and dynamic x402 pricing.

## Goals

1. Quote endpoint — real-time pricing with time-limited quote ID
2. Register endpoint — NameSilo purchase + Cloudflare zone + NS auto-config, paid via dynamic x402
3. Recovery endpoint — retry Cloudflare setup if it failed after successful NameSilo purchase
4. NS retry endpoint — retry nameserver change if zone creation succeeded but NS change failed

## Phase 1 — DB Schema

### New tables in `db.ts`

**`quotes` table** — time-limited price quotes for domain registration.

```
id            TEXT PRIMARY KEY     -- "q_" + 8 hex chars
domain        TEXT NOT NULL
years         INTEGER NOT NULL DEFAULT 1
registrar_cost_cents  INTEGER NOT NULL   -- NameSilo price in cents (avoids float)
margin_cents          INTEGER NOT NULL   -- prim.sh margin in cents
total_cents           INTEGER NOT NULL   -- registrar_cost + margin
caller_wallet TEXT NOT NULL
created_at    INTEGER NOT NULL     -- epoch ms
expires_at    INTEGER NOT NULL     -- created_at + 15 min
```

**`registrations` table** — persistent record of all domain registrations (also serves as recovery token store).

```
id                 TEXT PRIMARY KEY  -- "reg_" + 8 hex chars
domain             TEXT NOT NULL UNIQUE
quote_id           TEXT NOT NULL REFERENCES quotes(id)
recovery_token     TEXT UNIQUE       -- "rt_" + 16 hex chars (nullable if fully succeeded)
namesilo_order_id  TEXT              -- from NameSilo response
zone_id            TEXT              -- domain.sh zone ID (nullable if CF failed)
ns_configured      INTEGER NOT NULL DEFAULT 0  -- 0 or 1
owner_wallet       TEXT NOT NULL
total_cents        INTEGER NOT NULL  -- locked-in price from quote
created_at         INTEGER NOT NULL
updated_at         INTEGER NOT NULL
```

Index: `idx_registrations_recovery_token ON registrations(recovery_token)`, `idx_registrations_owner ON registrations(owner_wallet)`.

### New DB functions

- `insertQuote(params)` — INSERT
- `getQuoteById(id)` — SELECT, returns null if not found
- `insertRegistration(params)` — INSERT
- `getRegistrationByRecoveryToken(token)` — SELECT
- `getRegistrationByDomain(domain)` — SELECT
- `updateRegistration(id, params)` — partial UPDATE (zone_id, ns_configured, recovery_token, updated_at)

**No periodic cleanup for expired quotes** — they're small rows. Lazy check on lookup (`expires_at < Date.now()` → treat as not found). A `DELETE FROM quotes WHERE expires_at < ?` can run daily if needed later.

### Monetary values as integer cents

All prices stored as integer cents, not float USD. This prevents floating-point arithmetic bugs.

| Human USD | `total_cents` | x402 atomic (6 decimals) |
|-----------|--------------|--------------------------|
| $0.99     | 99           | "990000"                 |
| $34.98    | 3498         | "34980000"               |
| $100.00   | 10000        | "100000000"              |

Conversion functions in service.ts:
- `usdToCents(usd: number): number` — `Math.round(usd * 100)`
- `centsToAtomicUsdc(cents: number): string` — `String(BigInt(cents) * 10000n)` (cents × 10000 = 6-decimal atomic)
- `centsToUsd(cents: number): number` — `cents / 100`

## Phase 2 — Types

### New types in `api.ts`

**Quote types:**
```
QuoteRequest       { domain: string; years?: number }
QuoteResponse      { quote_id, domain, available, years, registrar_cost_usd, total_cost_usd, currency, expires_at }
```

**Register types:**
```
RegisterRequest    { quote_id: string }
RegisterResponse   { domain, registered, zone_id (nullable), nameservers (nullable), order_amount_usd, ns_configured, recovery_token (nullable) }
```

**Recovery types:**
```
RecoverRequest     { recovery_token: string }
RecoverResponse    { domain, zone_id, nameservers, ns_configured }
```

**Configure-NS types:**
```
ConfigureNsResponse { domain, nameservers, ns_configured: true }
```

Add `"quote_expired"`, `"registrar_error"`, `"registration_failed"` to `ERROR_CODES`.

## Phase 3 — Service Functions

All new functions live in `service.ts`. Dependency direction:

```
index.ts → service.ts → { db.ts, namesilo.ts, cloudflare.ts }
                       → @x402/core/http (register handler only)
```

### `quoteDomain(request, callerWallet)`

1. Validate domain format (reuse `isValidDomain()`)
2. Get registrar (`getRegistrar()`) — 503 if unavailable
3. Call `registrar.search([domain])` — get real-time pricing
4. If not available → return `{ ok: false, status: 400, code: "domain_taken" }`
5. Calculate margin: `marginCents = Math.max(MARGIN_MIN_CENTS, Math.round(registrarCostCents * MARGIN_RATE))`
6. Generate `q_` ID, store in `quotes` table with `expires_at = Date.now() + QUOTE_TTL_MS`
7. Return QuoteResponse with human-readable USD amounts

**Margin config:** env var `DOMAIN_MARGIN_RATE` (default `0.15` = 15%), `DOMAIN_MARGIN_MIN_CENTS` (default `100` = $1.00 floor). These are read once at module init.

### `registerDomain(quoteId, callerWallet)`

Orchestrates three external calls, handling partial failures:

1. Look up quote → 404 if missing, 410 if expired
2. Check `registrations` table — if domain already registered, return 409
3. **NameSilo `register()`** — purchase domain
4. Insert `registrations` row with `zone_id: null`, `ns_configured: 0`, `recovery_token: "rt_..."`
5. **Cloudflare `createZone()`** — create DNS zone
6. If CF succeeds → update registration row with `zone_id`
7. **NameSilo `setNameservers()`** — point to Cloudflare NS
8. If NS succeeds → update `ns_configured: 1`, clear `recovery_token` (set null)
9. Insert zone into `zones` table (reuse existing zone insertion logic)
10. Return RegisterResponse

**Registration flow decision table:**

| NameSilo register | CF zone create | NS change | HTTP | zone_id    | ns_configured | recovery_token |
|-------------------|----------------|-----------|------|------------|---------------|----------------|
| success           | success        | success   | 201  | set        | true          | null           |
| success           | success        | fails     | 201  | set        | false         | null (NS retryable via configure-ns) |
| success           | fails          | skipped   | 201  | null       | false         | "rt_..."       |
| 261 (unavail)     | skipped        | skipped   | 400  | —          | —             | —              |
| quote expired     | skipped        | skipped   | 410  | —          | —             | —              |
| other error       | skipped        | skipped   | 502  | —          | —             | —              |

**Key invariant:** Once NameSilo purchase succeeds, we ALWAYS insert a registration row and return 201 — even if CF/NS fail. The money is spent; the agent needs to know what happened and have a recovery path.

### `recoverRegistration(recoveryToken, callerWallet)`

For when NameSilo succeeded but CF zone creation failed.

1. Look up registration by `recovery_token` → 404 if not found
2. Verify `owner_wallet` matches → 403 if not
3. If `zone_id` is already set → skip zone creation
4. Call `cfCreateZone(domain)` → update registration with `zone_id`
5. Insert zone into `zones` table with same owner
6. Call NameSilo `setNameservers()` → update `ns_configured`
7. If fully recovered → clear `recovery_token`
8. Return RecoverResponse

No x402 payment — agent already paid during registration.

### `configureNs(domain, callerWallet)`

For when CF zone creation succeeded but NS change at NameSilo failed.

1. Look up registration by domain → 404 if not found
2. Verify owner → 403
3. Look up zone → get Cloudflare NS
4. Call NameSilo `setNameservers(domain, nameservers)`
5. Update `ns_configured = 1` in registration
6. Return ConfigureNsResponse

No x402 payment — part of original registration.

## Phase 4 — Dynamic x402 Payment (Register Handler)

The register route bypasses x402 middleware and implements the x402 payment protocol directly.

### Why not middleware

`paymentMiddlewareFromConfig` takes a static `Record<string, RouteConfig>` at construction time. No per-request pricing hook. Domain prices range from $0.99 to $10,000+. One route doesn't justify a middleware abstraction.

### Dependencies to add

Move `@x402/core` from devDependencies to dependencies in `packages/domain/package.json`. Import:
- `encodePaymentRequiredHeader` from `@x402/core/http` — construct 402 response header
- `decodePaymentSignatureHeader` from `@x402/core/http` — decode payment from request
- `HTTPFacilitatorClient` from `@x402/core/http` — settle payment on-chain
- `getNetworkConfig` from `@agentstack/x402-middleware` — get network, USDC address

### Register handler flow

```
1. Parse body → extract quote_id
2. Look up quote → get total_cents
3. Convert to atomic: amount = centsToAtomicUsdc(total_cents)
4. Read payment header (payment-signature or x-payment)
5. If NO payment header:
   → Construct PaymentRequired { x402Version: 2, accepts: [{ scheme: "exact", network, amount, payTo, asset: usdcAddress, maxTimeoutSeconds: 3600, extra: {} }], resource: { url, description: "Domain registration: {domain}", mimeType: "application/json" } }
   → Encode via encodePaymentRequiredHeader()
   → Return 402 with header "payment-required"
6. If payment header present:
   → Decode via decodePaymentSignatureHeader()
   → Verify accepted.amount === our expected amount (string comparison)
   → If mismatch → return 402 (agent signed wrong amount)
   → Send to facilitator for settlement
   → If settlement fails → return 502 "Payment settlement failed"
   → Extract payer wallet from settlement response
   → Proceed to registerDomain()
```

**Amount verification is critical.** Without it, an agent could sign a payment for $0.01 to buy a $10,000 domain.

| payment header | amount matches | facilitator settle | result |
|----------------|---------------|-------------------|--------|
| absent         | —             | —                 | 402 with PaymentRequired |
| present        | no            | —                 | 402 (wrong amount) |
| present        | yes           | fails             | 502 (settlement failed) |
| present        | yes           | success           | proceed to registerDomain() |

### PAY_TO and NETWORK constants

Reuse the module-level constants already defined in `index.ts`:
```
const PAY_TO_ADDRESS = process.env.PRIM_PAY_TO ?? "0x0000000000000000000000000000000000000000";
const NETWORK = process.env.PRIM_NETWORK ?? "eip155:8453";
```

(Note: PAY_TO_ADDRESS is currently hardcoded to zero address — likely needs a real address before production. Existing code has this same issue.)

### Facilitator client initialization

Instantiate once at module level (same as middleware does):
```
const facilitatorUrl = process.env.FACILITATOR_URL ?? "https://facilitator.payai.network";
const facilitator = new HTTPFacilitatorClient({ url: facilitatorUrl });
```

## Phase 5 — Routes

### New routes in `index.ts`

**`POST /v1/domains/quote`** — standard x402 pricing ($0.001)
- Add to `DOMAIN_ROUTES`: `"POST /v1/domains/quote": "$0.001"`
- Parses body → calls `quoteDomain()` → returns QuoteResponse

**`POST /v1/domains/register`** — dynamic x402 pricing
- NOT in `DOMAIN_ROUTES` (bypasses middleware entirely)
- Handler implements full x402 402/payment/settle flow (see Phase 4)
- On successful payment → calls `registerDomain()` → returns RegisterResponse

**`POST /v1/domains/recover`** — free (already paid)
- NOT in `DOMAIN_ROUTES`
- Extracts wallet from payment-signature header if present (for ownership check)
- Also accepts `X-Wallet-Address` header as fallback (for agents that don't send payment on free routes)
- Calls `recoverRegistration()` → returns RecoverResponse

**`POST /v1/domains/:domain/configure-ns`** — free (already paid)
- NOT in `DOMAIN_ROUTES`
- Same wallet extraction as recover
- Calls `configureNs()` → returns ConfigureNsResponse

### Wallet extraction on free routes

Register extracts wallet from the facilitator settlement response (`payer` field). Recover and configure-ns need the wallet for ownership checks but have no payment. Options:

1. Read `payment-signature` header if present (agent may include it even without 402 challenge)
2. Require a `wallet` field in the request body
3. Use a signed message (like wallet.sh's EIP-191 registration)

**Decision:** Recover uses `recovery_token` as sole auth — only the agent that registered the domain received the token. No wallet needed. Configure-ns requires zone ownership check — read wallet from `payment-signature` header using the existing `extractWalletAddress` logic (already runs via middleware's `extractWalletAddress` for ALL requests). If middleware doesn't set walletAddress (no payment header), return 403.

Actually: the middleware's `extractWalletAddress` runs on `*` (all routes) before the route handler. It reads `payment-signature` or `x-payment` header and sets `walletAddress` context var. So even on routes that bypass payment gating, the wallet is extracted if the agent includes a payment header.

| Route | Auth mechanism | Why |
|-------|---------------|-----|
| quote | x402 middleware ($0.001) | Standard pricing |
| register | x402 dynamic (quote price) | Handler settles, extracts payer |
| recover | recovery_token in body | Token is a capability — possessing it proves ownership |
| configure-ns | walletAddress from payment-signature header | Matches registration owner |

## Phase 6 — NameSilo Client Enhancement

Add `code` field to `NameSiloError` so the service layer can distinguish error types:

```
export class NameSiloError extends Error {
  public readonly code: number;
  constructor(message: string, code?: number) { ... }
}
```

Update `register()` to pass the code: `throw new NameSiloError("...", body.reply.code)`.

Key codes the service checks:
- 261 → domain unavailable → return 400 `domain_taken`
- 280 → API key error → return 502 `registrar_error`
- Other → return 502 `registrar_error`

## Files Changed

| File | Action | What changes |
|------|--------|-------------|
| `packages/domain/src/db.ts` | Modify | Add `quotes` + `registrations` tables, insert/get/update functions |
| `packages/domain/src/api.ts` | Modify | Add Quote/Register/Recover/ConfigureNs types, new error codes |
| `packages/domain/src/service.ts` | Modify | Add `quoteDomain`, `registerDomain`, `recoverRegistration`, `configureNs`, cent/atomic conversion helpers |
| `packages/domain/src/index.ts` | Modify | Add 4 new route handlers, add quote to DOMAIN_ROUTES, facilitator client init, x402 imports |
| `packages/domain/src/namesilo.ts` | Modify | Add `code` field to `NameSiloError`, pass code in `register()` |
| `packages/domain/package.json` | Modify | Move `@x402/core` to dependencies |
| `packages/domain/test/domain.test.ts` | Modify | Add tests for all new endpoints |

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Dynamic x402 pricing | Application-level, not middleware | `paymentMiddlewareFromConfig` is static. One route doesn't justify forking the middleware. |
| Price storage | Integer cents in SQLite | Avoids floating-point arithmetic. `34.98` → `3498`. |
| Quote TTL | 15 minutes | Long enough for agent to decide, short enough that registrar price won't change. |
| Margin | 15% with $1 floor (env-configurable) | Scales with domain cost. $0.99 domain → $1.99 total. $100 domain → $115 total. |
| Recovery tokens | Capability-based auth (no wallet check) | Only the registering agent receives the token. Simpler than requiring a signed proof on a free endpoint. |
| Non-atomic registration | Correct — return partial success | NameSilo + Cloudflare are independent. Lying about failure after money is spent is worse than showing partial success. |
| NS at registration time | Two-step (register, then changeNS) | NameSilo silently falls back to default NS (code 301) if any NS is invalid. Separate call is reliable. |
| Auto-renew | Off (`auto_renew=0`) | No surprise charges. Agent explicitly renews. |
| WHOIS privacy | On (`private=1`) | Free on NameSilo. Agents don't want operator contact public. |
| Expired quote cleanup | Lazy (check on lookup) | Quotes are small rows. No need for a background sweeper in v1. |

## Test Assertions

### Quote endpoint

- `assert response.status === 200` for valid domain with NAMESILO_API_KEY set
- `assert response.json().quote_id` starts with `"q_"`
- `assert response.json().total_cost_usd > response.json().registrar_cost_usd` (margin applied)
- `assert response.json().expires_at` is ISO 8601 and ~15 min from now
- `assert response.status === 503` when NAMESILO_API_KEY is unset
- `assert response.status === 400` for unavailable domain (`domain_taken`)
- `assert response.status === 400` for malformed domain

### Register endpoint — 402 flow

- `assert response.status === 402` when no payment header sent
- `assert response.headers["payment-required"]` is present and base64-decodable
- `assert decoded.accepts[0].amount === centsToAtomicUsdc(quote.total_cents)` (amount matches quote)
- `assert response.status === 402` when payment header has wrong amount
- `assert response.status === 410` when quote_id is expired
- `assert response.status === 404` when quote_id doesn't exist

### Register endpoint — success flow (mocked NameSilo + CF + facilitator)

- `assert response.status === 201` on full success
- `assert response.json().registered === true`
- `assert response.json().zone_id` starts with `"z_"`
- `assert response.json().ns_configured === true`
- `assert response.json().recovery_token === null` (no recovery needed)
- `assert db.getRegistrationByDomain(domain).namesilo_order_id` is set

### Register endpoint — partial failure

- When CF createZone fails after NameSilo succeeds:
  `assert response.status === 201`
  `assert response.json().zone_id === null`
  `assert response.json().recovery_token` starts with `"rt_"`
  `assert response.json().ns_configured === false`

- When NS change fails after both NameSilo + CF succeed:
  `assert response.status === 201`
  `assert response.json().zone_id !== null`
  `assert response.json().ns_configured === false`
  `assert response.json().recovery_token === null` (zone exists, use configure-ns instead)

### Recovery endpoint

- `assert response.status === 200` with valid recovery_token (CF mocked success)
- `assert response.json().zone_id` starts with `"z_"`
- `assert response.status === 404` with invalid token
- `assert db.getRegistrationByDomain(domain).recovery_token === null` after successful recovery

### Configure-NS endpoint

- `assert response.status === 200` with valid domain + matching owner wallet
- `assert response.json().ns_configured === true`
- `assert response.status === 403` with wrong wallet
- `assert response.status === 404` with unregistered domain

### NameSiloError code field

- `assert new NameSiloError("msg", 261).code === 261`
- `assert new NameSiloError("msg").code === undefined` (backwards compat)

### Monetary conversions

- `assert usdToCents(34.98) === 3498`
- `assert usdToCents(0.99) === 99`
- `assert centsToAtomicUsdc(3498) === "34980000"`
- `assert centsToAtomicUsdc(99) === "990000"`
- `assert centsToUsd(3498) === 34.98`

## Env Vars (new)

| Var | Required | Default | Used by |
|-----|----------|---------|---------|
| `DOMAIN_MARGIN_RATE` | No | `0.15` | Quote pricing (15% margin) |
| `DOMAIN_MARGIN_MIN_CENTS` | No | `100` | Quote pricing ($1.00 floor) |
| `FACILITATOR_URL` | No | `https://facilitator.payai.network` | Register payment settlement |

Existing vars (`NAMESILO_API_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `PRIM_PAY_TO`, `PRIM_NETWORK`) are unchanged.

## Before Closing

- [ ] Run `pnpm -C packages/domain check` (lint + typecheck + test pass)
- [ ] Quote returns correct margin calculation: `total_cents = registrar_cost_cents + max(MIN_MARGIN, round(cost * MARGIN_RATE))`
- [ ] Quote expires after 15 minutes — re-read quote row and verify `expires_at < Date.now()` returns 410
- [ ] Register route is NOT in DOMAIN_ROUTES (bypasses x402 middleware)
- [ ] Register handler returns valid x402 `payment-required` header when no payment sent
- [ ] Register handler verifies `payment.accepted.amount === centsToAtomicUsdc(quote.total_cents)` — wrong amount returns 402, not 200
- [ ] Register handler settles via facilitator before calling NameSilo
- [ ] Register: NameSilo called with `private=1` and `auto_renew=0`
- [ ] Register: partial failure (CF fails after NameSilo) returns 201 with `recovery_token`, not 500
- [ ] Register: `registrations` row inserted immediately after NameSilo success (before CF call)
- [ ] Recovery endpoint requires no x402 payment — recovery_token is sufficient auth
- [ ] Recovery endpoint rejects invalid/unknown tokens with 404
- [ ] Configure-ns requires wallet ownership of the registration
- [ ] NameSiloError includes `code` field for error discrimination (261 = unavailable)
- [ ] All monetary values stored as integer cents — no floating point in DB
- [ ] `centsToAtomicUsdc()` uses BigInt math (no float→string precision loss)
- [ ] For every boolean condition, verify both True and False paths are covered by tests
- [ ] Existing D-1/D-2 tests still pass (no regressions in zone/record/search/verify/batch/mail-setup)
