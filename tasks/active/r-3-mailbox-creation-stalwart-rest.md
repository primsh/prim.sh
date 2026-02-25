# R-3: Build relay.sh wrapper — mailbox creation (Stalwart REST API)

**Status:** pending
**Depends on:** R-2 (done)
**Blocks:** R-4 (OAuth/JMAP auth), R-8 (TTL/expiry), R-10 (x402 integration)

## Context

relay.sh is email for agents. R-1 deployed Stalwart on a DigitalOcean Droplet (`[STALWART_HOST]`), R-2 configured the domain (`relay.prim.sh`), DKIM, SPF, DMARC, ACME TLS, and locked down admin access.

R-3 builds the first real functionality: mailbox CRUD. An agent pays (via x402, wired in R-10) and gets a working email address on `relay.prim.sh`. Under the hood, relay.sh creates a Stalwart "individual" principal with a generated username and random password.

The relay package is currently a skeleton — one health-check route and a smoke test.

## Goal

Implement mailbox create/list/get/delete endpoints that proxy to Stalwart's REST admin API, with SQLite ownership tracking (wallet → mailbox mapping).

## Architecture

Follows the dns.sh / spawn.sh pattern exactly:

```
Agent request
  → Hono routes (index.ts)
    → Service layer (service.ts) — validation, ownership, business logic
      → Stalwart client (stalwart.ts) — thin HTTP wrapper
      → SQLite (db.ts) — ownership + metadata
```

**Dependency direction:** `index.ts` → `service.ts` → `stalwart.ts` + `db.ts`. No reverse imports. `api.ts` is imported by all layers (types only).

## API Surface (relay.sh endpoints)

```
GET    /                        → { service: "relay.sh", status: "ok" }  (free)
POST   /v1/mailboxes            → create mailbox
GET    /v1/mailboxes            → list caller's mailboxes
GET    /v1/mailboxes/:id        → get mailbox details
DELETE /v1/mailboxes/:id        → destroy mailbox
```

Renew (`POST /v1/mailboxes/:id/renew`) is R-8 scope. x402 pricing is R-10 scope. For now, routes extract wallet from context but don't enforce payment.

### POST /v1/mailboxes

Request:
```json
{ "domain": "relay.prim.sh" }
```
`domain` is optional, defaults to `relay.prim.sh`. Custom domains (R-9) will add more options later.

Response (201):
```json
{
  "id": "mbx_a7xk9d3f",
  "address": "[email protected]",
  "username": "a7xk9d3f",
  "domain": "relay.prim.sh",
  "status": "active",
  "created_at": "2026-02-25T...",
  "expires_at": "2026-02-26T..."
}
```

Username is a random 8-char hex slug. Address = `{username}@{domain}`. Default TTL = 24 hours (stored in DB, not enforced until R-8).

### GET /v1/mailboxes

Response (200):
```json
{
  "mailboxes": [ ... ],
  "total": 3,
  "page": 1,
  "per_page": 25
}
```

Only returns mailboxes owned by the caller's wallet.

### GET /v1/mailboxes/:id

Returns single mailbox. 404 if not found or not owned by caller.

### DELETE /v1/mailboxes/:id

Deletes Stalwart principal + removes DB row. Returns:
```json
{ "id": "mbx_a7xk9d3f", "deleted": true }
```

## Files to Create/Modify

All new files under `packages/relay/`:

| File | Purpose |
|------|---------|
| `src/api.ts` | Type definitions: request/response shapes, error codes |
| `src/stalwart.ts` | Thin HTTP client wrapping Stalwart REST admin API |
| `src/db.ts` | SQLite schema + CRUD helpers for mailbox ownership |
| `src/service.ts` | Business logic: validation, ownership checks, orchestration |
| `src/index.ts` | Hono routes (replace current skeleton) |
| `test/stalwart.test.ts` | Unit tests for Stalwart client (mocked fetch) |
| `test/service.test.ts` | Unit tests for service layer (mocked stalwart + db) |
| `test/smoke.test.ts` | Update existing smoke test |
| `package.json` | Add `better-sqlite3` dependency |

## Stalwart REST API Mapping

relay.sh calls Stalwart at `STALWART_API_URL` (default: `http://localhost:8080`) using Basic auth (`STALWART_API_CREDENTIALS` env var = `relay-wrapper:[REDACTED]`).

| relay.sh action | Stalwart endpoint | Notes |
|-----------------|-------------------|-------|
| Create mailbox | `POST /api/principal` | Body: `{ type: "individual", name, secrets, emails, quota, roles: ["user"] }` |
| Get mailbox | `GET /api/principal/{name}` | Returns full principal object |
| List mailboxes | `GET /api/principal?types=individual` | Returns name list only — relay.sh enriches from SQLite |
| Delete mailbox | `DELETE /api/principal/{name}` | |

### Password handling

relay.sh generates a random 32-byte password (hex-encoded) for each mailbox. Stored in SQLite (hashed with SHA-256) for potential future JMAP OAuth flows (R-4). Sent to Stalwart as plaintext in `secrets` array — Stalwart stores it as-is for comparison. The agent never sees this password; relay.sh manages auth on their behalf.

## SQLite Schema

```sql
CREATE TABLE mailboxes (
  id            TEXT PRIMARY KEY,          -- "mbx_" + 8 hex chars
  stalwart_name TEXT NOT NULL UNIQUE,      -- username in Stalwart (e.g. "a7xk9d3f")
  address       TEXT NOT NULL UNIQUE,      -- full email address
  domain        TEXT NOT NULL,             -- "relay.prim.sh"
  owner_wallet  TEXT NOT NULL,             -- x402 wallet address
  status        TEXT NOT NULL DEFAULT 'active',  -- active | expired | deleted
  password_hash TEXT NOT NULL,             -- SHA-256 of generated password
  quota         INTEGER NOT NULL DEFAULT 0,      -- bytes, 0 = unlimited
  created_at    INTEGER NOT NULL,          -- epoch ms
  expires_at    INTEGER NOT NULL           -- epoch ms (created_at + 24h default)
);

CREATE INDEX idx_mailboxes_owner ON mailboxes(owner_wallet);
CREATE INDEX idx_mailboxes_address ON mailboxes(address);
```

## Service Layer Logic

### createMailbox(request, callerWallet)

1. Validate domain — for now, only accept `relay.prim.sh` (or empty/undefined → default)
2. Generate username: 8 random hex chars
3. Generate password: 32 random bytes → hex string
4. Call `stalwart.createPrincipal({ type: "individual", name: username, secrets: [password], emails: [address], roles: ["user"] })`
5. On success, insert row into SQLite with `id = "mbx_" + 8 hex`, `expires_at = now + 24h`
6. Return mailbox response

### listMailboxes(callerWallet, page, perPage)

1. Query SQLite: `SELECT * FROM mailboxes WHERE owner_wallet = ? AND status = 'active' LIMIT ? OFFSET ?`
2. Count total: `SELECT COUNT(*) ...`
3. Return paginated response (no Stalwart call needed)

### getMailbox(id, callerWallet)

1. Query SQLite by `id`
2. If not found or `owner_wallet` doesn't match → not_found
3. Return mailbox response

### deleteMailbox(id, callerWallet)

1. Query SQLite by `id`, verify ownership
2. Call `stalwart.deletePrincipal(stalwart_name)`
3. Delete row from SQLite (hard delete — no soft delete needed, these are disposable)
4. Return success

## Error Codes

```
invalid_request    — bad domain, missing fields
not_found          — mailbox doesn't exist or not owned by caller
forbidden          — wallet address missing from request
stalwart_error     — upstream Stalwart API failure
conflict           — username collision (regenerate and retry, up to 3 attempts)
```

## Stalwart Client (`stalwart.ts`)

Thin wrapper, same pattern as `cloudflare.ts` in dns.sh:

```
class StalwartError { statusCode, code, message }

function createPrincipal(principal)   → POST /api/principal
function getPrincipal(name)           → GET /api/principal/{name}
function deletePrincipal(name)        → DELETE /api/principal/{name}
```

Auth: `Authorization: Basic base64(STALWART_API_CREDENTIALS)`. Env var format: `username:password`.

Error mapping:

| Stalwart HTTP status | Error code |
|---------------------|------------|
| 400/422 | `invalid_request` |
| 401/403 | `forbidden` |
| 404 | `not_found` |
| 409 | `conflict` |
| 429 | `rate_limited` |
| 5xx | `stalwart_error` |

Stalwart wraps responses in `{ "data": ... }` envelope. Success = `res.ok` + data field present.

## Environment Variables

| Var | Default | Description |
|-----|---------|-------------|
| `STALWART_API_URL` | `http://localhost:8080` | Stalwart management API base URL |
| `STALWART_API_CREDENTIALS` | (required) | `username:password` for Basic auth |
| `RELAY_DEFAULT_DOMAIN` | `relay.prim.sh` | Default mailbox domain |
| `RELAY_DEFAULT_TTL_MS` | `86400000` (24h) | Default mailbox TTL in ms |
| `PORT` | `3001` | Hono server port |

## Testing Strategy

### stalwart.test.ts — Stalwart client unit tests

Mock `global.fetch`. Test:
- `createPrincipal` sends correct body, returns principal ID
- `getPrincipal` returns principal data
- `deletePrincipal` returns success
- Error mapping: 404 → `not_found`, 401 → `forbidden`, 500 → `stalwart_error`
- Malformed response handling

### service.test.ts — Service layer unit tests

Mock `stalwart.ts` and `db.ts`. Test:

| Scenario | Assert |
|----------|--------|
| createMailbox with valid request | Stalwart called with correct principal shape, DB row inserted, response has `mbx_` prefix ID |
| createMailbox with invalid domain | Returns `{ ok: false, code: "invalid_request" }` |
| createMailbox with Stalwart failure | Returns `{ ok: false, code: "stalwart_error" }` |
| listMailboxes returns only caller's | DB queried with `owner_wallet` filter |
| getMailbox owned by caller | Returns mailbox |
| getMailbox owned by different wallet | Returns `not_found` (not `forbidden` — don't leak existence) |
| deleteMailbox owned by caller | Stalwart `deletePrincipal` called, DB row removed |
| deleteMailbox not owned | Returns `not_found` |

### Ownership truth table

```
mailbox_exists | wallet_matches | result
--------------|----------------|--------
false          | n/a            | not_found
true           | false          | not_found  ← don't leak existence
true           | true           | success
```

## Out of Scope (deferred to downstream tasks)

- **x402 payment gating** → R-10
- **OAuth token acquisition for JMAP** → R-4
- **TTL enforcement / expiry cron** → R-8
- **Custom domains** → R-9
- **Send/receive email** → R-5, R-6
- **Webhooks** → R-7

## Before Closing

- [ ] Run `pnpm -r check` from repo root (lint + typecheck + test pass)
- [ ] Re-read each endpoint and verify request/response shapes match this plan
- [ ] For every ownership check, verify both `wallet_matches=true` and `wallet_matches=false` paths are tested
- [ ] Verify Stalwart client error mapping covers all status codes in the table above
- [ ] Verify `stalwart_name` (not `id`) is used when calling Stalwart API (Stalwart uses `name` as the principal identifier)
