# HRD-30: Replace console.warn → structured logger

## Context

HRD-11 replaced silent catch blocks with `logger.warn()` across all handlers, but two `console.warn` calls in service layers were missed:

- `packages/wallet/src/service.ts:367` — `console.warn(...)` in `parsePrimitivesList()`
- `packages/email/src/service.ts:613` — `console.warn(...)` in `webhookToResponse()`

Both packages already use `createLogger` from `@primsh/x402-middleware` in their `index.ts`, but the service files don't import or use it.

## Changes

### packages/wallet/src/service.ts

1. Add at top of file:
   ```
   import { createLogger } from "@primsh/x402-middleware";
   const log = createLogger("wallet.sh", { module: "service" });
   ```
2. Line 367: replace `console.warn(...)` → `log.warn(...)` with same message

### packages/email/src/service.ts

1. Add at top of file:
   ```
   import { createLogger } from "@primsh/x402-middleware";
   const log = createLogger("email.sh", { module: "service" });
   ```
2. Line 613: replace `console.warn(...)` → `log.warn(...)` with same message

## Files modified

| File | Change |
|------|--------|
| `packages/wallet/src/service.ts` | Add logger import + replace 1 console.warn |
| `packages/email/src/service.ts` | Add logger import + replace 1 console.warn |

## Before closing

- [ ] `git grep 'console.warn' packages/wallet/src/service.ts` returns 0 results
- [ ] `git grep 'console.warn' packages/email/src/service.ts` returns 0 results
- [ ] `pnpm --filter @primsh/wallet test` passes
- [ ] `pnpm --filter @primsh/email test` passes
- [ ] `pnpm -r test` passes
