# W-8: Port execution journal + idempotency from Railgunner

**Status:** Plan
**Spec:** `specs/wallet.md`
**Depends on:** W-4 (send — done, basic journal exists)
**Blocks:** Nothing directly

## Context

W-4 implemented a basic execution journal: `executions` table with idempotency_key, status (pending/succeeded/failed), and result. W-8 enhances this with Railgunner's full journal pattern:

1. **Execution events** — append-only audit trail per execution (tx_sent, tx_confirmed, etc.)
2. **Dead letters** — unrecoverable failures moved to a separate table for investigation
3. **Atomic claiming** — `tryClaim` with SQL `RETURNING` to prevent double-execution
4. **Transaction history endpoint** — `GET /v1/wallets/:address/history` serving from the journal

## Goals

1. Add execution_events table for per-execution audit trail
2. Add dead_letters table for unrecoverable failures
3. Enhance execution status machine: queued → running → succeeded/failed/aborted
4. Implement `GET /v1/wallets/:address/history` using journal data
5. Maintain backward compatibility with existing sendUsdc journal writes

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Status values | queued, running, succeeded, failed, aborted | Matches Railgunner. Current pending→succeeded/failed maps to running→succeeded/failed |
| Migration | Add new columns/tables, don't change existing | Backward compatible with W-4 data |
| History source | executions table (not on-chain) | Fast, local, no RPC dependency. On-chain indexing is future work |
| Event types | tx_sent, tx_confirmed, balance_checked, policy_checked, etc. | Append-only, extensible |

## Phase 1 — Database enhancements

### Modify: `packages/wallet/src/db.ts`

Add two new tables alongside existing `executions`:

```sql
CREATE TABLE IF NOT EXISTS execution_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_id  TEXT NOT NULL,      -- idempotency_key from executions
  event_type    TEXT NOT NULL,
  payload       TEXT,               -- JSON
  created_at    INTEGER NOT NULL
)

CREATE TABLE IF NOT EXISTS dead_letters (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_id  TEXT,               -- idempotency_key, nullable
  reason        TEXT NOT NULL,
  payload       TEXT,               -- JSON
  created_at    INTEGER NOT NULL
)
```

Index: `execution_events(execution_id)`, `dead_letters(execution_id)`

Modify existing `executions` table handling:
- Change `insertExecution` to set status `"queued"` instead of `"pending"`
- Add `tryClaim(idempotencyKey): boolean` — atomic UPDATE ... WHERE status = 'queued'
- Add `markAborted(idempotencyKey, reason): void`

New functions:
- `appendEvent(executionId: string, eventType: string, payload?: string): void`
- `getEventsByExecution(executionId: string): ExecutionEventRow[]`
- `insertDeadLetter(executionId: string | null, reason: string, payload?: string): void`
- `getExecutionsByWallet(walletAddress: string, limit: number, after?: string): ExecutionRow[]` — for history

## Phase 2 — Enhanced sendUsdc journaling

### Modify: `packages/wallet/src/service.ts`

Update `sendUsdc` to use the enhanced journal:
1. `insertExecution` (now creates with "queued")
2. `tryClaim` — atomic claim; if fails, return error (concurrent execution)
3. `appendEvent(key, "balance_checked", { balance })`
4. `appendEvent(key, "tx_sent", { to, amount })`
5. On success: `appendEvent(key, "tx_confirmed", { txHash })` then `completeExecution`
6. On failure: `appendEvent(key, "tx_failed", { error })` then `completeExecution` with "failed"
7. On unrecoverable: `insertDeadLetter` and `markAborted`

**Backward compat:** Existing code calling `insertExecution`/`completeExecution` continues to work. The "pending" → "queued" rename is handled by updating the insert function.

## Phase 3 — History endpoint

### Modify: `packages/wallet/src/service.ts`

**`getTransactionHistory(address, caller, limit, after)`**
1. Ownership check
2. Query `getExecutionsByWallet(address, limit, after)` — returns executions ordered by created_at DESC
3. Map each execution row to `TransactionRecord` (types already defined in api.ts)
4. Return HistoryResponse with cursor pagination

### Modify: `packages/wallet/src/index.ts`

Replace GET /v1/wallets/:address/history stub with real handler.

## Phase 4 — Tests

### New file: `packages/wallet/test/journal.test.ts`

| Test | Expected |
|------|----------|
| Execution creates with "queued" status | DB row has status "queued" |
| tryClaim succeeds on queued | Returns true, status becomes "running" |
| tryClaim fails on running | Returns false |
| tryClaim fails on succeeded | Returns false |
| appendEvent adds event | Event retrievable by execution ID |
| Multiple events per execution | All events returned in order |
| Dead letter insertion | Dead letter stored with reason |
| sendUsdc creates events | Events for balance_checked, tx_sent, tx_confirmed |
| sendUsdc failure creates dead letter | On RPC failure |
| GET /history returns transactions | Ordered by time, filtered by wallet |
| GET /history pagination | Cursor works correctly |
| GET /history empty | 200, empty array |

## Files changed

| File | Action |
|------|--------|
| `packages/wallet/src/db.ts` | **Modify** — add execution_events + dead_letters tables, tryClaim, appendEvent, etc. |
| `packages/wallet/src/service.ts` | **Modify** — enhance sendUsdc journaling, add getTransactionHistory |
| `packages/wallet/src/index.ts` | **Modify** — replace history stub |
| `packages/wallet/test/journal.test.ts` | **New** — journal + history tests |

## Before closing

- [ ] `pnpm --filter @agentstack/wallet check` passes
- [ ] Existing send tests still pass (backward compat)
- [ ] execution_events populated during send flow
- [ ] tryClaim is atomic (concurrent test or logic verification)
- [ ] Dead letters capture unrecoverable failures
- [ ] GET /history returns transactions from journal
- [ ] History pagination works
- [ ] No new npm dependencies
