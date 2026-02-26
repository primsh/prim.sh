# HRD-8: Standardize Pagination — Shared Response Shape

## Context

Prim has 14 list endpoints across 7 packages. Each defines its own pagination response type in its own `api.ts`. The result is four incompatible pagination styles:

| Style | Shape | Used by |
|-------|-------|---------|
| **Page + meta object** | `{ items, meta: { page, per_page, total } }` | store buckets, spawn servers, mem collections, domain zones |
| **Page — flat fields** | `{ items, total, page, per_page }` | email mailboxes, email domains |
| **Cursor** | `{ items, cursor }` | wallet wallets, wallet fund-requests |
| **Position** | `{ items, total, position }` | email messages |
| **None** | `{ items }` (bare array wrapper) | token tokens, spawn ssh-keys, email webhooks, domain records |

Query parameter names also diverge: `limit` vs `per_page`, `page` vs `after` vs `position` vs `cursor`.

## Current Inventory

| Package | Route | Response type | Params | Pagination style |
|---------|-------|---------------|--------|-----------------|
| **store** | `GET /v1/buckets` | `BucketListResponse` | `limit`, `page` | page + meta obj |
| **store** | `GET /v1/buckets/:id/objects` | `ObjectListResponse` | `limit`, `cursor`, `prefix` | cursor (`next_cursor`, `is_truncated`) |
| **wallet** | `GET /v1/wallets` | `WalletListResponse` | `limit`, `after` | cursor |
| **wallet** | `GET /v1/wallets/:addr/fund-requests` | `FundRequestListResponse` | `limit`, `after` | cursor |
| **email** | `GET /v1/mailboxes` | `MailboxListResponse` | `per_page`, `page`, `include_expired` | page — flat |
| **email** | `GET /v1/mailboxes/:id/messages` | `EmailListResponse` | `limit`, `position`, `folder` | position |
| **email** | `GET /v1/mailboxes/:id/webhooks` | `WebhookListResponse` | none | none |
| **email** | `GET /v1/domains` | `DomainListResponse` | `per_page`, `page` | page — flat |
| **spawn** | `GET /v1/servers` | `ServerListResponse` | `limit`, `page` | page + meta obj |
| **spawn** | `GET /v1/ssh-keys` | `SshKeyListResponse` | none | none |
| **token** | `GET /v1/tokens` | `TokenListResponse` | none | none |
| **mem** | `GET /v1/collections` | `CollectionListResponse` | `limit`, `page` | page + meta obj |
| **domain** | `GET /v1/zones` | `ZoneListResponse` | `limit`, `page` | page + meta obj |
| **domain** | `GET /v1/zones/:zid/records` | `RecordListResponse` | none | none |

## Goals

1. Define a single shared pagination envelope that all list endpoints adopt.
2. Support both page-based and cursor-based pagination in one shape (agents can use either).
3. Standardize query parameter names across all endpoints.
4. Make it a non-breaking change where possible — additive fields first, deprecate old names over time.

## Design Decisions

### Shared type: `PaginatedList<T>`

The shared type lives in `@primsh/x402-middleware` since that package is already a dependency of every primitive. It is a pure type export — no runtime code.

```ts
interface PaginatedList<T> {
  data: T[];
  pagination: {
    total: number | null;
    page: number | null;
    per_page: number;
    cursor: string | null;
    has_more: boolean;
  };
}
```

Key choices:
- **`data`** not `buckets`/`servers`/etc. — generic key means agents parse every list the same way.
- **`total: null`** for cursor-based endpoints where count is expensive (store objects, email messages via JMAP).
- **`page: null`** for cursor-based endpoints. `cursor: null` for page-based endpoints.
- **`has_more`** is always present — the one boolean agents need to decide whether to fetch more.

### Standardized query parameters

| Param | Meaning | Default |
|-------|---------|---------|
| `limit` | Items per page | 20 |
| `page` | Page number (1-indexed) | 1 |
| `cursor` | Cursor for next page | (none) |

- `per_page` is renamed to `limit` everywhere. Accept `per_page` as an alias during the deprecation period.
- `after` (wallet) is renamed to `cursor`. Accept `after` as alias.
- `position` (email messages) maps to `cursor` (the JMAP position as a string).
- Max `limit` is always 100. Default is 20.

### Endpoints that currently have no pagination

token tokens, spawn ssh-keys, email webhooks, domain records — these return bare arrays. They get the full `PaginatedList` envelope. For now, they return all items with `has_more: false` and `total` set to the count. Pagination params are accepted but optional — small collections don't need them yet, but the response shape is consistent.

## Dependency Direction

```
@primsh/x402-middleware (owns PaginatedList<T> type + parsePaginationParams helper)
  ↑ imported by
store, wallet, email, spawn, token, mem, domain
```

No new package. No circular dependency risk — x402-middleware already flows one-way into every primitive.

## Files to Modify

### Phase 1: Define shared types (x402-middleware)

- **`packages/x402-middleware/src/pagination.ts`** (new) — export `PaginatedList<T>` interface and `parsePaginationParams(query)` helper (parses `limit`, `page`, `cursor` with defaults/clamping; accepts `per_page`/`after` as aliases).
- **`packages/x402-middleware/src/index.ts`** — re-export from `pagination.ts`.

### Phase 2: Migrate each package (one package per PR is fine)

For each package, changes follow the same pattern:

1. **`src/api.ts`** — Replace per-package `*ListResponse` with `PaginatedList<ItemType>`. Keep the old type as a deprecated alias during transition.
2. **`src/service.ts`** (or equivalent) — Update list functions to return `PaginatedList<T>` shape instead of the bespoke shape.
3. **`src/index.ts`** (routes) — Use `parsePaginationParams(c.req.query)` instead of inline limit/page parsing. Wire the returned object through.
4. **`test/smoke.test.ts`** — Update assertions to match new response shape (`data` array, `pagination` object).

Migration order (by complexity, ascending):
1. **token** — simplest, bare array, no existing pagination
2. **spawn ssh-keys** — bare array
3. **domain records** — bare array
4. **email webhooks** — bare array with `total`
5. **mem collections** — already has `meta` obj, just reshape
6. **store buckets** — already has `meta` obj
7. **domain zones** — already has `meta` obj
8. **spawn servers** — already has `meta` obj
9. **email mailboxes** — flat fields, rename `per_page` param
10. **email domains** — flat fields
11. **wallet wallets** — cursor-based, rename `after` param
12. **wallet fund-requests** — cursor-based
13. **store objects** — cursor-based, most complex (S3 continuation tokens)
14. **email messages** — position-based (JMAP), most complex

### Phase 3: Update MCP tools

- **`packages/mcp/src/tools/*.ts`** — Update any MCP tool that calls a list endpoint to handle the new `data`/`pagination` shape.

## Response shape examples

Page-based (e.g., `GET /v1/servers?limit=20&page=2`):
```json
{
  "data": [{ "id": "...", ... }],
  "pagination": {
    "total": 47,
    "page": 2,
    "per_page": 20,
    "cursor": null,
    "has_more": true
  }
}
```

Cursor-based (e.g., `GET /v1/wallets?limit=20&cursor=abc`):
```json
{
  "data": [{ "address": "...", ... }],
  "pagination": {
    "total": null,
    "page": null,
    "per_page": 20,
    "cursor": "next-cursor-token",
    "has_more": true
  }
}
```

No-more-pages:
```json
{
  "data": [...],
  "pagination": {
    "total": 3,
    "page": 1,
    "per_page": 20,
    "cursor": null,
    "has_more": false
  }
}
```

## Testing Strategy

- **Unit (smoke.test.ts)**: For each migrated package, assert the response matches `PaginatedList` shape — `data` is an array, `pagination` has all five fields, types are correct.
- **Alias acceptance**: Test that `per_page` and `after` still work as query params (parsed by `parsePaginationParams`).
- **Edge cases**: `limit=0` clamps to 1, `limit=999` clamps to 100, `page=-1` clamps to 1, missing params use defaults.
- **MCP tools**: After Phase 3, run MCP tool smoke tests to confirm they parse the new shape.

## Rollout

Ship Phase 1 first, merge to main. Then Phase 2 packages can land incrementally — each package migration is independent. Phase 3 follows once all packages are migrated.

For the deprecation period (accept old param names), add a `Deprecation` response header: `Deprecation: parameter "per_page" is renamed to "limit"`. Remove aliases after 2 major versions or 90 days, whichever is later.

## Before closing
- [ ] Run pnpm -r check (lint + typecheck + tests pass)
- [ ] Re-read each AC and locate the line of code that enforces it
- [ ] For every boolean condition, verify both True and False paths are covered by tests
- [ ] Verify markup / format strings are balanced (no dangling tags)
- [ ] Confirm `parsePaginationParams` handles all alias combinations (limit/per_page, cursor/after)
- [ ] Confirm each migrated `*ListResponse` alias still compiles (no downstream breakage)
- [ ] Verify MCP tools work with the new response shape after Phase 3
