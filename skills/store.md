---
name: store
version: 1.0.0
primitive: store.prim.sh
requires: [wallet]
tools:
  - store_create_bucket
  - store_list_buckets
  - store_get_bucket
  - store_delete_bucket
  - store_put_object
  - store_list_objects
  - store_get_object
  - store_delete_object
  - store_get_quota
  - store_set_quota
  - store_reconcile_quota
---

# store.prim.sh

Object storage for agents. S3-compatible buckets and objects with x402 payment. Stores any binary data — text, JSON, images, archives.

## When to use

Use store when you need to:
- Persist data across agent sessions (search results, reports, configuration)
- Share data between agents (one writes, another reads)
- Cache expensive computation results
- Store files for downstream primitives (e.g. config for a spawned server)
- Implement a simple key-value store using object keys

Do NOT use store for:
- Secret storage (objects are not encrypted at rest beyond what Cloudflare R2 provides)
- Database-style queries (no indexing, no filtering beyond key prefix)
- Real-time messaging (use ring.prim.sh when available)

## Prerequisites

- Registered wallet (`wallet_register`)
- Wallet funded with USDC on Base (`faucet_usdc` on testnet)
- Wallet on access allowlist (private beta — if you get 403 `wallet_not_allowed`, request access at `POST https://gate.prim.sh/v1/access/request`)

## Common workflows

### 1. Create a bucket and store an object

```
1. store_create_bucket
   - name: "agent-data"
   → returns bucket with id (e.g. "b1a2c3d4-...")

2. store_put_object
   - bucket_id: <id from step 1>
   - key: "results/2026-02-26.json"
   - content: <raw bytes or base64>
   - content_type: "application/json"  (optional, recommended)
   → returns {key, size, etag}

3. store_list_objects
   - bucket_id: <id from step 1>
   - prefix: "results/"
   → verify the object appears in the list
```

### 2. Retrieve a stored object

```
1. store_list_buckets
   → find bucket by name in the list

2. store_get_object
   - bucket_id: <id>
   - key: "results/2026-02-26.json"
   → returns raw bytes with Content-Type header
```

### 3. Delete a bucket (must be empty first)

```
1. store_list_objects with bucket_id
   → get all objects

2. store_delete_object for each object

3. store_delete_bucket with bucket_id
   → bucket removed
```

### 4. Check and manage quota

```
1. store_get_quota with bucket_id
   → returns {quota_bytes, usage_bytes, usage_pct}

2. store_set_quota with bucket_id
   - quota_bytes: 52428800  (50 MB)
   → updates quota

3. If usage_bytes seems wrong after bulk deletes:
   store_reconcile_quota with bucket_id
   → recomputes actual usage by scanning R2
```

### 5. Paginate through many objects

```
1. store_list_objects
   - bucket_id: <id>
   - limit: 100
   → check is_truncated; if true, pass next_cursor as cursor in next call

2. Repeat until is_truncated is false
```

## Error handling

- `invalid_request` → Bucket name contains invalid characters (use only alphanumeric, hyphens, underscores) or missing required fields.
- `bucket_name_taken` → Another bucket with that name exists for your wallet. Use a different name or list buckets to find the existing one.
- `bucket_limit_exceeded` (403) → Wallet has reached the 10-bucket limit. Delete unused buckets first with `store_delete_bucket`.
- `quota_exceeded` (413) → Upload would exceed the bucket quota (default 100 MB). Check quota with `store_get_quota`, increase with `store_set_quota`, or delete old objects.
- `storage_limit_exceeded` (413) → Upload would exceed the wallet's total 1 GB limit across all buckets. Delete objects from other buckets.
- `not_found` (404) → Bucket or object does not exist. Verify the bucket_id and key are correct.
- `forbidden` (403) → The bucket belongs to a different wallet. You can only access buckets your wallet owns.
- `r2_error` (502) → Upstream Cloudflare R2 storage error. Retry after a short wait.
- `rate_limited` (429) → Too many requests. Back off and retry.

## Gotchas

- **Content-Length is required for putObject:** Always set the Content-Length header when uploading. Requests without it return 411. The MCP tool handles this automatically.
- **Buckets must be empty to delete:** Call `store_object_list` and delete all objects before `store_bucket_delete`. There is no bulk-delete endpoint.
- **Object listing is cursor-based, bucket listing is page-based:** Objects use `cursor`/`next_cursor`/`is_truncated`. Buckets use `page`/`per_page`/`total`.
- **Slashes in keys are pseudo-directories:** Use keys like `"notes/2026/feb.txt"` to organize objects hierarchically. Filter by prefix: `store_object_list` with `prefix: "notes/"` returns only that subtree.
- **ETag is MD5:** The `etag` field is an MD5 hash of the object content, useful for deduplication checks.
- **Quota reconciliation costs $0.05:** Only call `store_reconcile_quota` when `usage_bytes` is visibly wrong — it does a full R2 scan.
- **Limits (beta):** 10 buckets per wallet, 100 MB default per-bucket quota, 1 GB total per wallet.

## Related primitives

- **wallet** — Required. Your wallet identity determines which buckets you own.
- **spawn** — Use store to persist config files, then deploy them to spawned servers.
- **search** — Use store to cache search results for repeated access without re-paying.
