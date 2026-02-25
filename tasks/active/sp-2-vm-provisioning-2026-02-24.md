# SP-2: Build spawn.sh VM provisioning via Hetzner Cloud API

**Status:** Plan
**Spec:** `specs/spawn.md`
**Depends on:** SP-1 (spawn spec — done)
**Blocks:** SP-3 (VM lifecycle), SP-4 (SSH keys), SP-5 (x402 middleware)

## Context

spawn.sh currently returns 501 stubs. SP-2 implements the four core server management endpoints: create, list, get, delete. These wrap the Hetzner Cloud API with ownership tracking in SQLite and x402 payment gating.

This is the heaviest spawn.sh task — it establishes the Hetzner client, database schema, service layer, and route patterns that SP-3, SP-4, and SP-5 build on.

## Goals

1. Create VMs on Hetzner Cloud via API
2. List/get/delete VMs with ownership enforcement (wallet address = owner)
3. Track servers in SQLite with spawn.sh IDs (srv_xxxx)
4. Translate spawn.sh server types (small/medium/large) to Hetzner types (cx23/cx33/cx43)
5. Wire x402 pricing for all endpoints

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Hetzner client | Plain `fetch` with Bearer token | No SDK needed — Hetzner REST API is simple. Keep deps minimal. |
| Database | `bun:sqlite` (same as wallet.sh) | Consistent pattern. Single file DB. |
| Server IDs | `srv_` + 8 random hex chars | Short, URL-safe. Not Hetzner IDs (those are internal). |
| Ownership | Wallet address from x402 payment header | Same pattern as wallet.sh. `c.get("walletAddress")` via middleware. |
| Deposit system | Track in SQLite but don't enforce in SP-2 | Deposit deduction/refund is complex billing logic. SP-2 records the amounts; enforcement comes later. |
| Type translation | Hardcoded map in service layer | 4 types only. No need for dynamic lookup. |

## Hetzner Cloud API Reference

**Base URL:** `https://api.hetzner.cloud/v1`
**Auth:** `Authorization: Bearer ${HETZNER_API_KEY}`
**Rate limit:** 3600 requests/hour

### Endpoints used

| spawn.sh | Hetzner | Method |
|----------|---------|--------|
| Create server | `POST /v1/servers` | Creates server with name, type, image, location, ssh_keys, labels, user_data |
| List servers | `GET /v1/servers?label_selector=wallet%3D0x...` | Filter by wallet label |
| Get server | `GET /v1/servers/{id}` | Direct lookup by Hetzner ID |
| Delete server | `DELETE /v1/servers/{id}` | Permanent deletion |

### Server type map

| spawn.sh | Hetzner | vCPU | RAM | Disk | Daily burn |
|----------|---------|------|-----|------|-----------|
| `small` | `cx23` | 2 | 4 GB | 40 GB | ~$0.15 |
| `medium` | `cx33` | 4 | 8 GB | 80 GB | ~$0.22 |
| `large` | `cx43` | 8 | 16 GB | 160 GB | ~$0.40 |
| `arm-small` | `cax11` | 2 | 4 GB | 40 GB | ~$0.16 |

### Supported images

`ubuntu-24.04`, `ubuntu-22.04`, `debian-12`, `fedora-41`

### Supported locations

`nbg1` (Nuremberg), `fsn1` (Falkenstein), `hel1` (Helsinki), `ash` (Ashburn), `hil` (Hillsboro)

## Phase 1 — Types

### New file: `packages/spawn/src/api.ts`

Define request/response types following wallet.sh's `api.ts` pattern:

**Types to define:**
- `CreateServerRequest` — name, type, image, location, ssh_keys?, user_data?
- `CreateServerResponse` — server object, action object, deposit_charged, deposit_remaining
- `ServerResponse` — id, hetzner_id, name, type, status, image, location, public_net, owner_wallet, created_at
- `ServerListResponse` — servers array, meta (page, per_page, total)
- `DeleteServerResponse` — status "deleted", deposit_refunded
- `ActionResponse` — id, command, status, started_at, finished_at?
- `ApiError` — same envelope as wallet.sh: `{ error: { code, message } }`
- Error codes: `not_found`, `forbidden`, `invalid_request`, `insufficient_deposit`, `hetzner_error`, `not_implemented`

**Server status enum:** `"initializing" | "running" | "off" | "rebuilding" | "migrating" | "destroying" | "deleted"`

## Phase 2 — Database

### New file: `packages/spawn/src/db.ts`

Follow wallet.sh's db.ts pattern (singleton `getDb()`, `resetDb()` for tests).

**Tables:**

`servers` table:
- `id` TEXT PRIMARY KEY (srv_xxxx)
- `hetzner_id` INTEGER NOT NULL
- `owner_wallet` TEXT NOT NULL
- `name` TEXT NOT NULL
- `type` TEXT NOT NULL (small/medium/large/arm-small)
- `image` TEXT NOT NULL
- `location` TEXT NOT NULL
- `status` TEXT NOT NULL
- `public_ipv4` TEXT (null until running)
- `public_ipv6` TEXT (null until running)
- `deposit_charged` TEXT NOT NULL (decimal string)
- `deposit_daily_burn` TEXT NOT NULL (decimal string)
- `created_at` INTEGER NOT NULL
- `updated_at` INTEGER NOT NULL

Indexes: `owner_wallet`, `hetzner_id`

**DB functions:**
- `insertServer(params): void`
- `getServerById(id: string): ServerRow | null`
- `getServersByOwner(owner: string, limit: number, offset: number): ServerRow[]`
- `countServersByOwner(owner: string): number`
- `updateServerStatus(id: string, status: string, ipv4?: string, ipv6?: string): void`
- `deleteServerRow(id: string): void`

## Phase 3 — Hetzner client

### New file: `packages/spawn/src/hetzner.ts`

Thin HTTP wrapper around Hetzner Cloud API.

**Config:**
- `HETZNER_API_KEY` from env (required, throw if missing)
- Base URL: `https://api.hetzner.cloud/v1`

**Functions:**
- `createHetznerServer(params): Promise<HetznerCreateResponse>` — POST /v1/servers
- `getHetznerServer(id: number): Promise<HetznerServerResponse>` — GET /v1/servers/{id}
- `listHetznerServers(labelSelector: string): Promise<HetznerListResponse>` — GET /v1/servers with label filter
- `deleteHetznerServer(id: number): Promise<void>` — DELETE /v1/servers/{id}

Each function:
1. Builds URL
2. Sets `Authorization: Bearer ${apiKey}` and `Content-Type: application/json`
3. Makes fetch call
4. Checks response status (non-2xx → throw with Hetzner error details)
5. Returns parsed JSON

**Error mapping:** Hetzner returns `{ error: { code, message } }` on failure. Map to spawn.sh error codes:
- 404 → `not_found`
- 403 → `forbidden`
- 422 → `invalid_request`
- 429 → `rate_limited`
- 5xx → `hetzner_error`

## Phase 4 — Service layer

### New file: `packages/spawn/src/service.ts`

Follow wallet.sh's service pattern (pure functions, ownership checks, discriminated union returns).

**Functions:**

`createServer(request: CreateServerRequest, callerWallet: string)`
1. Validate request: name (alphanumeric + hyphens), type (must be in map), image (must be in allowlist), location (must be in allowlist)
2. Generate spawn.sh ID: `srv_` + 8 random hex chars
3. Translate type: `small` → `cx23`, etc.
4. Call Hetzner API: `createHetznerServer({ name, server_type, image, location, ssh_keys, labels: { wallet: callerWallet }, user_data })`
5. Insert server row in SQLite with owner_wallet, deposit info
6. Return `CreateServerResponse`

`listServers(callerWallet: string, limit: number, page: number)`
1. Query SQLite for servers owned by callerWallet
2. Apply pagination (offset = (page - 1) * limit)
3. Get total count for meta
4. Return `ServerListResponse` with servers and meta

`getServer(serverId: string, callerWallet: string)`
1. Query SQLite by id
2. Check ownership: `row.owner_wallet !== callerWallet` → 403
3. Not found → 404
4. Return server detail

`deleteServer(serverId: string, callerWallet: string)`
1. Ownership check (same as getServer)
2. Call Hetzner API: `deleteHetznerServer(row.hetzner_id)`
3. Update server status to "destroying" in SQLite
4. Calculate deposit refund (deposit_charged minus burn accrued)
5. Return `DeleteServerResponse`

**Ownership check helper** (same pattern as wallet.sh):
```
checkServerOwnership(id, caller) → { ok: true, row } | { ok: false, status, code, message }
```

## Phase 5 — Route handlers

### Modify: `packages/spawn/src/index.ts`

Replace stubs with real handlers. Set up x402 middleware.

**Route pricing:**
```
"POST /v1/servers": "$0.01"
"GET /v1/servers": "$0.001"
"GET /v1/servers/[id]": "$0.001"
"DELETE /v1/servers/[id]": "$0.005"
```

Free routes: `"GET /"` (health check)

**Handler pattern** (same as wallet.sh):
- Extract `callerWallet` from `c.get("walletAddress")`
- Parse request body/params
- Call service function
- Map result to HTTP response with appropriate status code

## Phase 6 — Tests

### New file: `packages/spawn/test/spawn.test.ts`

**Mock strategy:**
- Mock `fetch` to intercept Hetzner API calls (return canned responses)
- Use in-memory SQLite (`:memory:`)
- Set `HETZNER_API_KEY` to test value

**Test cases:**

| Test | Expected |
|------|----------|
| Create server (valid) | 201, server object with srv_ ID, status "initializing" |
| Create server (invalid type) | 400, code "invalid_request" |
| Create server (invalid image) | 400, code "invalid_request" |
| List servers (has servers) | 200, array with owned servers only |
| List servers (empty) | 200, empty array |
| Get server (owner) | 200, full server detail |
| Get server (not owner) | 403, code "forbidden" |
| Get server (not found) | 404, code "not_found" |
| Delete server (owner) | 200, status "deleted" |
| Delete server (not owner) | 403, code "forbidden" |
| Hetzner API failure | 502 or 500, code "hetzner_error" |

## Environment Variables

| Variable | Default | Required | Purpose |
|----------|---------|----------|---------|
| `HETZNER_API_KEY` | — | Yes | Hetzner Cloud API bearer token |
| `SPAWN_DB_PATH` | `./spawn.db` | No | SQLite database path |

## Files changed (summary)

| File | Action |
|------|--------|
| `packages/spawn/src/api.ts` | **New** — request/response types, error codes |
| `packages/spawn/src/db.ts` | **New** — SQLite schema, CRUD functions |
| `packages/spawn/src/hetzner.ts` | **New** — Hetzner Cloud API HTTP client |
| `packages/spawn/src/service.ts` | **New** — business logic, ownership checks |
| `packages/spawn/src/index.ts` | **Modify** — replace stubs with real handlers, wire x402 |
| `packages/spawn/test/spawn.test.ts` | **New** — integration tests |
| `packages/spawn/package.json` | **Possibly modify** — may need `@agentstack/x402-middleware` as dependency |

## Before closing

- [ ] `pnpm --filter @agentstack/spawn check` passes (lint + typecheck + test)
- [ ] `POST /v1/servers` creates server on Hetzner and records in SQLite
- [ ] `GET /v1/servers` returns only servers owned by caller
- [ ] `GET /v1/servers/:id` enforces ownership (403 for non-owners)
- [ ] `DELETE /v1/servers/:id` enforces ownership and calls Hetzner delete
- [ ] Server type translation works (small → cx23, etc.)
- [ ] Invalid inputs return 400 with specific error messages
- [ ] Hetzner API failures return 502 with error details
- [ ] All Hetzner requests include `labels: { wallet: callerWallet }`
- [ ] x402 pricing is set for all routes
- [ ] No hardcoded Hetzner API key (must come from env)
