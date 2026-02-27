# HRD-10: Per-Wallet Rate Limiting in x402-middleware

## Context

Every prim primitive uses `createAgentStackMiddleware` from `@primsh/x402-middleware` as its sole auth/payment gate. Currently there is no request rate limiting at the middleware layer. A single wallet can make unlimited requests per second, creating abuse and cost exposure risk for every primitive.

The faucet package (`packages/faucet/src/rate-limit.ts`) has its own SQLite-backed rate limiter, but it is faucet-specific (one-drip-per-window model, backed by `bun:sqlite`). The middleware needs a general-purpose, in-memory sliding-window rate limiter that all 12+ primitives inherit automatically.

## Goals

1. Any wallet (payer address) that exceeds the configured rate gets a 429 response before the handler or x402 payment flow runs.
2. Default: 60 requests per minute per wallet. Primitives can override via config.
3. Zero config required for existing primitives — the default kicks in automatically.
4. Free routes (health checks, `GET /`) are exempt from rate limiting.
5. Requests with no identifiable wallet address (no payment header) get a shared "anonymous" bucket so unauthenticated scanners can't bypass the limit.

## Payer Identity

The wallet address is already extracted in `middleware.ts` via `extractWalletAddress()`, which reads the `payment-signature` or `x-payment` header and decodes the `from` field. The rate limiter keys on this value (lowercased). If no wallet is extractable, use a fixed key like `"__anon__"` so anonymous traffic is rate-limited collectively.

## Design

### Rate limiter module: `packages/x402-middleware/src/rate-limit.ts`

In-memory sliding window counter using a `Map<string, { count: number; windowStart: number }>`. One map per middleware instance (created at `createAgentStackMiddleware` call time, not global).

**Why in-memory, not SQLite**: The middleware is a shared library used by 12+ independent Hono services. Adding a `bun:sqlite` dependency would force every consumer to manage a DB file and path config. In-memory is zero-config, restarts on deploy (acceptable — rate limits are short-lived), and avoids the faucet's bun:sqlite coupling.

**Why fixed-window, not sliding-window**: Fixed window (reset counter every N seconds) is simpler and sufficient for abuse prevention. A wallet doing 60 req in 500ms then waiting 59.5s is a tolerable edge case — the goal is preventing sustained abuse, not precision throttling. If precision matters later, swap the internals without changing the interface.

**Cleanup**: Stale entries are pruned lazily on each `check()` call — if the entry's window has expired, reset it. No background timer needed.

### Config interface addition to `AgentStackMiddlewareOptions`

```ts
rateLimit?: {
  maxRequests?: number;   // default 60
  windowMs?: number;      // default 60_000 (1 minute)
} | false;                // false = disable entirely
```

`false` disables rate limiting (opt-out). Omitting the field uses defaults. Partial overrides are valid (e.g. `{ maxRequests: 120 }` uses default window).

### Execution order in middleware

```
extractWalletAddress → denyWallet (allowlist) → rateLimit check → x402 payment
```

Rate limiting runs after allowlist check so that blocked wallets get 403, not 429. Rate limiting runs before x402 so abusers don't trigger payment verification overhead.

| wallet extracted | on allowlist | rate exceeded | result |
|-----------------|-------------|---------------|--------|
| yes | no (blocked) | n/a | 403 |
| yes | yes / no list | no | proceed to x402 |
| yes | yes / no list | yes | 429 |
| no | n/a | anon exceeded | 429 |
| no | n/a | anon ok | proceed to x402 (will get 402) |

### 429 response shape

```json
{
  "error": "rate_limit_exceeded",
  "message": "Too many requests. Try again in {N}s.",
  "retry_after_ms": 12345
}
```

Also set `Retry-After` response header (seconds, rounded up) per RFC 6585.

### Free route exemption

Free routes (from `freeRoutes` set) skip the rate limit check entirely. These are health/status endpoints — rate limiting them would break monitoring.

**Important**: The current middleware already skips the x402 payment flow for free routes, but does NOT skip `extractWalletAddress` or `denyWallet` for them. Rate limiting should follow the same pattern as `denyWallet` — it applies to all routes except those in `freeRoutes`.

Wait — re-examining the code: free routes are removed from `effectiveRoutes` but the middleware handler itself runs on `*` and calls `extractWalletAddress` + `denyWallet` for every request. The `freeRoutes` set only affects whether a route has a price in the x402 config. So the middleware handler doesn't currently have a "is this a free route?" check in the hot path.

To exempt free routes from rate limiting, add a check: if the request's `METHOD PATH` matches the `freeRoutes` set, skip rate limit. This requires matching the request against the freeRoutes set, which is already available in the middleware closure.

## Files to Modify

### `packages/x402-middleware/src/rate-limit.ts` (new file)

Export a `RateLimiter` class with:
- Constructor takes `maxRequests` and `windowMs`
- `check(key: string): { allowed: boolean; retryAfterMs: number }` — returns whether the request is allowed and how long to wait if not
- Internal `Map` for tracking, lazy cleanup of expired entries

### `packages/x402-middleware/src/types.ts`

Add the `rateLimit` field to `AgentStackMiddlewareOptions`.

### `packages/x402-middleware/src/middleware.ts`

- Import `RateLimiter` from `./rate-limit.ts`
- In `createAgentStackMiddleware`: instantiate a `RateLimiter` if `rateLimit !== false`
- In both handler paths (empty effectiveRoutes and normal): after `denyWallet`, before `next()`/`payment()`, call `rateLimiter.check()` using the wallet address (or `"__anon__"`)
- On limit exceeded: return 429 with the response shape above + `Retry-After` header
- Skip rate limit check if request matches `freeRoutes`

### `packages/x402-middleware/src/index.ts`

Export the `RateLimiter` class (primitives may want to use it standalone, though the primary path is automatic via config).

### `packages/x402-middleware/test/middleware.test.ts`

Add test cases for rate limiting (see Testing Strategy below).

### `packages/x402-middleware/test/rate-limit.test.ts` (new file)

Unit tests for the `RateLimiter` class in isolation.

## No Changes Required in Primitives

All 12 consumers call `createAgentStackMiddleware(options, routes)`. Since `rateLimit` defaults to `{ maxRequests: 60, windowMs: 60_000 }` when omitted, every primitive gets rate limiting automatically. No consumer code changes needed.

## Testing Strategy

### Unit tests (`rate-limit.test.ts`)

- `check()` allows up to `maxRequests` calls within a window
- `check()` returns `{ allowed: false, retryAfterMs: >0 }` on the (maxRequests+1)th call
- After window expires, counter resets and requests are allowed again
- Different keys are tracked independently
- Stale entries are cleaned up (verify map size doesn't grow unbounded)

### Integration tests (`middleware.test.ts`)

- Default rate limit: 61st request from same wallet within 1 minute returns 429
- 429 response body matches expected shape (`error`, `message`, `retry_after_ms`)
- 429 response has `Retry-After` header
- Different wallets have independent limits
- Free routes are not rate limited (can exceed limit without 429)
- Anonymous requests (no payment header) share a single bucket
- `rateLimit: false` disables rate limiting entirely
- `rateLimit: { maxRequests: 5 }` overrides the default
- Rate limit check runs after allowlist (blocked wallet gets 403, not 429)

Use `vi.useFakeTimers()` to control window expiry without real delays.

### Assertion specifics

- `assert res.status === 429` when request count exceeds maxRequests within window
- `assert res.status === 200` on the request immediately after window expiry (with faked timers)
- `assert body.retry_after_ms > 0 && body.retry_after_ms <= windowMs`
- `assert res.headers.get("Retry-After")` is a string of digits (seconds)

## Before closing

- [ ] Run `pnpm -r check` (lint + typecheck + tests pass)
- [ ] Re-read each AC and locate the line of code that enforces it
- [ ] For every boolean condition, verify both True and False paths are covered by tests
- [ ] Verify the `rateLimit` config type is exported from `index.ts`
- [ ] Verify no existing primitive breaks (all consumers omit `rateLimit` and get defaults)
- [ ] Verify anonymous bucket key cannot collide with a real wallet address (prefix with `__`)
