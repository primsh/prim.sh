# HRD-4: Add try-catch around JSON.parse calls in service layers

**Status**: pending
**Scope**: packages/wallet, packages/email, packages/store

## Context

Unprotected `JSON.parse` calls in service layers will throw `SyntaxError` on malformed data, crashing the request handler. Even when the data was originally written by our own `JSON.stringify`, DB corruption, migration bugs, or manual edits can produce invalid JSON. Defensive parsing converts these crashes into structured error responses.

## Audit results

### Service-layer calls (in `src/` — scope of this task)

| # | File | Line | Expression | Protected? | Source of data |
|---|------|------|-----------|------------|----------------|
| 1 | `packages/wallet/src/service.ts` | 353 | `JSON.parse(row.allowed_primitives)` | No | SQLite `policies.allowed_primitives` column (TEXT, written by our `JSON.stringify`) |
| 2 | `packages/email/src/service.ts` | 593 | `JSON.parse(row.events)` | No | SQLite `webhooks.events` column (TEXT, written by our `JSON.stringify`) |
| 3 | `packages/email/src/service.ts` | 703 | `JSON.parse(rawBody)` | **Yes** | Inbound HTTP body (already wrapped in try-catch, returns 400) |

### Test-only calls (out of scope)

- `packages/wallet/test/journal.test.ts` — 3 calls (lines 113, 130, 188)
- `packages/email/test/*.test.ts` — 7 calls across stalwart, jmap, webhook-delivery, smoke-live tests
- `packages/store/test/store.test.ts` — 1 call (line 42)

Test files are not production code paths and do not need defensive wrapping.

### Store service layer

`packages/store/src/` has **zero** `JSON.parse` calls. No changes needed for store.

## Goal

Wrap the 2 unprotected service-layer `JSON.parse` calls (items 1 and 2 above) so that corrupted DB data produces a graceful error response instead of an unhandled exception.

## Acceptance criteria

- AC1: `policyRowToResponse` in wallet returns a structured error (or safe default) when `allowed_primitives` contains invalid JSON
- AC2: `webhookToResponse` in email returns a structured error (or safe default) when `events` contains invalid JSON
- AC3: No new unhandled exceptions from `JSON.parse` in any service-layer `src/` file
- AC4: Existing tests still pass; new tests cover the corrupted-JSON paths

## Design

### Approach: safe-default fallback

Both call sites read data that **we wrote** via `JSON.stringify`. Corruption is abnormal. The right response is:

- Log a warning (so the operator notices)
- Fall back to a safe default value rather than 500-ing the request

This avoids breaking read-only GET endpoints over a single corrupted row.

### Fallback values

| Call site | Fallback | Rationale |
|-----------|----------|-----------|
| `allowed_primitives` | `null` (no restriction) | Same as if the column were unset — fail-open is safer than fail-closed for a read endpoint |
| `events` | `[]` (empty array) | Webhook with no events is inert — better than crashing the list endpoint |

### Files to modify

1. **`packages/wallet/src/service.ts`** — `policyRowToResponse` function (~line 353)
   - Wrap the `JSON.parse(row.allowed_primitives)` in try-catch
   - On catch: `console.warn` with wallet address + raw value, return `null`

2. **`packages/email/src/service.ts`** — `webhookToResponse` function (~line 593)
   - Wrap the `JSON.parse(row.events)` in try-catch
   - On catch: `console.warn` with webhook ID + raw value, return `[]`

### Helper vs inline

Two calls is not enough to justify a shared `safeJsonParse<T>` utility. Inline try-catch is clearer and avoids a new import. If a third+ call appears later, extract then.

## Testing strategy

### wallet

Add a test in the existing policy test suite (or a new `test/json-safety.test.ts`) that:
- Inserts a policy row with `allowed_primitives = "not-json{"`
- Calls `getSpendingPolicy` and asserts it returns `ok: true` with `allowedPrimitives: null`
- Asserts `console.warn` was called (spy)

### email

Add a test in the existing webhook test suite that:
- Inserts a webhook row with `events = "broken"`
- Calls the code path that invokes `webhookToResponse` and asserts `events: []` in the response
- Asserts `console.warn` was called (spy)

## Before closing
- [ ] Run `pnpm -r check` (lint + typecheck + tests pass)
- [ ] Re-read each AC and locate the line of code that enforces it
- [ ] For every boolean condition, verify both True and False paths are covered by tests
- [ ] Verify no new `JSON.parse` calls were introduced without try-catch
