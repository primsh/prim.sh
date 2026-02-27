# I-5: createPrimApp() Factory

**Status:** pending
**Goal:** Extract the ~70 lines of identical boilerplate from every prim's `index.ts` into a shared factory function, reducing each prim's entry file to ~15 lines of route handler registrations.
**Scope:** `packages/x402-middleware/src/create-prim-app.ts` (new), `packages/track/src/index.ts`, `packages/search/src/index.ts`

## Problem

Every prim's `index.ts` repeats the same preamble: env validation, middleware wiring (requestId, bodyLimit, metrics, x402), health check route, llms.txt route, pricing route, and error helper definitions. Compare `track/src/index.ts` (115 lines) with `search/src/index.ts` (177 lines) — ~70 lines are structurally identical. This duplicated boilerplate is:

- A maintenance burden — middleware changes must be applied to 10+ files
- A conformance risk — inconsistencies creep in (some prims have metrics, some don't; freeRoutes lists vary)
- A barrier to new prims — every new prim copy-pastes ~70 lines and tweaks names

## Design

### Factory function signature

```ts
createPrimApp(config: PrimAppConfig): Hono<{ Variables: AppVariables }>
```

Config shape (conceptual — not implementation code):
- `name` — prim name (e.g. "track.sh"), used in health check response and logger
- `routes` — paid route map (`Record<string, string>`, e.g. `{ "POST /v1/track": "$0.05" }`)
- `freeRoutes?` — additional free routes beyond the defaults (`GET /`, `GET /llms.txt`)
- `maxBodySize?` — body limit in bytes (default 1MB, email needs 25MB, store needs 128MB)
- `metrics?` — enable metrics middleware + handler (default true)
- `pricing?` — pricing data for `GET /pricing` response (array of `{ method, path, price, description }`)

### What the factory handles

1. Read `PRIM_PAY_TO` env var — throw if missing
2. Read `PRIM_NETWORK` via `getNetworkConfig()`
3. Create allowlist checker via `createWalletAllowlistChecker(WALLET_INTERNAL_URL)`
4. Create `Hono` app with `AppVariables` type
5. Register middleware: `requestIdMiddleware()`, `bodyLimit()`, optionally `metricsMiddleware()`, `createAgentStackMiddleware()`
6. Register `GET /` health check: `{ service: name, status: "ok" }`
7. Register `GET /llms.txt` from `site/<id>/llms.txt` file
8. Optionally register `GET /pricing` + `GET /v1/metrics`
9. Export error helpers (`providerError`, `rateLimited`) as named exports

### What stays in each prim's index.ts

Only domain-specific route handlers: parse body, call service function, map `ServiceResult` to HTTP response.

### Special cases

- **wallet.sh** — uses local allowlist checker, has admin/internal routes, circuit breaker. Factory must support `skipX402: true` or custom middleware override.
- **faucet.sh** — no x402 middleware at all (free service). Factory must support `freeService: true` which skips x402 entirely.
- These special cases are handled in I-6 (migration). I-5 only migrates track + search as proof.

## Files to Create/Modify

| File | Action |
|------|--------|
| `packages/x402-middleware/src/create-prim-app.ts` | Create — factory function + types |
| `packages/x402-middleware/src/index.ts` | Modify — add export |
| `packages/track/src/index.ts` | Modify — replace boilerplate with `createPrimApp()` call |
| `packages/search/src/index.ts` | Modify — replace boilerplate with `createPrimApp()` call |

## Key Decisions

- **Factory returns bare Hono app, not started server.** Each prim's `index.ts` still calls `export default app` and the runner (`bun run`) handles serving. This preserves testability (import app, use Hono test client).
- **Error helpers exported from factory module**, not redefined per prim. `providerError()`, `rateLimited()` are identical everywhere — export once.
- **llms.txt path derived from prim name.** Factory reads `site/<id>/llms.txt` using the `id` extracted from `name` (strip `.sh` suffix). If file doesn't exist, skip the route (for dev/testing).

## Testing Strategy

- Existing `track/test/smoke.test.ts` and `search/test/smoke.test.ts` must pass unchanged after migration — the factory is an internal refactor, not a behavior change.
- Add unit test for `createPrimApp()` itself: given a config, verify returned app has health route, llms.txt route, and middleware registered.

## Before Closing

- [ ] `pnpm check` passes (lint + typecheck + tests)
- [ ] track smoke test passes with factory-based index.ts
- [ ] search smoke test passes with factory-based index.ts
- [ ] Factory is exported from `@primsh/x402-middleware`
- [ ] No behavioral change — same routes, same responses, same middleware order
