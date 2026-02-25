# ST-3: Storage Quota + Usage Tracking

## Context

store.sh currently has no limits — any wallet can create unlimited buckets with unlimited objects. ST-3 adds per-bucket storage quotas, real-time usage metering, and enforcement so agents can't consume unbounded R2 resources.

**Why per-bucket, not per-wallet:** Agents often operate multiple buckets for different purposes (logs, artifacts, models). Per-bucket limits let agents partition budgets. Wallet-level aggregate limits can be added later if needed, but per-bucket is the useful primitive.

## Goals

1. Track cumulative storage usage (bytes) per bucket in real time
2. Allow quota limits to be set/updated per bucket
3. Reject writes (putObject) that would exceed quota
4. Expose usage + quota info via API
5. Provide a reconciliation mechanism for drift between tracked usage and actual R2 usage

## Architecture

### Data flow

```
putObject request
  → checkBucketOwnership (existing)
  → checkQuota (new): usage_bytes + incoming size > quota_bytes? reject
  → s3PutObject (existing)
  → updateUsage: increment usage_bytes by object size (new)
```

```
deleteObject request
  → checkBucketOwnership (existing)
  → s3DeleteObject (existing)
  → updateUsage: decrement usage_bytes by object size (new)
```

### Dependency direction

`index.ts → service.ts → {db.ts, cloudflare.ts, s3.ts, api.ts}` — no change. Quota logic lives entirely in `service.ts` and `db.ts`. No new files needed.

## Phase 1: Schema + DB Layer (`db.ts`)

### New columns on `buckets` table

Add via `ALTER TABLE` in `getDb()` init block (same pattern as existing CREATE TABLE):

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `quota_bytes` | INTEGER | NULL | NULL = unlimited. 0 = read-only (no new writes). |
| `usage_bytes` | INTEGER | 0 | Running total of object sizes stored in bucket |

**Migration approach:** Two `ALTER TABLE ADD COLUMN` statements wrapped in try-catch (SQLite ignores "column already exists" errors, or use `PRAGMA table_info` to check). This is the same zero-downtime approach — the DB file upgrades itself on first access after deploy.

### New DB query functions

- `getQuota(bucketId)` → `{ quota_bytes: number | null, usage_bytes: number }`
- `setQuota(bucketId, quotaBytes: number | null)` → void (UPDATE buckets SET quota_bytes = ?)
- `incrementUsage(bucketId, deltaBytes: number)` → void (UPDATE buckets SET usage_bytes = usage_bytes + ?)
- `decrementUsage(bucketId, deltaBytes: number)` → void (UPDATE buckets SET usage_bytes = MAX(0, usage_bytes - ?))
  - `MAX(0, ...)` prevents negative usage from timing races or reconciliation edge cases
- `setUsage(bucketId, usageBytes: number)` → void (for reconciliation)

## Phase 2: Quota Enforcement (`service.ts`)

### putObject changes

Before calling `s3PutObject`, check quota:

1. Read `quota_bytes` and `usage_bytes` from the bucket row
2. Determine incoming object size:
   - From `Content-Length` header (passed as new parameter to `putObject`)
   - If no Content-Length (streaming), buffer to get size — or reject streaming uploads when quota is set (simpler v1)
3. Apply enforcement (see decision table below)
4. After successful S3 put, call `incrementUsage(bucketId, objectSize)`

**Object overwrite handling:** When overwriting an existing key, the net usage change is `newSize - oldSize`. To get `oldSize`, issue a HEAD request (S3 HeadObject) before PUT. If the key doesn't exist, `oldSize = 0`.

### deleteObject changes

After successful S3 delete:
1. Need to know the deleted object's size — issue S3 HeadObject *before* delete to capture size
2. Call `decrementUsage(bucketId, objectSize)`

If HeadObject fails (object already gone), skip usage decrement (idempotent delete).

### Quota enforcement decision table

| quota_bytes | usage + incoming > quota | Action |
|-------------|--------------------------|--------|
| NULL        | N/A                      | Allow (unlimited) |
| 0           | N/A                      | Reject — `quota_exceeded` (read-only bucket) |
| > 0         | false                    | Allow |
| > 0         | true                     | Reject — `quota_exceeded` |

New error code: `"quota_exceeded"` — add to `ERROR_CODES` in `api.ts`. HTTP status: **413** (Payload Too Large).

### New service function: `setQuota`

```
setQuota(bucketId, callerWallet, quotaBytes) → ServiceResult<QuotaResponse>
```

- Ownership check (existing `checkBucketOwnership`)
- Validate `quotaBytes`: must be null (remove limit) or non-negative integer
- Note: setting quota below current usage is allowed (bucket becomes "over quota" — existing data isn't deleted, but new writes are rejected)

### New service function: `getUsage`

```
getUsage(bucketId, callerWallet) → ServiceResult<UsageResponse>
```

- Ownership check
- Return `{ quota_bytes, usage_bytes, usage_pct }` where `usage_pct` = `usage_bytes / quota_bytes * 100` (null if unlimited)

### New service function: `reconcileUsage`

```
reconcileUsage(bucketId, callerWallet) → ServiceResult<ReconcileResponse>
```

- Ownership check
- Call `s3ListObjects` with pagination to sum all object sizes in the bucket
- Compare with `usage_bytes` in DB
- Update DB to match actual R2 usage
- Return `{ previous_bytes, actual_bytes, delta_bytes }`

This is the escape hatch for usage drift (e.g., from crashes between S3 write and DB update, or direct R2 console manipulation).

## Phase 3: API Surface (`index.ts`)

### New routes

| Route | Method | Price | Description |
|-------|--------|-------|-------------|
| `/v1/buckets/:id/quota` | GET | $0.001 | Get quota + usage for bucket |
| `/v1/buckets/:id/quota` | PUT | $0.01 | Set quota for bucket |
| `/v1/buckets/:id/quota/reconcile` | POST | $0.05 | Reconcile tracked usage against actual R2 |

### Request/response shapes

**GET /v1/buckets/:id/quota** response:
```json
{
  "bucket_id": "b_a1b2c3d4",
  "quota_bytes": 1073741824,
  "usage_bytes": 524288000,
  "usage_pct": 48.83
}
```

If `quota_bytes` is null (unlimited):
```json
{
  "bucket_id": "b_a1b2c3d4",
  "quota_bytes": null,
  "usage_bytes": 524288000,
  "usage_pct": null
}
```

**PUT /v1/buckets/:id/quota** request:
```json
{ "quota_bytes": 1073741824 }
```
To remove limit: `{ "quota_bytes": null }`

Response: same shape as GET.

**POST /v1/buckets/:id/quota/reconcile** response:
```json
{
  "bucket_id": "b_a1b2c3d4",
  "previous_bytes": 524288000,
  "actual_bytes": 524290048,
  "delta_bytes": 2048
}
```

### Existing route changes

**POST /v1/buckets** (createBucket) — no change. New buckets start with `quota_bytes: null` (unlimited), `usage_bytes: 0`.

**GET /v1/buckets/:id** (getBucket) — add `quota_bytes` and `usage_bytes` fields to `BucketResponse`.

**PUT /v1/buckets/:id/objects/\*** (putObject) — now enforces quota. New 413 error response:
```json
{
  "error": {
    "code": "quota_exceeded",
    "message": "Upload would exceed bucket quota (1073741824 bytes). Current usage: 1073000000, incoming: 800000."
  }
}
```

## Phase 4: S3 Layer Changes (`s3.ts`)

### New function: `headObject`

```
headObject(bucketName, key) → { size: number, etag: string } | null
```

S3 HEAD request. Returns null if 404 (key doesn't exist). Used by putObject (overwrite detection) and deleteObject (size lookup before delete).

### putObject return value

The existing `putObject` in `s3.ts` already returns `{ etag, size }` but `size` comes from the response `Content-Length` header, which R2 may not always set on PUT responses. Two options:

1. Accept `contentLength` as a parameter from the caller (service layer passes it from the request header)
2. Issue a HEAD after PUT to get authoritative size

Option 1 is simpler and avoids an extra round trip. The service layer already has access to Content-Length. Fall back to HEAD if Content-Length is unavailable.

## Phase 5: Update `api.ts` Types

### New types

- `QuotaResponse`: `{ bucket_id, quota_bytes, usage_bytes, usage_pct }`
- `SetQuotaRequest`: `{ quota_bytes: number | null }`
- `ReconcileResponse`: `{ bucket_id, previous_bytes, actual_bytes, delta_bytes }`

### Modified types

- `BucketResponse`: add `quota_bytes: number | null` and `usage_bytes: number`
- `ERROR_CODES`: add `"quota_exceeded"`

## Files to Modify

| File | Changes |
|------|---------|
| `src/db.ts` | ALTER TABLE migration, new query functions (getQuota, setQuota, incrementUsage, decrementUsage, setUsage), add quota_bytes/usage_bytes to BucketRow |
| `src/api.ts` | New types (QuotaResponse, SetQuotaRequest, ReconcileResponse), update BucketResponse, add quota_exceeded error code |
| `src/s3.ts` | New headObject function |
| `src/service.ts` | Quota enforcement in putObject/deleteObject, new setQuota/getUsage/reconcileUsage functions, update rowToBucketResponse |
| `src/index.ts` | 3 new routes (GET/PUT quota, POST reconcile), add new route prices to STORE_ROUTES |

No new files. No dependency direction changes.

## Key Design Decisions

1. **Per-bucket quotas, not per-wallet.** Simpler, more granular, matches the "each bucket is independent" mental model. Wallet-level limits can aggregate later.

2. **Synchronous enforcement (check before write), not async.** The check-then-write pattern has a small race window, but SQLite's single-writer serialization makes it safe for a single-instance service. Multi-instance would need a distributed lock (not needed for v1).

3. **Content-Length required when quota is set.** If a bucket has a quota and the PUT request has no Content-Length header, reject with 411 (Length Required). This avoids buffering arbitrarily large streaming uploads to measure size.

4. **Over-quota is allowed via setQuota, but blocks new writes.** Setting a quota lower than current usage doesn't delete data. It just prevents further writes until usage drops (via deletes) or quota is raised.

5. **HeadObject before delete.** One extra S3 round trip per delete, but it's the only way to know the deleted object's size for accurate usage tracking. HeadObject is extremely cheap on R2.

6. **Reconcile is explicit, not automatic.** No background jobs. Agent calls POST /reconcile when they suspect drift. Keeps the system simple and stateless.

### Content-Length enforcement decision table

| quota_bytes | Content-Length header present | Action |
|-------------|------------------------------|--------|
| NULL        | yes                          | Allow, track usage with known size |
| NULL        | no                           | Allow, track usage = 0 (best-effort; reconcile later) |
| non-NULL    | yes                          | Allow if within quota |
| non-NULL    | no                           | Reject — 411 Length Required |

## Testing Strategy

### New test file: not needed — extend `test/store.test.ts`

### S3 mock changes

Add HeadObject mock to existing `mockFetch`:
- S3 HEAD `/{bucket}/{key}` → return 200 with `Content-Length: 42` header
- S3 HEAD `/{bucket}/missing-key` → return 404

### Test groups (~25 new tests)

**Quota enforcement on putObject:**
- `assert result.ok === true` when `quota_bytes` is null (unlimited) — upload succeeds
- `assert result.ok === true` when `usage_bytes + objectSize <= quota_bytes` — within quota
- `assert result.ok === false && result.code === "quota_exceeded"` when `usage_bytes + objectSize > quota_bytes` — over quota
- `assert result.ok === false && result.code === "quota_exceeded"` when `quota_bytes === 0` — read-only bucket
- `assert result.status === 411` when `quota_bytes` is set and no Content-Length provided

**Usage tracking on putObject:**
- After successful PUT, `assert getQuota(bucketId).usage_bytes === objectSize`
- After two PUTs, `assert getQuota(bucketId).usage_bytes === size1 + size2`
- After overwrite (same key), `assert getQuota(bucketId).usage_bytes === newSize` (not oldSize + newSize)

**Usage tracking on deleteObject:**
- After PUT then DELETE, `assert getQuota(bucketId).usage_bytes === 0`
- After DELETE of nonexistent key (HeadObject returns 404), `assert getQuota(bucketId).usage_bytes` unchanged

**setQuota:**
- `assert result.ok === true` when owner sets valid quota
- `assert result.ok === true` when setting quota to null (remove limit)
- `assert result.ok === false && result.status === 403` when non-owner tries to set quota
- `assert result.ok === false && result.status === 404` when bucket doesn't exist
- `assert result.ok === false && result.code === "invalid_request"` when quota_bytes is negative
- Setting quota below current usage succeeds (over-quota is allowed), `assert result.ok === true`

**getUsage:**
- Returns correct `usage_pct` = `Math.round(usage_bytes / quota_bytes * 100 * 100) / 100`
- Returns `usage_pct: null` when `quota_bytes` is null
- Non-owner gets 403
- Nonexistent bucket gets 404

**reconcileUsage:**
- After manual drift (DB says 100, S3 ListObjects sums to 200), `assert result.data.actual_bytes === 200 && result.data.delta_bytes === 100`
- After reconcile, `assert getQuota(bucketId).usage_bytes === actual R2 sum`
- Non-owner gets 403

**BucketResponse includes quota fields:**
- `assert getBucket(id).data.quota_bytes === null` for new bucket
- `assert getBucket(id).data.usage_bytes === 0` for new bucket

## Rollout

1. Deploy schema migration (ALTER TABLE runs on first access)
2. All existing buckets get `quota_bytes: null` (unlimited), `usage_bytes: 0`
3. Existing buckets with objects will show `usage_bytes: 0` until reconcile is called — this is acceptable for launch, documented in llms.txt
4. No breaking changes to existing API consumers (new fields are additive)

## Before Closing

- [ ] Run `pnpm -r check` (lint + typecheck + tests pass)
- [ ] Re-read each AC and locate the line of code that enforces it
- [ ] For every boolean condition, verify both True and False paths are covered by tests
- [ ] Verify quota enforcement: null → allow, 0 → reject, positive+within → allow, positive+over → reject
- [ ] Verify Content-Length enforcement: required when quota set, optional when unlimited
- [ ] Verify usage tracking: increment on PUT, decrement on DELETE, overwrite = net delta
- [ ] Verify decrementUsage uses MAX(0, ...) — negative usage is impossible
- [ ] Verify reconcileUsage paginates through all objects (don't stop at first page)
- [ ] Verify BucketResponse now includes quota_bytes and usage_bytes in GET /v1/buckets/:id
