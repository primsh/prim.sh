# W-9: Port circuit breaker from Railgunner

**Status:** Plan
**Spec:** `specs/wallet.md`
**Depends on:** W-4 (send — done)
**Blocks:** Nothing directly

## Context

Railgunner has a circuit breaker (emergency pause by scope) stored in SQLite. W-9 ports this pattern to wallet.sh as a **global** circuit breaker that operates independently of W-7's per-wallet pause.

The circuit breaker is a simple Closed/Open toggle per scope. No automatic recovery — manual resume required. The `all` scope acts as a kill switch that overrides all other scopes.

Note: W-7 implements per-wallet pause/resume (stored in the policies table). W-9 implements a global circuit breaker (stored in its own table). Both are checked before sends. W-7 = "owner paused this wallet", W-9 = "operator paused the entire service".

## Goals

1. Global pause/resume by scope (all, send, swap)
2. `isPaused(scope)` check integrated before all money-moving operations
3. `all` scope overrides individual scopes
4. State stored in SQLite, survives restarts
5. Admin endpoints (not x402-gated, internal only)

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Storage | `circuit_breaker` SQLite table | Matches Railgunner exactly |
| Scopes | all, send, swap | Matches wallet.sh operations |
| Reset | Manual only (no half-open) | Railgunner pattern. Simpler, safer. |
| Admin auth | No x402 (internal-only routes) | Circuit breaker is ops tooling, not agent-facing |
| Integration | Check in sendUsdc before policy check | Global override comes first |

## Phase 1 — Circuit breaker module

### New file: `packages/wallet/src/circuit-breaker.ts`

**DB setup:** Add `circuit_breaker` table in `getDb()` (modify db.ts):

```sql
CREATE TABLE IF NOT EXISTS circuit_breaker (
  scope       TEXT PRIMARY KEY,
  paused_at   TEXT,
  updated_at  INTEGER NOT NULL
)
```

**Exported functions:**

`pause(scope: string): void`
- Upsert row: set `paused_at = new Date().toISOString()`, `updated_at = Date.now()`
- Scope must be one of: "all", "send", "swap"

`resume(scope: string): void`
- Upsert row: set `paused_at = NULL`, `updated_at = Date.now()`

`isPaused(flowType: string): boolean`
- Query `circuit_breaker` for scope "all" — if paused_at is not null, return true
- Query `circuit_breaker` for the specific flowType — if paused_at is not null, return true
- Otherwise return false

| all paused? | flow paused? | isPaused? |
|-------------|-------------|-----------|
| No          | No          | No        |
| No          | Yes         | Yes       |
| Yes         | No          | Yes       |
| Yes         | Yes         | Yes       |

`assertNotPaused(flowType: string): void`
- Calls isPaused; if true, throws Error with descriptive message

`getState(): Record<string, string | null>`
- Returns all scope → paused_at mappings (for status/dashboard)

## Phase 2 — Integrate into send

### Modify: `packages/wallet/src/service.ts`

In `sendUsdc`, add at the very top (before ownership check):
```
if (isPaused("send")) → return { ok: false, status: 503, code: "service_paused", message: "Send operations are paused" }
```

This is the global override. It runs before everything else — even before checking if the wallet exists.

## Phase 3 — Admin routes

### Modify: `packages/wallet/src/index.ts`

Add internal admin routes (NOT x402-gated):

- `POST /v1/admin/circuit-breaker/pause` — body: `{ scope: "all" | "send" | "swap" }`
- `POST /v1/admin/circuit-breaker/resume` — body: `{ scope: "all" | "send" | "swap" }`
- `GET /v1/admin/circuit-breaker` — returns current state of all scopes

These routes are under `/v1/admin/` and not included in WALLET_ROUTES (no x402 pricing). Add "POST /v1/admin/circuit-breaker/pause", "POST /v1/admin/circuit-breaker/resume", "GET /v1/admin/circuit-breaker" to the freeRoutes list.

## Phase 4 — Tests

### New file: `packages/wallet/test/circuit-breaker.test.ts`

| Test | Expected |
|------|----------|
| isPaused returns false by default | No pauses set |
| pause("send") makes isPaused("send") true | Scope-specific |
| pause("send") does NOT affect isPaused("swap") | Independent scopes |
| pause("all") makes isPaused("send") true | Global override |
| pause("all") makes isPaused("swap") true | Global override |
| resume("send") clears send pause | Back to false |
| resume("all") clears global | Individual scopes unaffected |
| Send while send-paused returns 503 | service_paused |
| Send while all-paused returns 503 | service_paused |
| Send after resume succeeds | Normal operation |
| getState returns all scopes | Full state map |
| Admin pause endpoint | POST works, state changes |
| Admin resume endpoint | POST works, state clears |
| Admin get state endpoint | GET returns current state |

## Files changed

| File | Action |
|------|--------|
| `packages/wallet/src/db.ts` | **Modify** — add circuit_breaker table |
| `packages/wallet/src/circuit-breaker.ts` | **New** — pause/resume/isPaused/getState |
| `packages/wallet/src/service.ts` | **Modify** — add isPaused check to sendUsdc |
| `packages/wallet/src/index.ts` | **Modify** — add 3 admin routes, add to freeRoutes |
| `packages/wallet/test/circuit-breaker.test.ts` | **New** — circuit breaker tests |

## Before closing

- [ ] `pnpm --filter @agentstack/wallet check` passes
- [ ] Existing send tests still pass
- [ ] pause("all") blocks all sends
- [ ] pause("send") blocks sends only
- [ ] resume clears pause state
- [ ] isPaused truth table verified (all 4 combinations)
- [ ] Admin routes work without x402 payment
- [ ] State persists across getDb() calls (SQLite-backed)
