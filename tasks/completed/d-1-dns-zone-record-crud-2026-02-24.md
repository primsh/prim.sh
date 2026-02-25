# D-1: Build dns.sh — Zone + Record CRUD via Cloudflare API

## Context

dns.sh is the DNS primitive for AgentStack. Agents create zones, manage records, and verify propagation — no signup, no Cloudflare credentials. Payment via x402 is the sole auth. dns.sh is also foundational for relay.sh (R-2 depends on D-1 for MX/SPF/DKIM/DMARC records).

Spec: `specs/dns.md`

## Scope

D-1 covers the core CRUD: zone management + record management. **Excludes** batch operations and mail-setup convenience (D-2), verification endpoint (D-3).

x402 middleware is included from the start (same as SP-2) — it's just middleware wiring. D-4 will likely close as redundant, same as SP-5.

## Package Scaffolding

Create `packages/dns/` following the exact spawn.sh structure:

```
packages/dns/
├── src/
│   ├── index.ts          # Hono app + routes + x402 middleware
│   ├── api.ts            # Types, error codes, constants
│   ├── cloudflare.ts     # Cloudflare API client (thin HTTP wrapper)
│   ├── db.ts             # SQLite (zones + records tables)
│   └── service.ts        # Business logic (ownership, validation, CF↔DB mapping)
├── test/
│   ├── dns.test.ts       # Integration tests (mocked fetch)
│   └── smoke.test.ts     # App export check
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

**package.json**: Copy spawn's structure. Name: `@agentstack/dns`. Same deps: `hono`, `@agentstack/x402-middleware` (workspace:*). Same devDeps: `@x402/core`, `typescript`, `vitest`. Same scripts: `dev`, `start`, `lint`, `format`, `typecheck`, `test`, `check`.

**tsconfig.json**: Extends `../../tsconfig.base.json`, same as spawn.

**vitest.config.ts**: Copy spawn's config (bun:sqlite mock alias).

## Files to Create/Modify

### 1. `packages/dns/src/api.ts` — Types + Constants

Define:
- `ApiError` interface + error helper functions (`forbidden`, `notFound`, `invalidRequest`, `cloudflareError`)
- `ERROR_CODES`: `"not_found"`, `"forbidden"`, `"invalid_request"`, `"cloudflare_error"`, `"rate_limited"`, `"domain_taken"`
- Request types: `CreateZoneRequest`, `CreateRecordRequest`, `UpdateRecordRequest`
- Response types: `ZoneResponse`, `ZoneListResponse`, `RecordResponse`, `RecordListResponse`
- Enums/unions: `ZoneStatus = "pending" | "active" | "moved"`, `RecordType = "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "SRV" | "CAA" | "NS"`
- Pricing constants (used in route config): zone create $0.05, zone delete $0.01, reads $0.001, record writes $0.001

Follow spawn's `api.ts` pattern exactly (see `packages/spawn/src/api.ts`).

### 2. `packages/dns/src/db.ts` — SQLite

Two tables from the spec:

**zones**: `id` (TEXT PK, `z_` + 8 hex), `cloudflare_id` (TEXT), `domain` (TEXT UNIQUE), `owner_wallet` (TEXT), `status` (TEXT), `nameservers` (TEXT, JSON array), `created_at` (INTEGER), `updated_at` (INTEGER). Index on `owner_wallet`.

**records**: `id` (TEXT PK, `r_` + 8 hex), `cloudflare_id` (TEXT), `zone_id` (TEXT FK→zones.id), `type` (TEXT), `name` (TEXT), `content` (TEXT), `ttl` (INTEGER), `proxied` (INTEGER DEFAULT 0), `priority` (INTEGER nullable), `created_at` (INTEGER), `updated_at` (INTEGER). Index on `zone_id`.

Note: add `nameservers` column to zones table (not in spec's SQL but present in API responses). Store as JSON text.

Env var: `DNS_DB_PATH` (default `./dns.db`). Follow spawn's `getDb()` / `resetDb()` singleton pattern.

Query functions needed:
- `getZoneById`, `getZonesByOwner`, `getZoneByDomain`, `insertZone`, `updateZoneStatus`, `deleteZone`
- `getRecordById`, `getRecordsByZone`, `insertRecord`, `updateRecord`, `deleteRecord`, `deleteRecordsByZone`

### 3. `packages/dns/src/cloudflare.ts` — Cloudflare API Client

Thin HTTP wrapper. Follow spawn's `hetzner.ts` pattern: `BASE_URL`, `getApiToken()`, `headers()`, `handleResponse<T>()`, `CloudflareError` class.

Env vars: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`

Base URL: `https://api.cloudflare.com/client/v4`

Functions (each maps 1:1 to Cloudflare endpoint per spec's API mapping table):

**Zones:**
- `createZone(domain: string, accountId: string)` → POST `/zones` with `{ name, account: { id }, type: "full" }`
- `getZone(zoneId: string)` → GET `/zones/{zoneId}`
- `listZones(accountId: string)` → GET `/zones?account.id=...` (used internally for sync, not exposed directly)
- `deleteZone(zoneId: string)` → DELETE `/zones/{zoneId}`

**Records:**
- `createRecord(zoneId, params)` → POST `/zones/{zoneId}/dns_records`
- `getRecord(zoneId, recordId)` → GET `/zones/{zoneId}/dns_records/{recordId}`
- `listRecords(zoneId, params?)` → GET `/zones/{zoneId}/dns_records?type=...&name=...`
- `updateRecord(zoneId, recordId, params)` → PUT `/zones/{zoneId}/dns_records/{recordId}`
- `deleteRecord(zoneId, recordId)` → DELETE `/zones/{zoneId}/dns_records/{recordId}`

Cloudflare response envelope: `{ success: boolean, errors: [...], result: T }`. Parse in `handleResponse`.

Auth header: `Authorization: Bearer ${token}` (not API key — use scoped API token).

### 4. `packages/dns/src/service.ts` — Business Logic

Coordinates Cloudflare API calls with SQLite persistence. Handles ownership checks.

**ID generation**: `z_` + 8 hex chars (zones), `r_` + 8 hex chars (records). Use `randomBytes(4).toString("hex")` from spawn's pattern.

**Ownership model**: The wallet address from x402 payment owns the zone. All record operations check that the caller owns the parent zone.

| Operation | Ownership check |
|-----------|----------------|
| Create zone | None (caller becomes owner) |
| List zones | Filter by `owner_wallet = caller` |
| Get zone | `zone.owner_wallet === caller` or 404 |
| Delete zone | `zone.owner_wallet === caller` or 403 |
| Any record op | Look up parent zone, check `zone.owner_wallet === caller` |

**Service functions** — each returns `ServiceResult<T>` (ok/error union, same pattern as spawn):

Zones:
- `createZone(domain, caller)` → call CF createZone → insert DB → return ZoneResponse
- `listZones(caller, limit, after?)` → query DB by owner → return ZoneListResponse with cursor
- `getZone(zoneId, caller)` → query DB → ownership check → return ZoneResponse
- `deleteZone(zoneId, caller)` → ownership check → call CF deleteZone → delete records from DB → delete zone from DB

Records:
- `createRecord(zoneId, body, caller)` → ownership check on zone → call CF createRecord → insert DB → return RecordResponse
- `listRecords(zoneId, caller, filters?)` → ownership check → query DB → return RecordListResponse with cursor
- `getRecord(zoneId, recordId, caller)` → ownership check → query DB → return RecordResponse
- `updateRecord(zoneId, recordId, body, caller)` → ownership check → call CF updateRecord → update DB → return RecordResponse
- `deleteRecord(zoneId, recordId, caller)` → ownership check → call CF deleteRecord → delete from DB

**Validation** (in service layer, not routes):
- Zone domain: basic format check (contains dot, no protocol prefix, no trailing dot)
- Record type: must be in allowed set
- Record name: non-empty string
- Record content: non-empty string
- TTL: positive integer, default 3600
- MX: requires `priority`
- SRV: requires `priority`, `weight`, `port`
- Proxied: boolean, defaults to false

### 5. `packages/dns/src/index.ts` — Hono Routes + x402

Follow spawn's `index.ts` pattern exactly.

**x402 route config**:
```
"POST /v1/zones":                    "$0.05"
"GET /v1/zones":                     "$0.001"
"GET /v1/zones/[id]":                "$0.001"
"DELETE /v1/zones/[id]":             "$0.01"
"POST /v1/zones/[zone_id]/records":          "$0.001"
"GET /v1/zones/[zone_id]/records":           "$0.001"
"GET /v1/zones/[zone_id]/records/[id]":      "$0.001"
"PUT /v1/zones/[zone_id]/records/[id]":      "$0.001"
"DELETE /v1/zones/[zone_id]/records/[id]":   "$0.001"
```

Free routes: `GET /` (health/info).

**Routes** (10 endpoints):

| Method | Path | Handler |
|--------|------|---------|
| GET | `/` | Return primitive info (name, version, endpoints) |
| POST | `/v1/zones` | `createZone` |
| GET | `/v1/zones` | `listZones` — query params: `limit`, `after` |
| GET | `/v1/zones/:id` | `getZone` |
| DELETE | `/v1/zones/:id` | `deleteZone` |
| POST | `/v1/zones/:zone_id/records` | `createRecord` |
| GET | `/v1/zones/:zone_id/records` | `listRecords` — query params: `type`, `name`, `limit`, `after` |
| GET | `/v1/zones/:zone_id/records/:id` | `getRecord` |
| PUT | `/v1/zones/:zone_id/records/:id` | `updateRecord` |
| DELETE | `/v1/zones/:zone_id/records/:id` | `deleteRecord` |

Each handler: extract `walletAddress` from context → validate → call service → map result to response.

Default export: `app` (for testing). Start server with `Bun.serve({ fetch: app.fetch, port })`.

### 6. Tests

**`test/smoke.test.ts`**: Verify app default export exists. Copy spawn's smoke test.

**`test/dns.test.ts`**: Full integration tests with mocked `fetch`. Pattern from spawn's `spawn.test.ts`:

- Set `DNS_DB_PATH=:memory:`, `CLOUDFLARE_API_TOKEN=test-token`, `CLOUDFLARE_ACCOUNT_ID=test-account` before imports
- Mock `global.fetch` to intercept:
  - x402 facilitator `/supported` endpoint
  - Cloudflare zone API calls (`api.cloudflare.com/client/v4/zones*`)
  - Cloudflare DNS record API calls (`api.cloudflare.com/client/v4/zones/*/dns_records*`)

Test cases:
- Zone CRUD: create → list → get → delete
- Record CRUD: create A record → list → get → update → delete
- Ownership: caller A creates zone, caller B gets 404/403
- Validation: missing domain, invalid record type, MX without priority
- Cloudflare error propagation: mock CF 429 → dns.sh returns appropriate error

## Dependency Direction

```
index.ts → service.ts → cloudflare.ts (external API calls)
                       → db.ts (persistence)
                       → api.ts (types only)
api.ts ← imported by all (types + constants, no runtime deps)
```

No circular dependencies. `cloudflare.ts` and `db.ts` are independent leaves.

## Testing Strategy

1. `pnpm -r test` passes (all packages including dns)
2. `pnpm -r check` passes (lint + typecheck + test)
3. Manual smoke: `bun run packages/dns/src/index.ts` starts server, `GET /` returns info JSON

## Before Closing

- [ ] Run `pnpm -r check` (lint + typecheck + tests pass)
- [ ] Re-read each endpoint in spec and locate the route that implements it
- [ ] Verify ownership check exists for every mutating operation
- [ ] Verify Cloudflare API token is never exposed in responses
- [ ] For every error path, verify both success and failure branches are tested
