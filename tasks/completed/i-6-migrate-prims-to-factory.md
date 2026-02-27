# I-6: Migrate Remaining 8 Prims to createPrimApp()

**Status:** pending
**Goal:** Migrate wallet, store, spawn, faucet, email, mem, domain, and token from hand-wired boilerplate to `createPrimApp()` factory. Three prims need factory extensions first.
**Scope:** `packages/x402-middleware/src/create-prim-app.ts` (extend), 8× `packages/<prim>/src/index.ts` (rewrite)

## Context

I-5 created the factory and migrated track + search as proof. The factory currently supports standard prims that use x402 middleware with default body limits. Three of the remaining 8 prims have non-standard patterns requiring factory extensions:

| Prim | Issue | Factory Extension |
|------|-------|-------------------|
| **wallet.sh** | Uses local allowlist checker (`createAllowlistChecker` from `allowlist-db`), has admin/internal routes, circuit breaker | `skipX402: true` — wallet wires its own x402 middleware |
| **faucet.sh** | No x402 at all (free service), custom health check with network info, testnet guard middleware | `freeService: true` + `skipHealthCheck: true` |
| **store.sh** | Conditional body limit (skip for PUT /objects/* uploads) | `skipBodyLimit: true` — store wires its own conditional limit |

## Phase 1: Factory Extensions

Modify `packages/x402-middleware/src/create-prim-app.ts`.

### New config fields on `PrimAppConfig`

| Field | Type | Default | Effect |
|-------|------|---------|--------|
| `freeService` | `boolean` | `false` | Skip PRIM_PAY_TO validation, skip x402 middleware, skip allowlist. For free prims (faucet). |
| `skipX402` | `boolean` | `false` | Skip x402 middleware registration only. PRIM_PAY_TO still validated. Prim wires its own x402. For prims with custom payment flows (wallet). |
| `skipBodyLimit` | `boolean` | `false` | Skip factory's bodyLimit middleware. Prim adds its own conditional limit. For prims with route-specific limits (store). |
| `skipHealthCheck` | `boolean` | `false` | Skip `GET /` health check registration. Prim registers its own. For prims with custom health responses (faucet). |

### `PrimAppDeps` changes

Make `createAgentStackMiddleware` and `createWalletAllowlistChecker` optional. Throw at runtime if they're needed (neither `freeService` nor `skipX402` is set) but not provided.

### Behavioral matrix

```
                     | freeService | skipX402 | default |
---------------------|-------------|----------|---------|
PRIM_PAY_TO required | No          | Yes      | Yes     |
getNetworkConfig()   | No          | Yes      | Yes     |
allowlist created    | No          | No       | Yes     |
x402 middleware      | No          | No       | Yes     |
requestId middleware | Yes         | Yes      | Yes     |
bodyLimit middleware | *           | *        | *       |
metricsMiddleware    | if set      | if set   | if set  |
health check (GET /) | **          | **       | Yes     |
llms.txt (GET /)     | Yes         | Yes      | Yes     |

*  = unless skipBodyLimit
** = unless skipHealthCheck
```

### Export `create-prim-app.ts` changes

Also re-export the new config fields from `packages/x402-middleware/src/index.ts` (already exports `createPrimApp`, `PrimAppConfig`, etc.).

## Phase 2: Migrate All 8 Prims

All 8 prims modify different `index.ts` files — no file conflicts. Each migration follows the same pattern:

1. Replace boilerplate (Hono import, bodyLimit import, env validation, middleware setup, health check, llms.txt, pricing, AppVariables type) with `createPrimApp()` call
2. Keep domain-specific error helpers, service imports, and all route handlers
3. Import `createAgentStackMiddleware` and `createWalletAllowlistChecker` from `@primsh/x402-middleware` and pass as deps (for testability via `vi.mock`)
4. Existing smoke tests must pass unchanged

### Per-prim migration specs

#### spawn.sh (standard)

Config: `{ name: "spawn.sh", routes: SPAWN_ROUTES, metrics: true, pricing: [...] }`

- Remove local `providerError()` — use factory's export
- Keep: `serviceError` import from x402-middleware, all route handlers
- Lines: ~347 → ~250

#### email.sh (standard + internal route)

Config: `{ name: "email.sh", routes: EMAIL_ROUTES, freeRoutes: ["POST /internal/hooks/ingest"], metrics: true, pricing: [...] }`

- Keep: `stalwartError()` domain helper, `POST /internal/hooks/ingest` handler
- Lines: ~427 → ~310

#### mem.sh (standard, fixes health check bug)

Config: `{ name: "mem.sh", routes: MEM_ROUTES }`

- **Bug fix**: Current `GET /` serves llms.txt content instead of health check JSON. After migration, factory's `GET /` returns standard `{ service: "mem.sh", status: "ok" }`. The `GET /llms.txt` route continues to serve llms.txt as expected.
- No metrics or pricing currently configured
- Keep: `backendError()` domain helper, all route handlers
- Lines: ~265 → ~185

#### domain.sh (standard + custom x402 route)

Config: `{ name: "domain.sh", routes: DOMAIN_ROUTES, freeRoutes: ["POST /v1/domains/recover", "POST /v1/domains/[domain]/configure-ns"] }`

- `POST /v1/domains/register` handles x402 payment protocol manually (dynamic pricing from quotes). This route is neither in `DOMAIN_ROUTES` nor `freeRoutes` — the middleware passes it through as unknown, and the handler returns 402 with payment requirements directly.
- Keep: `facilitatorClient`, `cloudflareError()`, `serviceUnavailable()`, all route handlers, `@x402/core/http` imports
- domain.sh currently reads `process.env.PRIM_NETWORK ?? "eip155:8453"` directly — the factory uses `getNetworkConfig()`. domain.sh still needs NETWORK for its register route's payment requirements. After migration, import `getNetworkConfig` from x402-middleware and call it in the register handler.
- Lines: ~562 → ~455

#### token.sh (standard)

Config: `{ name: "token.sh", routes: TOKEN_ROUTES }`

- Keep: all domain-specific error helpers (`rpcError`, `notMintable`, `exceedsMaxSupply`, `poolExists`), all route handlers
- No metrics or pricing
- Lines: ~250 → ~180

#### wallet.sh (skipX402)

Config: `{ name: "wallet.sh", skipX402: true, metrics: true, pricing: [...] }`

After factory returns app, wallet.sh manually:
1. Reads `PRIM_INTERNAL_KEY` env var
2. Creates local `createAllowlistChecker(ALLOWLIST_DB_PATH)` from `@primsh/x402-middleware/allowlist-db`
3. Registers its own `createAgentStackMiddleware()` with local allowlist checker and its full freeRoutes list
4. Registers admin and internal routes

**Deps**: Pass `createAgentStackMiddleware` and `createWalletAllowlistChecker` (even though factory won't use them when skipX402). This preserves the existing test pattern — `vi.mock("@primsh/x402-middleware")` captures the spy on `createAgentStackMiddleware` which wallet calls directly.

Wait — wallet currently has a minimal smoke test (only check 1: export defined). The full 5-check smoke test will need the spy pattern. For now, just preserve existing behavior.

Keep: `internalAuth()`, circuit breaker imports, all route handlers, local allowlist checker
Lines: ~513 → ~420

#### faucet.sh (freeService)

Config: `{ name: "faucet.sh", freeService: true, skipHealthCheck: true, metrics: true }`

Deps: `{}` (empty — no x402-related deps needed)

After factory returns app, faucet.sh manually:
1. Registers testnet guard middleware (`app.use("*", ...)`)
2. Registers custom `GET /` health check that includes `network` and `testnet` fields
3. Registers all route handlers with inline allowlist checks

Keep: `RateLimiter` instances, `checkAllowlist` (faucet creates its own via `createWalletAllowlistChecker`), testnet guard, viem imports
Lines: ~213 → ~160

**Note**: faucet's `createWalletAllowlistChecker` is used in route handlers (not middleware). Faucet imports it directly and calls it per-request. This is separate from the factory's allowlist.

#### store.sh (skipBodyLimit)

Config: `{ name: "store.sh", routes: STORE_ROUTES, skipBodyLimit: true, metrics: true, pricing: [...] }`

After factory returns app, store.sh registers its own conditional bodyLimit middleware:
- For `PUT /v1/buckets/*/objects/*` → skip bodyLimit (streaming uploads)
- For everything else → 1MB limit

**Middleware ordering**: The factory registers requestId → (skip bodyLimit) → metrics → x402. Store's conditional bodyLimit runs after x402 in Hono's middleware chain. This is acceptable because x402 middleware reads headers (payment-signature), not the request body, so body size enforcement after x402 is functionally equivalent.

Keep: `r2Error()`, `quotaExceeded()`, `bucketLimitExceeded()`, `storageLimitExceeded()`, `extractObjectKey()`, all route handlers
Lines: ~356 → ~280

## Testing Strategy

- All existing smoke tests must pass unchanged after migration
- Run `pnpm -r test` to verify no regressions across all packages
- The factory extension tests (Phase 1) are implicitly tested by the prim migrations — if freeService/skipX402/skipBodyLimit break, the migrated prim's tests will fail

## Before Closing

- [ ] `pnpm -r test` passes (all packages)
- [ ] All 8 migrated prims' existing tests pass
- [ ] mem.sh `GET /` returns health check JSON (not llms.txt)
- [ ] Factory extensions (freeService, skipX402, skipBodyLimit, skipHealthCheck) are used by at least one prim each
- [ ] No behavioral change in any prim's API responses
- [ ] spawn.sh no longer defines its own `providerError()` — uses factory export
