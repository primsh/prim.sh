# OPS-2: Structured Logging

**Status**: pending
**Scope**: `packages/*` (all server primitives + x402-middleware)

## Context

Every primitive currently uses raw `console.log` / `console.warn` / `console.error`. There are ~243 occurrences across 14 source files. This makes log analysis on the VPS painful: no request correlation, no machine-parseable format, no severity levels, no consistent structure.

The goal is a single JSON logger that every primitive imports, with per-request `request_id` injection via Hono middleware, so any log line can be traced back to the HTTP request that produced it.

## Scope Breakdown

| Category | Files | Count | Notes |
|---|---|---|---|
| **keystore CLI** | `cli.ts`, `*-commands.ts`, `install-commands.ts` | ~210 | CLI user output — **out of scope**. These are stdout for humans, not server logs. |
| **Server primitives** | `wallet/balance.ts`, `domain/service.ts` | ~2 | Actual runtime warnings/errors that need structured logging |
| **x402-middleware** | `middleware.ts` | 2 | `console.warn` in allowlist checker — must migrate |
| **Test files** | `smoke-live.test.ts`, `install-commands.test.ts` | ~27 | Test diagnostics — **out of scope** |

**In-scope**: Server-side code in `x402-middleware`, `wallet`, `store`, `spawn`, `email`, `domain`, `search`, `faucet`, `mem`, `token`, `track`. These are the Hono apps running on the VPS.

**Out of scope**: `keystore` (CLI tool, stdout is correct), `mcp` (stdio transport), `x402-client` (client library), test files.

## Decision: Library Choice

Use **no library**. The logger is ~40 lines: `JSON.stringify` to stdout with `level`, `service`, `msg`, `request_id`, `timestamp`, and a spread of extra fields. Bun's stdout is fast. Pino/winston add dependency weight for zero value at this scale.

Why not pino:
- Adds a native binary dep (`pino-pretty`, thread workers) — friction for Bun
- We need ~5 functions, not a logging framework
- Every primitive already runs on Bun which writes stdout synchronously

## Architecture

### Dependency direction

```
@primsh/x402-middleware
  └── exports: createLogger(), requestIdMiddleware()

packages/wallet/src/index.ts
  └── imports from @primsh/x402-middleware (already a dep)
```

The logger lives in `@primsh/x402-middleware` alongside `metricsMiddleware` — same shared-infra pattern. Every primitive already depends on `@primsh/x402-middleware`, so no new dependency edges.

### New files

| File | Purpose |
|---|---|
| `packages/x402-middleware/src/logger.ts` | `createLogger(service)` factory + `Logger` type |
| `packages/x402-middleware/src/request-id.ts` | `requestIdMiddleware()` — Hono middleware that sets `requestId` on context |

### Exports

Add to `packages/x402-middleware/src/index.ts`:
```
export * from "./logger";
export * from "./request-id";
```

## Design

### Logger API

`createLogger(service: string)` returns a `Logger` object:

```ts
interface Logger {
  info(msg: string, extra?: Record<string, unknown>): void;
  warn(msg: string, extra?: Record<string, unknown>): void;
  error(msg: string, extra?: Record<string, unknown>): void;
  debug(msg: string, extra?: Record<string, unknown>): void;
  child(extra: Record<string, unknown>): Logger;
}
```

Each method writes a single JSON line to stdout:

```json
{"level":"info","service":"store.sh","msg":"bucket created","request_id":"abc123","wallet":"0x...","ts":"2026-02-26T12:00:00.000Z"}
```

Fields:
- `level` — `debug | info | warn | error`
- `service` — set at creation (`"store.sh"`, `"wallet.sh"`, etc.)
- `msg` — human-readable string
- `request_id` — from Hono context (if available), `null` otherwise
- `ts` — ISO 8601 timestamp
- `...extra` — any additional key-value pairs spread into the object

`child(extra)` returns a new logger with the extra fields baked in (for scoping to a module like `"module":"allowlist"`).

### Log level filtering

Respect `LOG_LEVEL` env var. Default: `info` in production, `debug` if `NODE_ENV=development`.

Level hierarchy: `debug < info < warn < error`. If `LOG_LEVEL=warn`, only `warn` and `error` emit.

### Request ID middleware

`requestIdMiddleware()` is a Hono middleware that:

1. Reads `X-Request-Id` header from the incoming request (if present, for trace propagation)
2. If absent, generates a short random ID (nanoid-style, 12 chars, no dep — use `crypto.randomUUID().slice(0, 12)`)
3. Sets `requestId` on Hono context via `c.set("requestId", id)`
4. Sets `X-Request-Id` response header for client correlation

### Wiring into each primitive

Each primitive's `index.ts` adds the middleware and creates a logger:

```ts
// In index.ts, before other middleware:
app.use("*", requestIdMiddleware());
```

The logger needs access to Hono's `requestId` context variable. Two options:

**Option A (recommended)**: Logger reads from AsyncLocalStorage. The `requestIdMiddleware` stores the request ID in an ALS instance exported from `request-id.ts`. The logger reads it automatically — no need to pass context around. This means `service.ts` functions can log with request_id without receiving it as a parameter.

**Option B (simpler, more explicit)**: Logger has a `withRequestId(id: string)` method that returns a child logger. Each route handler calls `log.withRequestId(c.get("requestId"))` at the top. Downside: every service function that logs needs the request_id threaded through.

Go with **Option A** (AsyncLocalStorage). Bun supports ALS. The middleware sets it, the logger reads it. Service code just calls `log.info(...)` and gets request_id for free.

### Where request_id middleware goes in the stack

```
1. requestIdMiddleware()    ← NEW (first, so all downstream has request_id)
2. metricsMiddleware()      ← existing
3. bodyLimit()              ← existing
4. createAgentStackMiddleware() ← existing (x402 payment)
5. route handlers
```

## Phases

### Phase 1: Logger + request ID middleware in x402-middleware

- Create `logger.ts` with `createLogger()`, `Logger` type
- Create `request-id.ts` with `requestIdMiddleware()`, ALS instance, `getRequestId()` helper
- Export from `index.ts`
- Add `requestId` to the Hono app `Variables` type (add to `types.ts`)
- Unit tests: logger output format, level filtering, child logger, request ID generation/propagation

### Phase 2: Wire into all server primitives

For each of: `wallet`, `store`, `spawn`, `email`, `domain`, `search`, `faucet`, `mem`, `token`, `track`:

1. Add `requestIdMiddleware()` as first middleware in `index.ts`
2. Create `const log = createLogger("<name>.sh")` at module level
3. Replace any `console.warn` / `console.error` with `log.warn()` / `log.error()`
4. Add structured logging at key points:
   - Request received (route handler entry) — `log.info("request", { method, path, wallet })`
   - Error responses — `log.error("request failed", { code, status })`
   - External API calls — `log.info("provider call", { provider, endpoint, latency_ms })`

**Do not** add logging to every route handler in Phase 2. Start with error paths and external calls. Verbose request logging can be a follow-up.

### Phase 3: Replace x402-middleware console.warn

- `middleware.ts` line 39, 46: replace `console.warn(...)` with structured `log.warn("allowlist check failed", { address, status })` using a child logger scoped to `module: "allowlist"`

### Phase 4: Request/response logging middleware (optional follow-up)

A generic Hono middleware that logs every request + response with method, path, status, latency_ms, wallet, request_id. This replaces the need to manually log in each handler. Could coexist with or replace `metricsMiddleware` for the latency tracking part.

This phase is optional — evaluate after Phase 2 whether the manual logging is sufficient.

## Testing

- `packages/x402-middleware/test/logger.test.ts`:
  - `createLogger("test.sh").info("hello")` writes valid JSON to stdout with correct fields
  - Level filtering: `LOG_LEVEL=error` suppresses `info` and `warn`
  - `child({ module: "foo" })` merges fields into output
  - `getRequestId()` returns `null` outside ALS context
  - `getRequestId()` returns the ID set by `requestIdMiddleware`

- Existing smoke tests: no changes needed (they test HTTP responses, not log output)

## Rollout

- Deploy after Phase 2+3 are complete
- Restart all `prim-*` systemd services on VPS
- Verify JSON output in `journalctl -u prim-store -f` (systemd captures stdout)
- No config changes needed — journald already stores stdout per-unit

## Before closing

- [ ] Run `pnpm check` (lint + typecheck + test pass)
- [ ] Re-read each AC and locate the line of code that enforces it
- [ ] Verify `requestIdMiddleware` is registered before `metricsMiddleware` in every primitive
- [ ] Verify `keystore` and `mcp` packages have zero changes (out of scope)
- [ ] Verify AsyncLocalStorage context propagation works across async boundaries in at least one integration test
- [ ] Grep for remaining `console.log` / `console.warn` / `console.error` in server packages — should be zero (excluding test files)
