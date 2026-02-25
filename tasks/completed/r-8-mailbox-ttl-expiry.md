# R-8: Mailbox TTL/Expiry Manager

**Status:** pending
**Depends on:** R-3 (done)
**Blocks:** none

## Context

Mailboxes in relay.sh are disposable. Agents create them, use them for a task, and let them expire. R-3 already stores `expires_at` (epoch ms, default 24h from creation) and `status` (active/expired/deleted) in SQLite, but nothing enforces expiry. An expired mailbox still has a live Stalwart principal that can receive mail indefinitely.

R-8 adds the enforcement layer: detect expired mailboxes, clean them up in Stalwart, mark them expired in the DB, and give agents the ability to renew before expiry or override TTL at creation time.

## Goals

1. Expired mailboxes get their Stalwart principal deleted (stop receiving mail)
2. Agents can extend a mailbox's lifetime by renewing
3. Agents can request a custom TTL at creation time
4. All read operations lazily check expiry (no stale "active" responses)
5. A background sweep catches mailboxes that expire between reads

## Design Decisions

### Dual strategy: lazy check + interval sweep

- **Lazy check:** Every read operation (`getMailbox`, `listMailboxes`, `listMessages`, `getMessage`, `sendMessage`) checks `expires_at` against `Date.now()`. If expired, trigger cleanup inline before returning.
- **Interval sweep:** A `setInterval` (configurable, default 5 minutes) queries the DB for `status = 'active' AND expires_at < now` and cleans them up in batch. This catches mailboxes that no one reads after expiry.

The lazy check is the primary mechanism; the sweep is a safety net. Both are idempotent — cleaning up an already-expired mailbox is a no-op.

### Cleanup sequence

When a mailbox expires:

1. Call `deletePrincipal(stalwart_name)` on Stalwart to remove the mail account
2. Update DB: `SET status = 'expired'` (do NOT delete the row — agents may query expired mailboxes for status info)
3. If Stalwart deletion fails (502, network error), log the error but still mark `status = 'expired'` in DB. The sweep will retry Stalwart deletion on subsequent runs for rows where `status = 'expired'` and a `stalwart_cleanup_failed` flag is set.

### Stalwart cleanup failure handling

| stalwart DELETE | DB update | stalwart_cleanup_failed |
|-----------------|-----------|------------------------|
| Success         | expired   | 0                      |
| Fail (502/net)  | expired   | 1 (sweep retries)      |
| Already 404     | expired   | 0 (already gone)       |

The sweep queries `status = 'expired' AND stalwart_cleanup_failed = 1` to retry failed cleanups. After 3 consecutive failures, stop retrying (dead letter) — set `stalwart_cleanup_failed = -1`. Admin can manually investigate.

## DB Schema Changes

Add two columns to `mailboxes`:

- `stalwart_cleanup_failed INTEGER NOT NULL DEFAULT 0` — 0 = clean, 1 = needs retry, -1 = dead letter
- `cleanup_attempts INTEGER NOT NULL DEFAULT 0` — retry counter

These are additive — no migration needed for existing rows (SQLite `ALTER TABLE ADD COLUMN` with defaults).

Add index for sweep queries:

```
idx_mailboxes_expiry ON mailboxes(status, expires_at)
```

### New DB functions to add in `db.ts`

- `getExpiredMailboxes(limit: number)` — returns active rows where `expires_at < Date.now()`, limited batch size (default 50)
- `getFailedCleanups(limit: number)` — returns expired rows where `stalwart_cleanup_failed = 1`, limit 10
- `markExpired(id: string, cleanupFailed: boolean)` — sets `status = 'expired'`, sets `stalwart_cleanup_failed` flag
- `markCleanupDone(id: string)` — sets `stalwart_cleanup_failed = 0`
- `markCleanupDeadLetter(id: string)` — sets `stalwart_cleanup_failed = -1`
- `updateExpiresAt(id: string, expiresAt: number)` — used by renew endpoint
- `incrementCleanupAttempts(id: string)` — bumps retry counter

## API Changes

### New endpoint: `POST /v1/mailboxes/:id/renew`

Extends the mailbox TTL from the current time. Requires ownership.

Request body:
```json
{ "ttl_ms": 86400000 }
```
`ttl_ms` is optional — defaults to `RELAY_DEFAULT_TTL_MS`. New `expires_at = Date.now() + ttl_ms`. Only works on mailboxes with `status = 'active'` (cannot renew an expired mailbox).

Response (200): standard `MailboxResponse` with updated `expires_at`.

Error cases:

| Condition | Code | Status |
|-----------|------|--------|
| Mailbox not found / not owned | not_found | 404 |
| Mailbox already expired | expired | 410 |
| ttl_ms exceeds MAX_TTL_MS | invalid_request | 400 |

### Modify: `POST /v1/mailboxes` (create)

Accept optional `ttl_ms` in the request body. Add it to `CreateMailboxRequest`:

```
{ "domain": "relay.prim.sh", "ttl_ms": 172800000 }
```

Validation: `ttl_ms` must be between `MIN_TTL_MS` (300000 = 5 min) and `MAX_TTL_MS` (604800000 = 7 days). Outside range returns `invalid_request`.

### Modify: read operations (lazy expiry)

Every service function that calls `checkOwnership` or `getJmapContext` needs to check if the returned row is expired (`row.expires_at < Date.now() && row.status === 'active'`). If so, trigger `expireMailbox(row)` before returning.

Decision table for lazy check behavior:

| status  | expires_at vs now | action            | response to caller |
|---------|-------------------|-------------------|--------------------|
| active  | future            | none              | normal response    |
| active  | past              | trigger expiry    | expired (410)      |
| expired | any               | none (already done)| expired (410)     |

For `getMailbox` and `listMailboxes`: return the mailbox with `status: "expired"` and HTTP 200 (informational — the agent can see it expired). Do NOT 410 on read-only queries — the agent may want to know when it expired.

For `listMessages`, `getMessage`, `sendMessage`: return 410 with `code: "expired"` and message "Mailbox has expired". These are operational endpoints that require an active mailbox.

Corrected decision table per endpoint type:

| endpoint type    | status  | expires_at past | response             |
|------------------|---------|-----------------|----------------------|
| info (get/list)  | active  | yes             | expire + return 200 with status="expired" |
| info (get/list)  | expired | any             | return 200 with status="expired" |
| operational (msg)| active  | yes             | expire + return 410  |
| operational (msg)| expired | any             | return 410           |

### Modify: `listMailboxes` filtering

Currently `getMailboxesByOwner` filters `status = 'active'`. Add an optional `include_expired` query param. Default behavior stays the same (active only). When `include_expired=true`, also return expired mailboxes.

## New file: `expiry.ts`

Service module for expiry logic. **Dependency direction:** `service.ts` and `expiry.ts` both import from `db.ts` and `stalwart.ts`. `index.ts` imports from `expiry.ts` to start the sweep. `service.ts` imports `expireMailbox` from `expiry.ts` for lazy checks.

Functions:

- `expireMailbox(row: MailboxRow)` — single-mailbox cleanup (Stalwart delete + DB mark). Idempotent. Used by both lazy check and sweep.
- `runExpirySweep()` — queries expired active mailboxes + failed cleanups, processes each via `expireMailbox`. Returns count of processed mailboxes.
- `startExpirySweep(intervalMs?: number)` — calls `setInterval(runExpirySweep, intervalMs)`. Returns the interval handle for cleanup in tests.
- `stopExpirySweep(handle)` — clears the interval.

## Constants / Environment Variables

| Var | Default | Description |
|-----|---------|-------------|
| `RELAY_DEFAULT_TTL_MS` | `86400000` (24h) | Default mailbox TTL (already exists) |
| `RELAY_MIN_TTL_MS` | `300000` (5 min) | Minimum allowed TTL |
| `RELAY_MAX_TTL_MS` | `604800000` (7 days) | Maximum allowed TTL |
| `RELAY_SWEEP_INTERVAL_MS` | `300000` (5 min) | Expiry sweep interval |
| `RELAY_SWEEP_BATCH_SIZE` | `50` | Max mailboxes per sweep run |
| `RELAY_CLEANUP_MAX_RETRIES` | `3` | Stalwart cleanup retry limit |

## Files to Modify

| File | Changes |
|------|---------|
| `src/api.ts` | Add `ttl_ms` to `CreateMailboxRequest`, add `RenewMailboxRequest` type, add `"expired"` error code |
| `src/db.ts` | Add columns (`stalwart_cleanup_failed`, `cleanup_attempts`), add index, add new query functions |
| `src/service.ts` | Add `renewMailbox()`, inject lazy expiry checks into `checkOwnership` and JMAP-dependent functions, accept `ttl_ms` in `createMailbox` |
| `src/expiry.ts` | **New file.** `expireMailbox`, `runExpirySweep`, `startExpirySweep`, `stopExpirySweep` |
| `src/index.ts` | Add `POST /v1/mailboxes/:id/renew` route, add `include_expired` param to list route, call `startExpirySweep()` on module load |
| `test/expiry.test.ts` | **New file.** Tests for expiry logic |
| `test/service.test.ts` | Add tests for lazy expiry, renew, TTL override at creation |

## Testing Strategy

### expiry.test.ts

| Scenario | Assert |
|----------|--------|
| `expireMailbox` on active row with future expires_at | No-op (returns early) |
| `expireMailbox` on active row with past expires_at | Calls `deletePrincipal`, sets `status = 'expired'`, `stalwart_cleanup_failed = 0` |
| `expireMailbox` when Stalwart returns 404 | Still marks expired, `stalwart_cleanup_failed = 0` (already gone) |
| `expireMailbox` when Stalwart returns 502 | Marks expired, `stalwart_cleanup_failed = 1` |
| `expireMailbox` on already-expired row | No-op (idempotent) |
| `runExpirySweep` with 3 expired + 1 failed cleanup | Processes all 4, returns count = 4 |
| `runExpirySweep` with failed cleanup at max retries | Sets `stalwart_cleanup_failed = -1` (dead letter) |
| `runExpirySweep` with no expired mailboxes | Returns 0, no Stalwart calls |

### service.test.ts (additions)

| Scenario | Assert |
|----------|--------|
| `createMailbox` with `ttl_ms: 3600000` | `expires_at = now + 3600000` |
| `createMailbox` with `ttl_ms: 100` (below min) | Returns `invalid_request` |
| `createMailbox` with `ttl_ms: 999999999` (above max) | Returns `invalid_request` |
| `createMailbox` with no `ttl_ms` | `expires_at = now + DEFAULT_TTL_MS` |
| `renewMailbox` on active mailbox | `expires_at` updated to `now + ttl_ms` |
| `renewMailbox` on expired mailbox | Returns `{ ok: false, code: "expired" }` with status 410 |
| `renewMailbox` on non-owned mailbox | Returns `not_found` |
| `getMailbox` on expired-but-status-active row | Triggers expiry, returns mailbox with `status: "expired"` |
| `listMessages` on expired mailbox | Returns 410 |
| `sendMessage` on expired mailbox | Returns 410 |

### Lazy expiry truth table

```
status  | expires_at | endpoint_type | triggers_expiry? | response
--------|------------|---------------|------------------|---------
active  | future     | info          | No               | 200 (active)
active  | past       | info          | Yes              | 200 (expired)
active  | future     | operational   | No               | normal
active  | past       | operational   | Yes              | 410
expired | any        | info          | No               | 200 (expired)
expired | any        | operational   | No               | 410
```

## Before Closing

- [ ] Run `pnpm -r check` from repo root (lint + typecheck + test pass)
- [ ] Re-read each AC and locate the line of code that enforces it
- [ ] `expireMailbox` is idempotent — calling it twice on the same row has no side effects
- [ ] Lazy expiry check is present in ALL service functions that access a mailbox (get, list, messages, send, renew)
- [ ] `stalwart_cleanup_failed` flag is tested for all three values (0, 1, -1)
- [ ] TTL validation rejects values below MIN and above MAX
- [ ] Sweep interval handle is cleaned up in tests (no leaked timers)
- [ ] `listMailboxes` with `include_expired=true` actually returns expired rows
- [ ] Verify `deletePrincipal` uses `stalwart_name` (not `id`)
