# W-6: Implement funding request flow (agent → owner notification → approval)

**Status:** Plan
**Spec:** `specs/wallet.md`
**Depends on:** W-4 (send — done)
**Blocks:** Nothing directly

## Context

wallet.sh currently returns 501 for the four fund-request endpoints. W-6 implements the full flow: agent creates a funding request, owner lists/reviews requests, owner approves (triggers USDC transfer from owner wallet to agent wallet) or denies.

## Goals

1. Agent creates a fund request specifying amount and reason
2. Owner lists pending fund requests for their wallets
3. Owner approves a request (triggering USDC transfer from owner's wallet to agent's wallet)
4. Owner denies a request (with optional reason)
5. All operations enforce ownership correctly

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Storage | `fund_requests` SQLite table | Same pattern as wallets/executions |
| Request IDs | `fr_` + 8 random hex chars | Consistent with `srv_` pattern |
| Ownership | Agent owns the wallet, owner owns the agent's wallet via `created_by` | Owner approves/denies requests on wallets they own |
| Approval transfer | Call `sendUsdc` internally | Reuse existing send logic with idempotency |
| Notification | Store-only (no webhook in W-6) | Webhook/pipe.sh notification is future work |

## Phase 1 — Database

### Modify: `packages/wallet/src/db.ts`

Add `fund_requests` table to schema init:

```sql
CREATE TABLE IF NOT EXISTS fund_requests (
  id              TEXT PRIMARY KEY,
  wallet_address  TEXT NOT NULL,
  amount          TEXT NOT NULL,
  reason          TEXT NOT NULL,
  status          TEXT NOT NULL,  -- "pending", "approved", "denied"
  approved_tx     TEXT,           -- txHash if approved
  deny_reason     TEXT,
  created_by      TEXT NOT NULL,  -- wallet address of the agent that created the request
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
)
```

Index on `wallet_address` for listing.

New DB functions:
- `insertFundRequest(params): void`
- `getFundRequestById(id: string): FundRequestRow | null`
- `getFundRequestsByWallet(walletAddress: string, limit: number, after?: string): FundRequestRow[]`
- `updateFundRequestStatus(id: string, status: string, approvedTx?: string, denyReason?: string): void`

## Phase 2 — Service functions

### Modify: `packages/wallet/src/service.ts`

**`createFundRequest(walletAddress, request, caller)`**
1. Ownership check: caller must own the wallet (they're the agent requesting funds)
2. Validate amount (positive decimal), reason (non-empty)
3. Generate ID: `fr_` + 8 random hex
4. Insert into DB with status "pending"
5. Return FundRequestResponse

**`listFundRequests(walletAddress, caller, limit, after)`**
1. Ownership check: caller must own the wallet
2. Query fund_requests by wallet_address
3. Return paginated list

**`approveFundRequest(requestId, caller)`**
1. Look up request by ID
2. Verify request is "pending" (not already approved/denied)
3. Look up the wallet — verify caller is the owner (created_by)
4. Execute transfer: call `sendUsdc` with an auto-generated idempotency key (`fr_approve_${requestId}`)
5. If send succeeds: update request status to "approved" with txHash
6. If send fails (insufficient balance, etc.): return the error, don't change request status
7. Return FundRequestApproveResponse

**`denyFundRequest(requestId, caller, reason?)`**
1. Look up request by ID
2. Verify request is "pending"
3. Verify caller owns the wallet
4. Update status to "denied" with optional reason
5. Return FundRequestDenyResponse

**Ownership note:** The fund-request endpoints use a different ownership model than other endpoints. The agent (wallet user) creates requests. The owner (wallet creator, `created_by`) approves/denies. Both need to be able to list requests. For simplicity, anyone who owns the wallet can do all four operations.

## Phase 3 — Route handlers

### Modify: `packages/wallet/src/index.ts`

Replace the four 501 stubs:

- `POST /v1/wallets/:address/fund-request` → createFundRequest
- `GET /v1/wallets/:address/fund-requests` → listFundRequests
- `POST /v1/fund-requests/:id/approve` → approveFundRequest
- `POST /v1/fund-requests/:id/deny` → denyFundRequest

The approve/deny routes use `:id` (not `:address`), so the ownership check happens inside the service function (look up the request → get the wallet → check ownership).

Add claimMiddleware to all four routes.

## Phase 4 — Tests

### New file: `packages/wallet/test/fund-request.test.ts`

| Test | Expected |
|------|----------|
| Create fund request (valid) | 200, request object with fr_ ID, status "pending" |
| Create fund request (not owner) | 403 |
| List fund requests (has requests) | 200, array with pending requests |
| List fund requests (empty) | 200, empty array |
| Approve fund request | 200, status "approved", txHash present |
| Approve already approved | 400 or 409 (can't approve twice) |
| Deny fund request | 200, status "denied" |
| Deny with reason | 200, reason present |
| Deny already denied | 400 or 409 |
| Approve insufficient balance | Error from sendUsdc propagated |

## Files changed

| File | Action |
|------|--------|
| `packages/wallet/src/db.ts` | **Modify** — add fund_requests table + CRUD |
| `packages/wallet/src/service.ts` | **Modify** — add 4 fund request functions |
| `packages/wallet/src/index.ts` | **Modify** — replace 4 stubs with real handlers |
| `packages/wallet/test/fund-request.test.ts` | **New** — fund request tests |

## Before closing

- [ ] `pnpm --filter @agentstack/wallet check` passes
- [ ] Fund request CRUD works (create, list, approve, deny)
- [ ] Approve triggers actual USDC transfer (mocked in test)
- [ ] Ownership enforced on all endpoints
- [ ] Pending-only check: can't approve/deny non-pending requests
- [ ] Request IDs use `fr_` prefix
