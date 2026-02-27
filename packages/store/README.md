# store.sh

> Object storage. Persist artifacts across ephemeral VMs. S3-compatible.

Part of the [prim.sh](https://prim.sh) agent-native stack. x402 payment (USDC on Base) is the sole auth — no signup, no GUI, no KYC.

## Routes

| Route | Description | Price | Request | Response |
|-------|-------------|-------|---------|----------|
| `POST /v1/buckets` | Create a new storage bucket | $0.05 | `CreateBucketRequest` | `CreateBucketResponse` |
| `GET /v1/buckets` | List all buckets owned by the calling wallet | $0.001 | `—` | `BucketListResponse` |
| `GET /v1/buckets/:id` | Get details for a single bucket. Caller must own the bucket. | $0.001 | `—` | `BucketResponse` |
| `DELETE /v1/buckets/:id` | Delete a bucket. Bucket must be empty first. | $0.01 | `—` | `—` |
| `PUT /v1/buckets/:id/objects/:key` | Upload an object. Key may include slashes. Content-Length header required. | $0.001 | `—` | `PutObjectResponse` |
| `GET /v1/buckets/:id/objects` | List objects in a bucket. Cursor-based pagination. | $0.001 | `—` | `ObjectListResponse` |
| `GET /v1/buckets/:id/objects/:key` | Download an object. Response body is streamed directly. | $0.001 | `—` | `Raw bytes (application/octet-stream)` |
| `DELETE /v1/buckets/:id/objects/:key` | Delete an object from a bucket | $0.001 | `—` | `DeleteObjectResponse` |
| `GET /v1/buckets/:id/quota` | Get quota and usage for a bucket | $0.001 | `—` | `QuotaResponse` |
| `PUT /v1/buckets/:id/quota` | Set the storage quota for a bucket. Pass null to reset to default (100 MB). | $0.01 | `SetQuotaRequest` | `QuotaResponse` |
| `POST /v1/buckets/:id/quota/reconcile` | Recompute bucket usage by scanning actual R2 storage. Use when usage_bytes appears incorrect. | $0.05 | `—` | `ReconcileResponse` |

## Pricing

| Operation | Price | Notes |
|-----------|-------|-------|
| Storage | $0.02/GB/mo | Prorated daily |
| Upload | free | Up to 5GB per object |
| Download | $0.01/GB | CDN edge delivery |
| API calls | $0.001/call | PUT, GET, LIST, DELETE |

## Request / Response Types

### `CreateBucketRequest`

| Field | Type | Required |
|-------|------|----------|
| `name` | `string` | required |
| `location` | `string` | optional |

### `CreateBucketResponse`

| Field | Type | Description |
|-------|------|-------------|
| `bucket` | `BucketResponse` | The created bucket. |

### `BucketResponse`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Bucket ID (UUID). |
| `name` | `string` | Bucket name. Unique per wallet. Alphanumeric, hyphens, underscores. |
| `location` | `string | null` | Storage region (e.g. "us-east-1"). Null = default region. |
| `owner_wallet` | `string` | Ethereum address of the bucket owner. |
| `quota_bytes` | `number | null` | Per-bucket quota in bytes. Null = default (100 MB). |
| `usage_bytes` | `number` | Current storage usage in bytes. |
| `created_at` | `string` | ISO 8601 timestamp when the bucket was created. |

### `PutObjectResponse`

| Field | Type | Description |
|-------|------|-------------|
| `key` | `string` | Object key as stored. |
| `size` | `number` | Object size in bytes. |
| `etag` | `string` | ETag (MD5 hash). |

### `DeleteObjectResponse`

| Field | Type | Description |
|-------|------|-------------|
| `status` | `"deleted"` | Always "deleted" on success. |

### `QuotaResponse`

| Field | Type | Description |
|-------|------|-------------|
| `bucket_id` | `string` | Bucket ID. |
| `quota_bytes` | `number | null` | Per-bucket quota in bytes. Null = default (100 MB). |
| `usage_bytes` | `number` | Current storage usage in bytes. |
| `usage_pct` | `number | null` | Usage as a percentage (0-100). Null if quota_bytes is null. |

### `SetQuotaRequest`

| Field | Type | Required |
|-------|------|----------|
| `quota_bytes` | `number | null` | required |

### `ReconcileResponse`

| Field | Type | Description |
|-------|------|-------------|
| `bucket_id` | `string` | Bucket ID. |
| `previous_bytes` | `number` | Storage usage recorded before reconciliation, in bytes. |
| `actual_bytes` | `number` | Actual storage usage recomputed from R2, in bytes. |
| `delta_bytes` | `number` | Difference (actual - previous). Negative means recorded was overstated. |

## Providers

| Provider | Status | Default |
|----------|--------|---------|
| [cloudflare-r2](https://developers.cloudflare.com/r2/) | active | yes |

## Usage

```bash
# Install
curl -fsSL https://store.prim.sh/install.sh | sh

# Example request
curl -X POST https://store.prim.sh/v1/buckets \
  -H "X-402-Payment: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Environment

- `PRIM_PAY_TO`
- `PRIM_NETWORK`
- `CLOUDFLARE_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `WALLET_INTERNAL_URL`

## Development

```bash
pnpm install
pnpm dev           # run locally (port 3002)
pnpm check         # lint + typecheck + test
pnpm test          # tests only
pnpm typecheck     # typecheck only
```

## x402 Payment

Every paid endpoint requires an x402 payment header (USDC on Base). Use the [x402 client](https://github.com/coinbase/x402) or prim's wallet.sh to pay.

## License

Apache-2.0
