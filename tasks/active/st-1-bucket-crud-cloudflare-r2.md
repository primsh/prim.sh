# ST-1: Build store.sh — Bucket CRUD via Cloudflare R2 API

## Context

store.sh is the object storage primitive for AgentStack. Agents create buckets, store objects, and manage storage — no signup, no Cloudflare credentials. Payment via x402 is the sole auth.

This task covers bucket CRUD only. Object CRUD (ST-2), quotas (ST-3), and x402 integration (ST-4) follow.

## Scope

Bucket management: create, list, get, delete. Ownership enforcement. SQLite state tracking. x402 middleware included from the start (same pattern as dns.sh D-1).

## 5-File Architecture

Follow the dns.sh pattern exactly. Create `packages/store/` with:

```
packages/store/
├── src/
│   ├── index.ts          # Hono app + routes + x402 middleware
│   ├── api.ts            # Types, error codes, constants
│   ├── cloudflare.ts     # R2 bucket management API client (thin HTTP wrapper)
│   ├── db.ts             # SQLite (buckets table)
│   └── service.ts        # Business logic (ownership, validation, CF↔DB mapping)
├── test/
│   ├── store.test.ts     # Service layer tests (mocked fetch, ~20 tests)
│   └── smoke.test.ts     # App export check
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

**Dependency DAG**: `index.ts → service.ts → {db.ts, cloudflare.ts, api.ts}` (no cycles, leaves are independent)

## Files to Create

### 1. `packages/store/src/api.ts` — Types + Constants

Follow dns.sh `api.ts` pattern exactly.

- `ApiError` interface: `{ error: { code: string; message: string } }`
- `ERROR_CODES`: `"not_found"`, `"forbidden"`, `"invalid_request"`, `"r2_error"`, `"rate_limited"`, `"bucket_name_taken"`
- `ErrorCode` type (union from ERROR_CODES)

Bucket types:
- `BucketResponse`: `{ id, name, cf_name, location, owner_wallet, created_at }`
- `CreateBucketRequest`: `{ name: string; location?: string }`
- `CreateBucketResponse`: `{ bucket: BucketResponse }`
- `BucketListResponse`: `{ buckets: BucketResponse[]; meta: { page, per_page, total } }`

### 2. `packages/store/src/cloudflare.ts` — R2 Bucket Management API

Thin HTTP wrapper. Same auth pattern as dns.sh (`CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`).

Base URL: `https://api.cloudflare.com/client/v4`

Key difference from dns.sh: R2 buckets are keyed by **name** in CF API, not a separate CF ID.

Functions:
- `createBucket(name, location?)` — `POST /accounts/{account_id}/r2/buckets` body: `{ name, locationHint? }`
- `getBucket(name)` — `GET /accounts/{account_id}/r2/buckets/{name}`
- `deleteBucket(name)` — `DELETE /accounts/{account_id}/r2/buckets/{name}`
- `listBuckets()` — `GET /accounts/{account_id}/r2/buckets`

Same error handling: `CloudflareError` class, `handleResponse<T>()`, `mapStatusToCode()`.

### 3. `packages/store/src/db.ts` — SQLite

Env var: `STORE_DB_PATH` (default `./store.db`). Same `getDb()` / `resetDb()` singleton pattern as dns.sh.

One table: **buckets**
- `id` TEXT PK (`b_` + 8 hex chars)
- `cf_name` TEXT NOT NULL UNIQUE — the Cloudflare R2 bucket name (also used as CF API key)
- `name` TEXT NOT NULL — display name (may differ from cf_name)
- `owner_wallet` TEXT NOT NULL
- `location` TEXT — location hint (e.g. "enam", "wnam", "apac", "weur")
- `created_at` INTEGER NOT NULL
- `updated_at` INTEGER NOT NULL

Indexes: `owner_wallet`, `cf_name`.

Query functions:
- `getBucketById(id)`, `getBucketByCfName(cfName)`, `getBucketsByOwner(owner, limit, offset)`, `countBucketsByOwner(owner)`
- `insertBucket(params)`, `deleteBucketRow(id)`

### 4. `packages/store/src/service.ts` — Business Logic

Same `ServiceResult<T>` pattern as dns.sh.

Ownership: creator is owner. All ops check `owner_wallet === caller`.

Bucket name validation (R2 naming rules):
- 3–63 characters
- Lowercase alphanumeric + hyphens only
- Must start/end with alphanumeric
- No consecutive hyphens

Internal ID: `b_` + 8 hex chars (from `crypto.randomBytes(4)`).

CF name strategy: use validated bucket name directly as CF name. If name is taken in CF, return `bucket_name_taken` error.

Functions:
- `createBucket(request, callerWallet)` — validate name → check uniqueness in DB → call CF → insert DB → return
- `listBuckets(callerWallet, limit, page)` — filter by owner
- `getBucket(bucketId, callerWallet)` — ownership check
- `deleteBucket(bucketId, callerWallet)` — ownership check → delete in CF → delete DB row

### 5. `packages/store/src/index.ts` — Hono Routes

5 routes (health + 4 CRUD):

| Route | Price | Handler |
|-------|-------|---------|
| `GET /` | Free | Health check: `{ service: "store.sh", status: "ok" }` |
| `POST /v1/buckets` | $0.05 | Create bucket |
| `GET /v1/buckets` | $0.001 | List caller's buckets |
| `GET /v1/buckets/:id` | $0.001 | Get bucket by ID |
| `DELETE /v1/buckets/:id` | $0.01 | Delete bucket |

Same x402 middleware wiring as dns.sh. `walletAddress` from payment context.

### 6. `packages/store/package.json`

```json
{
  "name": "@agentstack/store",
  "version": "0.0.0",
  "private": false,
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "dev": "bun run src/index.ts",
    "start": "bun run src/index.ts",
    "lint": "biome lint .",
    "format": "biome format .",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest --run",
    "check": "pnpm lint && pnpm typecheck && pnpm test"
  },
  "dependencies": {
    "@agentstack/x402-middleware": "workspace:*",
    "hono": "^4.4.7"
  },
  "devDependencies": {
    "@x402/core": "^2.4.0",
    "typescript": "^5.6.3",
    "vitest": "^1.6.1"
  }
}
```

**tsconfig.json**: Extends `../../tsconfig.base.json`, same as dns.

**vitest.config.ts**: Copy dns's config (bun:sqlite mock alias).

## Tests

### `test/store.test.ts` — Service Layer (~20 tests)

Mock `fetch` globally (same pattern as dns.test.ts). Mock `bun:sqlite` via vitest alias.

Test groups:
1. **createBucket**: valid name → success; invalid name (too short, too long, uppercase, consecutive hyphens, starts/ends with hyphen) → `invalid_request`; duplicate name → `bucket_name_taken`; CF error propagation → `r2_error`
2. **listBuckets**: returns only caller's buckets; pagination
3. **getBucket**: owner access → success; non-owner → `forbidden`; not found → `not_found`
4. **deleteBucket**: owner → success + CF delete called; non-owner → `forbidden`; CF error propagation

### `test/smoke.test.ts` — Export Check

Same as dns: import default from `../src/index.ts`, assert it's a Hono app.

## Key Differences from dns.sh

| Aspect | dns.sh | store.sh |
|--------|--------|----------|
| CF API resource | Zones (keyed by zone ID) | R2 Buckets (keyed by name) |
| Internal ID prefix | `z_` / `r_` | `b_` |
| CF identifier column | `cloudflare_id` | `cf_name` (bucket name = CF key) |
| Error codes | `cloudflare_error`, `domain_taken` | `r2_error`, `bucket_name_taken` |
| Validation | Domain format (RFC) | Bucket name (3-63, lowercase alphanum+hyphens) |
| Nested resources | Records under zones | None (objects in ST-2) |
| DB env var | `DNS_DB_PATH` | `STORE_DB_PATH` |

## Before Closing

- [ ] Run `pnpm -r check` (lint + typecheck + tests pass)
- [ ] Re-read each AC and locate the line of code that enforces it
- [ ] For every boolean condition, verify both True and False paths are covered by tests
- [ ] Verify bucket name validation rejects: <3 chars, >63 chars, uppercase, consecutive hyphens, leading/trailing hyphens, non-alphanum
