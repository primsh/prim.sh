# W-7: Implement budget/spending policy engine

**Status:** Plan
**Spec:** `specs/wallet.md`
**Depends on:** W-4 (send — done)
**Blocks:** Nothing directly

## Context

wallet.sh currently returns 501 for policy and pause/resume endpoints, and `policy: null` in wallet detail. W-7 implements spending limits (per-tx max, daily max, allowed primitives) and the pause/resume circuit breaker for individual wallets.

Note: W-9 (circuit breaker) is a separate global circuit breaker ported from Railgunner. W-7's pause/resume is per-wallet, scoped by operation type (all/send/swap). Both are complementary.

## Goals

1. Owner sets spending policy on a wallet (maxPerTx, maxPerDay, allowedPrimitives)
2. Policy is enforced before every send operation
3. Daily spend tracking with automatic reset at midnight UTC
4. Per-wallet pause/resume with scope (all, send, swap)
5. Paused state reflected in wallet list and detail responses

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Storage | `policies` SQLite table (one row per wallet) | Separate table keeps wallets table simple |
| Daily reset | Midnight UTC, tracked via `daily_reset_at` timestamp | Simple, predictable. Agent can check policy to see remaining budget. |
| Pause scope | `all`, `send`, `swap` | Matches api.ts PauseScope type |
| Policy enforcement | Check in `sendUsdc` before executing | Centralized — all sends go through one function |
| Daily spent | Updated in DB after each successful send | Atomic increment after completeExecution |

## Phase 1 — Database

### Modify: `packages/wallet/src/db.ts`

Add `policies` table:

```sql
CREATE TABLE IF NOT EXISTS policies (
  wallet_address    TEXT PRIMARY KEY,
  max_per_tx        TEXT,           -- decimal string or NULL (no limit)
  max_per_day       TEXT,           -- decimal string or NULL (no limit)
  allowed_primitives TEXT,          -- JSON array string or NULL (no restriction)
  daily_spent       TEXT NOT NULL DEFAULT '0.00',
  daily_reset_at    TEXT NOT NULL,  -- ISO timestamp of next reset
  pause_scope       TEXT,           -- NULL (not paused), "all", "send", "swap"
  paused_at         TEXT,           -- ISO timestamp when paused
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
)
```

New DB functions:
- `getPolicy(walletAddress: string): PolicyRow | null`
- `upsertPolicy(walletAddress: string, updates: Partial<PolicyRow>): void`
- `incrementDailySpent(walletAddress: string, amount: string): void`
- `resetDailySpentIfNeeded(walletAddress: string): void` — check daily_reset_at, reset if past
- `setPauseState(walletAddress: string, scope: string | null, pausedAt: string | null): void`

## Phase 2 — Policy module

### New file: `packages/wallet/src/policy.ts`

Export functions that encapsulate policy logic:

**`checkPolicy(walletAddress, amount): { ok: true } | { ok: false, code, message }`**
1. Get policy from DB (if none, all operations allowed)
2. Reset daily spent if past reset time
3. Check pause: if paused with scope "all" or "send" → return `wallet_paused`
4. Check maxPerTx: if amount > maxPerTx → return `policy_violation`
5. Check maxPerDay: if dailySpent + amount > maxPerDay → return `policy_violation`
6. Return ok

**`recordSpend(walletAddress, amount): void`**
- Called after successful send
- Increments daily_spent by amount

## Phase 3 — Integrate into send

### Modify: `packages/wallet/src/service.ts`

In `sendUsdc`, after ownership check and before balance check:
1. Call `checkPolicy(address, request.amount)`
2. If not ok → return the error (422 for policy_violation, 403 for wallet_paused)
3. After successful send (completeExecution with "succeeded"): call `recordSpend(address, request.amount)`

## Phase 4 — Service functions

### Modify: `packages/wallet/src/service.ts`

**`getSpendingPolicy(address, caller)`**
1. Ownership check
2. Get policy from DB (or return defaults: no limits, not paused)
3. Reset daily spent if needed
4. Return PolicyResponse

**`updateSpendingPolicy(address, caller, updates)`**
1. Ownership check
2. Validate: maxPerTx and maxPerDay must be positive decimals if present
3. Upsert policy row
4. Return PolicyResponse

**`pauseWallet(address, caller, scope)`**
1. Ownership check
2. Set pause state in DB
3. Return PauseResponse

**`resumeWallet(address, caller, scope)`**
1. Ownership check
2. Clear pause state in DB
3. Return ResumeResponse

Also update `getWallet` and `listWallets` to return actual `paused` state from the policy table instead of hardcoded `false`.

## Phase 5 — Route handlers

### Modify: `packages/wallet/src/index.ts`

Replace four 501 stubs:
- `GET /v1/wallets/:address/policy` → getSpendingPolicy
- `PUT /v1/wallets/:address/policy` → updateSpendingPolicy
- `POST /v1/wallets/:address/pause` → pauseWallet
- `POST /v1/wallets/:address/resume` → resumeWallet

## Phase 6 — Tests

### New file: `packages/wallet/test/policy.test.ts`

| Test | Expected |
|------|----------|
| Get policy (none set) | 200, defaults (no limits, not paused) |
| Set maxPerTx | 200, policy returned with limit |
| Set maxPerDay | 200, policy returned with limit |
| Send within limits | 200, send succeeds |
| Send exceeds maxPerTx | 422, policy_violation |
| Send exceeds maxPerDay | 422, policy_violation |
| Daily reset | After simulated reset, daily_spent goes to 0 |
| Pause wallet (scope: all) | 200, paused=true |
| Send while paused | 403, wallet_paused |
| Resume wallet | 200, paused=false |
| Send after resume | 200, succeeds |
| Wallet detail shows paused state | paused field reflects DB |
| Wallet list shows paused state | paused field reflects DB |

## Files changed

| File | Action |
|------|--------|
| `packages/wallet/src/db.ts` | **Modify** — add policies table + CRUD |
| `packages/wallet/src/policy.ts` | **New** — checkPolicy, recordSpend |
| `packages/wallet/src/service.ts` | **Modify** — integrate policy check into sendUsdc, add 4 policy/pause functions, update getWallet/listWallets paused field |
| `packages/wallet/src/index.ts` | **Modify** — replace 4 stubs |
| `packages/wallet/test/policy.test.ts` | **New** — policy + pause/resume tests |

## Before closing

- [ ] `pnpm --filter @agentstack/wallet check` passes
- [ ] Policy CRUD works (get, set)
- [ ] maxPerTx enforcement: send > limit returns 422
- [ ] maxPerDay enforcement: cumulative sends > daily limit returns 422
- [ ] Daily reset works (spent resets after midnight UTC)
- [ ] Pause/resume works with scope (all, send, swap)
- [ ] Paused wallet rejects sends with 403 wallet_paused
- [ ] Wallet detail/list responses show real paused state
- [ ] Policy checks happen before balance check in sendUsdc
