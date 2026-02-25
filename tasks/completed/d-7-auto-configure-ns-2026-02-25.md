# D-7: Build domain.sh — Auto-Configure NS to Cloudflare After Registration

**Status:** Plan
**Depends on:** D-3 (done — quote, register, recover, configure-ns all exist)
**Scope:** `packages/domain`

## Context

After D-3, domain registration works: NameSilo purchase → CF zone creation → NS change at registrar. But the "happy path" is fire-and-forget. The agent has no way to:

1. **Check if NS propagated** — `verifyZone` checks record propagation but doesn't tell the agent whether *the zone itself is active* (CF confirmed NS).
2. **See CF zone activation** — `zones.status` is set once at insert ("pending") and never updated. `updateZoneStatus()` exists in `db.ts` but is never called.
3. **Get a single "is my domain ready?" answer** — post-registration, the agent must mentally combine `registerDomain` response + `verifyZone` + manual polling.
4. **Trigger CF to re-check NS** — Cloudflare has `PUT /zones/:id/activation_check` to request immediate re-verification, but we don't expose it.

D-7 closes this gap: a registration status endpoint that combines all post-registration checks, auto-syncs CF zone status, and exposes CF activation triggers.

## Goals

1. Sync CF zone status to local DB on demand (pending → active transition)
2. Expose CF activation trigger (request CF to re-verify NS immediately)
3. Registration status endpoint — one-call answer to "is my domain fully set up?"
4. Auto-refresh zone status in existing `getZone` and `verifyZone` when still "pending"

## Phase 1 — Cloudflare Activation Check

### New function in `cloudflare.ts`

`triggerActivationCheck(zoneId: string): Promise<CfZone>` — wraps `PUT /zones/:id/activation_check`.

- CF API: `PUT https://api.cloudflare.com/client/v4/zones/{zone_id}/activation_check`
- Auth: same `Bearer` token
- Returns the zone object with updated `status`
- On error, throw `CloudflareError` (same pattern as other CF functions)

Note: CF docs say this endpoint is rate-limited (one check per zone per hour). If CF returns 429, map to `rate_limited` error code. The caller should handle this gracefully.

## Phase 2 — Zone Status Refresh (Service Layer)

### New function in `service.ts`

`refreshZoneStatus(zoneId: string, callerWallet: string): Promise<ServiceResult<ZoneResponse>>`

1. Check zone ownership → 404/403
2. If `zone.status` is already `"active"` → skip CF call, return current zone
3. Call `cfGetZone(zone.cloudflare_id)` — gets latest status from CF
4. If CF status differs from local → call `updateZoneStatus(zoneId, cfZone.status)` (already exists in db.ts, never used)
5. Return updated zone

Decision table:

| local status | CF status | action | result |
|---|---|---|---|
| pending | pending | no update | zone (pending) |
| pending | active | `updateZoneStatus(id, "active")` | zone (active) |
| pending | moved | `updateZoneStatus(id, "moved")` | zone (moved) |
| active | active | no update | zone (active) |
| active | moved | `updateZoneStatus(id, "moved")` | zone (moved) |

Note: CF status should only transition forward (pending → active → moved). We update on any mismatch — no transition validation needed.

### Integrate into existing endpoints

**`getZone`** — after `checkZoneOwnership`, if `row.status === "pending"`, call `refreshZoneStatus` and return the refreshed zone. If `"active"` or `"moved"`, skip the CF call (avoid unnecessary API hits).

**`verifyZone`** — after current NS+record verification, also refresh zone status if still "pending". Add `zone_status` field to `VerifyResponse` so the agent sees both propagation results and CF activation status in one call.

## Phase 3 — Registration Status Endpoint

### New route: `GET /v1/domains/:domain/status`

x402-gated at `$0.001`. Requires wallet ownership of the registration.

### New types in `api.ts`

```
RegistrationStatusResponse {
  domain: string;
  purchased: true;
  zone_id: string | null;
  zone_status: ZoneStatus | null;          // "pending" | "active" | "moved" | null (no zone)
  ns_configured_at_registrar: boolean;     // registrations.ns_configured
  ns_propagated: boolean;                  // live DNS check
  ns_expected: string[];                   // CF-assigned NS
  ns_actual: string[];                     // live DNS NS
  zone_active: boolean;                    // CF confirmed NS
  all_ready: boolean;                      // zone_active && ns_propagated
  next_action: string | null;              // human-readable hint
}
```

`next_action` tells the agent what to do:
- `null` — fully ready, no action needed
- `"call POST /v1/domains/{domain}/configure-ns"` — NS not configured
- `"call POST /v1/domains/recover"` — zone not created
- `"wait for NS propagation"` — NS set but not propagated yet
- `"wait for Cloudflare activation"` — NS propagated but zone still pending

### New service function: `getRegistrationStatus(domain, callerWallet)`

1. Look up registration by domain → 404 if not found
2. Verify owner → 403
3. If `zone_id` is null → return partial status (`zone_created: false`, `next_action: "recover"`)
4. Get zone row → parse nameservers
5. Call `verifyNameservers(domain, expectedNs)` — live DNS check
6. If zone status is "pending" → call `refreshZoneStatus()` to sync with CF
7. Re-read zone row (may have been updated)
8. Compute `all_ready = zone_status === "active" && ns_propagated`
9. Compute `next_action` based on state (see table below)
10. Return `RegistrationStatusResponse`

### `next_action` decision table

| zone_id | ns_configured | ns_propagated | zone_status | next_action |
|---|---|---|---|---|
| null | any | any | null | `"call POST /v1/domains/{domain}/recover"` |
| set | false | any | any | `"call POST /v1/domains/{domain}/configure-ns"` |
| set | true | false | pending | `"wait for NS propagation"` |
| set | true | true | pending | `"wait for Cloudflare activation"` |
| set | true | true | active | `null` (fully ready) |
| set | true | false | active | `null` (CF considers it active; DNS cache lag) |

Note: Row 6 — if CF says active but our DNS check shows not propagated, CF is authoritative. This means local DNS resolver hasn't caught up yet. `all_ready` is still true because CF has confirmed. Don't tell the agent to wait.

Corrected: `all_ready = zone_status === "active"` (CF is the source of truth for "ready"). `ns_propagated` is informational only.

## Phase 4 — CF Activation Trigger Endpoint

### New route: `PUT /v1/zones/:zone_id/activate`

x402-gated at `$0.001`. Triggers CF to immediately re-check NS for this zone.

1. Check zone ownership → 404/403
2. Call `triggerActivationCheck(zone.cloudflare_id)` from cloudflare.ts
3. Update local zone status if CF returns a different status
4. Return `{ zone_id, status, activation_requested: true }`

If CF returns 429 (rate-limited), return 429 to agent with `"rate_limited"` error code and message suggesting to wait.

### New type in `api.ts`

```
ActivateResponse {
  zone_id: string;
  status: ZoneStatus;
  activation_requested: true;
}
```

## Files Changed

| File | Action | What changes |
|---|---|---|
| `packages/domain/src/cloudflare.ts` | Modify | Add `triggerActivationCheck(zoneId)` wrapping `PUT /zones/:id/activation_check` |
| `packages/domain/src/api.ts` | Modify | Add `RegistrationStatusResponse`, `ActivateResponse` types; add `zone_status` to `VerifyResponse` |
| `packages/domain/src/service.ts` | Modify | Add `refreshZoneStatus()`, `getRegistrationStatus()`; enhance `getZone()` to auto-refresh pending zones; enhance `verifyZone()` to include zone status |
| `packages/domain/src/index.ts` | Modify | Add `GET /v1/domains/:domain/status` route, `PUT /v1/zones/:zone_id/activate` route; add both to `DOMAIN_ROUTES` |
| `packages/domain/test/domain.test.ts` | Modify | Add tests for all new endpoints and status refresh behavior |

## Dependency Direction

```
index.ts → service.ts → { db.ts, cloudflare.ts, dns-verify.ts }
```

No new dependencies. `cloudflare.ts` gets one new function. `service.ts` gets two new functions and two enhanced functions. `index.ts` gets two new routes.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Auto-refresh in getZone | Only when status is "pending" | Avoid unnecessary CF API calls for already-active zones |
| Registration status vs verify | Separate endpoint | `verifyZone` checks DNS propagation of *all records*. Registration status is a high-level "is my domain ready?" check focused on the post-registration pipeline. Different audiences. |
| `all_ready` definition | `zone_status === "active"` (CF authoritative) | DNS propagation checks are resolver-dependent and can lag. CF's activation confirmation is the ground truth. |
| CF activation trigger as separate endpoint | Yes (`PUT /v1/zones/:zone_id/activate`) | Separation of concerns. Registration status is read-only. Activation trigger is a write action. Also, activation is useful for zones not created via registration (manual zone creation). |
| No background polling | Correct — on-demand only | Agent calls status/verify when ready. No cron, no background jobs, no timers. Keeps the service stateless and simple. |

## Test Assertions

### CF activation trigger

- `assert response.status === 200` with valid zone + activation check succeeds
- `assert response.json().activation_requested === true`
- `assert response.json().status === "active"` when CF returns active
- `assert db.getZoneById(zoneId).status === "active"` after CF returns active (DB synced)
- `assert response.status === 429` when CF rate-limits the activation check
- `assert response.status === 404` with unknown zone_id
- `assert response.status === 403` with wrong wallet

### Zone status refresh (integrated into getZone)

- Setup: insert zone with `status: "pending"`, mock CF `getZone` returning `status: "active"`
- `assert getZone(zoneId, wallet).data.status === "active"` (refreshed)
- `assert db.getZoneById(zoneId).status === "active"` (DB updated)
- Setup: insert zone with `status: "active"`, mock CF `getZone` (should NOT be called)
- `assert getZone(zoneId, wallet).data.status === "active"` (no CF call made)
- Verify mock CF `getZone` was NOT called (already active, skip refresh)

### verifyZone with zone_status

- `assert response.json().zone_status === "active"` when CF returns active during verify
- `assert response.json().zone_status === "pending"` when CF returns pending
- `assert response.json().all_propagated === true` requires NS propagated (unchanged behavior)
- Note: `all_propagated` remains about DNS propagation. `zone_status` is a separate field.

### Registration status endpoint

- Full success path: zone active, NS propagated
  - `assert response.json().all_ready === true`
  - `assert response.json().next_action === null`
  - `assert response.json().zone_status === "active"`

- Zone not created (recovery needed):
  - `assert response.json().zone_id === null`
  - `assert response.json().next_action` includes "recover"

- NS not configured at registrar:
  - `assert response.json().ns_configured_at_registrar === false`
  - `assert response.json().next_action` includes "configure-ns"

- NS set but not propagated, zone pending:
  - `assert response.json().ns_propagated === false`
  - `assert response.json().zone_status === "pending"`
  - `assert response.json().next_action` includes "wait"

- NS propagated, zone still pending:
  - `assert response.json().ns_propagated === true`
  - `assert response.json().zone_status === "pending"`
  - `assert response.json().all_ready === false`
  - `assert response.json().next_action` includes "Cloudflare activation"

- Ownership check:
  - `assert response.status === 403` with wrong wallet
  - `assert response.status === 404` with unknown domain

### Existing test regressions

- All existing zone CRUD, record CRUD, search, batch, mail-setup, verify, quote, register, recover, configure-ns tests must still pass (no behavior changes to these flows beyond additive fields)

## Before Closing

- [ ] Run `pnpm -C packages/domain check` (lint + typecheck + test pass)
- [ ] `updateZoneStatus()` in db.ts is now called — verify it works with the existing schema
- [ ] `triggerActivationCheck()` handles CF 429 (rate limit) → returns user-facing 429
- [ ] `refreshZoneStatus()` only calls CF API when local status is NOT "active" (avoid unnecessary calls)
- [ ] `getZone()` returns refreshed status for "pending" zones (verify mock CF `getZone` is called for pending, NOT called for active)
- [ ] `verifyZone()` response includes `zone_status` field (additive — does not break existing response shape)
- [ ] `RegistrationStatusResponse.all_ready` is based on CF status (not DNS propagation), per design decision
- [ ] `next_action` table: verify all 6 state combinations return correct action string
- [ ] For every boolean condition, verify both True and False paths are covered by tests
- [ ] Existing D-1/D-2/D-3/D-5/D-6/D-8 tests still pass (no regressions)
