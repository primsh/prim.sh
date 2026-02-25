# R-10: Integrate x402 middleware for relay.sh

## Context

relay.sh is the email primitive wrapping Stalwart Mail Server. It currently has 7 routes across mailbox CRUD (R-3), message reading (R-5), and message sending (R-6). The routes already extract `walletAddress` from Hono context variables, but no x402 middleware is wired in — the wallet address is always undefined today.

This task adds the `@agentstack/x402-middleware` package as a dependency and wires `createAgentStackMiddleware` into the Hono app, following the identical pattern used by dns.sh (D-4), spawn.sh (SP-5), and store.sh (ST-4).

## Goal

Gate all relay.sh endpoints (except `GET /` health check) behind x402 payment. Extract the payer's wallet address from the payment header so ownership checks continue to work.

## Endpoints and Pricing

| Route | Operation | Price | Rationale |
|-------|-----------|-------|-----------|
| `GET /` | Health check | Free | Convention across all primitives |
| `POST /v1/mailboxes` | Create mailbox | $0.10 | Creates Stalwart principal + encrypted credentials — highest cost operation |
| `GET /v1/mailboxes` | List mailboxes | $0.001 | Local SQLite read |
| `GET /v1/mailboxes/[id]` | Get mailbox | $0.001 | Local SQLite read |
| `DELETE /v1/mailboxes/[id]` | Delete mailbox | $0.02 | Stalwart API call to remove principal |
| `GET /v1/mailboxes/[id]/messages` | List messages | $0.005 | JMAP session + Email/query — upstream round-trip |
| `GET /v1/mailboxes/[id]/messages/[msgId]` | Get message | $0.005 | JMAP session + Email/get with body — upstream round-trip |
| `POST /v1/mailboxes/[id]/send` | Send message | $0.02 | JMAP Email/set + EmailSubmission/set — creates deliverable email |

### Pricing rationale

- **Mailbox creation ($0.10)** is the most expensive because it provisions a real Stalwart account with encrypted password storage. Higher than dns.sh zone creation ($0.05) because email accounts carry ongoing server-side cost.
- **Send ($0.02)** costs more than read ($0.005) because sending triggers outbound SMTP delivery and consumes reputational capital (SPF/DKIM/DMARC standing). This asymmetry discourages spam.
- **Read operations ($0.005)** are more expensive than pure-local reads ($0.001) in other primitives because each read requires a JMAP session bootstrap (Basic auth, session discovery) against Stalwart.
- **List/get mailbox ($0.001)** are local SQLite reads, same as dns.sh and store.sh.
- **Delete ($0.02)** matches send pricing — it's a Stalwart REST API call and an irreversible operation.

## Files to Modify

### 1. `packages/relay/package.json`

Add two dependencies following the dns.sh/store.sh pattern:
- `"@agentstack/x402-middleware": "workspace:*"` in `dependencies`
- `"@x402/core": "^2.4.0"` in `devDependencies` (needed for type imports in tests)

### 2. `packages/relay/src/index.ts`

Three changes:

**a) Import middleware.** Add `createAgentStackMiddleware` import from `@agentstack/x402-middleware`.

**b) Define route pricing map.** Add a `RELAY_ROUTES` const (same shape as `SPAWN_ROUTES`, `DNS_ROUTES`, `STORE_ROUTES`) mapping each `"METHOD /path"` to a price string. Use `[id]` for path parameters and `[msgId]` for the nested message param.

**c) Wire middleware.** Add `app.use("*", createAgentStackMiddleware(options, routes))` before any route handlers. Options: `payTo` set to placeholder `0x0000...0000`, `network` set to `"eip155:8453"`, `freeRoutes` set to `["GET /"]`.

The `PAY_TO_ADDRESS` and `NETWORK` constants follow the pattern in spawn/dns/store. The placeholder address gets replaced with the real operator wallet when deploying.

### 3. `packages/relay/test/smoke.test.ts`

The existing smoke test imports `../src/index` which will now pull in `@agentstack/x402-middleware`. The test already mocks `bun:sqlite`. It may also need to mock or stub the x402 middleware import so the test doesn't attempt real facilitator connections.

Check if the other primitives' test suites needed special x402 mocking — if not (because the middleware only activates on actual requests, not on import), the smoke test may work as-is.

### 4. Other test files

The service/JMAP/crypto/context tests (`service.test.ts`, `jmap.test.ts`, `crypto.test.ts`, `context.test.ts`) test lower-level functions that don't import `index.ts`, so they should be unaffected. Verify this during implementation.

## Route Pattern Syntax

The x402 middleware uses Hono-style route patterns with `[param]` for path parameters (not `:param`). For relay.sh's nested routes:

```
"POST /v1/mailboxes"                     → matches POST /v1/mailboxes
"GET /v1/mailboxes/[id]/messages"        → matches GET /v1/mailboxes/:id/messages
"GET /v1/mailboxes/[id]/messages/[msgId]"→ matches GET /v1/mailboxes/:id/messages/:msgId
```

Verify by checking how `paymentMiddlewareFromConfig` in `@x402/hono` resolves bracket-param patterns against Hono's `:param` routing. If they don't match, the middleware won't gate those routes (silent failure). Test this explicitly.

## Wallet Address Flow

No changes needed to individual route handlers. They already call `c.get("walletAddress")` and return 403 if undefined. The middleware's `extractWalletAddress` function (in `@agentstack/x402-middleware`) decodes the `payment-signature` or `x-payment` header and calls `c.set("walletAddress", from)` before the route handler executes. This is the same flow used by all other primitives.

## Testing Strategy

1. **Smoke test** — verify the app still exports and the health check returns 200 without payment
2. **402 response test** — make a request to a paid endpoint without payment headers, assert 402 status and correct `accepts` schema in response body
3. **Wallet extraction test** — if feasible, craft a mock payment header and verify `walletAddress` is set on context

Tests 2 and 3 are nice-to-haves. The critical path is test 1 plus manual verification that paid endpoints return 402 when hit without payment.

## Before Closing

- [ ] Run `pnpm -r check` (lint + typecheck + tests pass across all packages)
- [ ] Verify `GET /` returns 200 without any payment headers
- [ ] Verify any paid endpoint (e.g. `POST /v1/mailboxes`) returns 402 without payment headers
- [ ] Confirm `RELAY_ROUTES` has exactly 7 entries (one per paid endpoint)
- [ ] Confirm `packages/relay/package.json` has `@agentstack/x402-middleware: "workspace:*"` in dependencies
- [ ] Verify route pattern syntax matches what `@x402/hono` expects (bracket params vs colon params)
- [ ] Re-read each paid endpoint and confirm it still checks `walletAddress` and returns 403 if missing
