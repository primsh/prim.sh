# HRD-15: Standardize Pagination Request Params

**Status**: pending
**Depends**: none
**Blocks**: HRD-16

## Context

HRD-8 standardized the pagination **response** envelope via `PaginatedList<T>` and `parsePaginationParams()` in `@primsh/x402-middleware`. All endpoints now return the same shape. But the **request parameters** are inconsistent across services.

## Current State

| Service | Endpoint | Request params | Strategy |
|---------|----------|---------------|----------|
| wallet | GET /v1/wallets | `limit` + `after` | cursor (wallet address) |
| email | GET /v1/mailboxes | `page` + `per_page` | page-based offset |
| email | GET /v1/mailboxes/:id/messages | `limit` + `position` | numeric offset (nonstandard name) |
| store | GET /v1/buckets | `page` + `limit` | page-based offset |
| store | GET /v1/buckets/:id/objects | `limit` + `cursor` | cursor (S3 continuation token) |
| spawn | GET /v1/servers | `page` + `limit` | page-based offset |
| domain | GET /v1/zones | `page` + `limit` | page-based offset |
| mem | GET /v1/collections | `page` + `limit` | page-based offset |

Three naming variants for the same concept: `after`, `cursor`, `position`.

## Decision: Dual-mode with page-based default

Support both strategies in `parsePaginationParams()`. The response already has fields for both (`page` and `cursor`). The request side should accept:
- `page` + `per_page` — offset-based (default, used by most endpoints)
- `cursor` + `per_page` — cursor-based (wallet, store objects — APIs where offset is meaningless)

Drop the `after` and `position` names. All endpoints use `cursor` for cursor-based and `page` for page-based.

## Files to Modify

### `packages/x402-middleware/src/pagination.ts`
- `parsePaginationParams()` already accepts `page`, `limit`, `cursor` from query string
- Rename the `limit` query param to `per_page` for consistency (keep `limit` as alias for back-compat)
- Ensure cursor takes priority over page when both are provided

### `packages/wallet/src/index.ts`
- `GET /v1/wallets`: rename `after` query param → `cursor`
- Update `getWalletsByOwner()` call to use `cursor` from parsed params

### `packages/email/src/index.ts`
- `GET /v1/mailboxes/:id/messages`: rename `position` → `cursor` (numeric offset encoded as string)
- Use `parsePaginationParams()` instead of manual extraction

### `packages/store/src/index.ts`
- `GET /v1/buckets/:id/objects`: already uses `cursor` — no change needed
- `GET /v1/buckets`: uses `page` — no change needed

### Test updates
- `packages/wallet/test/smoke.test.ts`: update query param in any pagination test
- `packages/email/test/smoke.test.ts`: same

## Breaking Changes

| Change | Impact |
|--------|--------|
| `after` → `cursor` on wallet | Agents using `?after=0x...` will need to use `?cursor=0x...` |
| `position` → `cursor` on email messages | Agents using `?position=5` will need `?cursor=5` |

Low risk — these are pre-launch, no external consumers.

## Before Closing

- [ ] Run `pnpm -r test` (all pass)
- [ ] Verify `parsePaginationParams()` handles: page-only, cursor-only, both (cursor wins), neither
- [ ] Verify wallet list returns `cursor` (not `after`) in response
- [ ] Verify email messages returns correct offset with `cursor` param
- [ ] Grep for `after=` and `position=` — no remaining references in source
