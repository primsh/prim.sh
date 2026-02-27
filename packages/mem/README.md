# mem.sh

> Vector store and cache for agents. Persist long-term knowledge and session state.

Part of the [prim.sh](https://prim.sh) agent-native stack. x402 payment (USDC on Base) is the sole auth — no signup, no GUI, no KYC.

## Routes

| Route | Description | Price | Request | Response |
|-------|-------------|-------|---------|----------|
| `POST /v1/collections` | Create a vector collection | $0.01 | `CreateCollectionRequest` | `CollectionResponse` |
| `GET /v1/collections` | List collections owned by the calling wallet (paginated). document_count is null — use GET :id. | $0.001 | `—` | `CollectionListResponse` |
| `GET /v1/collections/:id` | Get collection with live document_count from Qdrant | $0.001 | `—` | `CollectionResponse` |
| `DELETE /v1/collections/:id` | Delete collection and all documents. Irreversible. | $0.01 | `—` | `—` |
| `POST /v1/collections/:id/upsert` | Embed and store documents. Each document: {id?, text, metadata?}. Existing IDs are replaced. | $0.001 | `UpsertRequest` | `UpsertResponse` |
| `POST /v1/collections/:id/query` | Semantic search. Fields: text (required), top_k, filter (Qdrant native format). | $0.001 | `QueryRequest` | `QueryResponse` |
| `PUT /v1/cache/:namespace/:key` | Store a value in the KV cache. Optional ttl in seconds for expiry. | $0.0001 | `CacheSetRequest` | `—` |
| `GET /v1/cache/:namespace/:key` | Retrieve a cache value. Returns 404 if missing or expired. | $0.0001 | `—` | `CacheGetResponse` |
| `DELETE /v1/cache/:namespace/:key` | Delete a cache entry | $0.0001 | `—` | `—` |

## Pricing

| Operation | Price | Notes |
|-----------|-------|-------|
| Create collection | $0.01 |  |
| Upsert (embed) | $0.001 | Per 1k tokens |
| Query | $0.001 | Per search |
| KV cache | $0.0001 | Per operation |

## Request / Response Types

### `CreateCollectionRequest`

| Field | Type | Required |
|-------|------|----------|
| `name` | `string` | required |
| `distance` | `"Cosine" | "Euclid" | "Dot"` | optional |
| `dimension` | `number` | optional |

### `CollectionResponse`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Collection ID (UUID). |
| `name` | `string` | Collection name. Unique per wallet. |
| `owner_wallet` | `string` | Ethereum address of the collection owner. |
| `dimension` | `number` | Embedding vector dimension (e.g. 1536 for text-embedding-3-small). |
| `distance` | `string` | Distance metric: "Cosine" | "Euclid" | "Dot". |
| `document_count` | `number | null` | Live Qdrant points_count — null in list responses to avoid N+1 calls. |
| `created_at` | `string` | ISO 8601 timestamp when the collection was created. |

### `UpsertRequest`

| Field | Type | Required |
|-------|------|----------|
| `documents` | `UpsertDocument[]` | required |

### `UpsertResponse`

| Field | Type | Description |
|-------|------|-------------|
| `upserted` | `number` | Number of documents upserted. |
| `ids` | `string[]` | IDs of upserted documents (auto-generated UUIDs if not provided). |

### `QueryRequest`

| Field | Type | Required |
|-------|------|----------|
| `text` | `string` | required |
| `top_k` | `number` | optional |
| `filter` | `unknown` | optional |

### `QueryResponse`

| Field | Type | Description |
|-------|------|-------------|
| `matches` | `QueryMatch[]` | Nearest neighbor matches, ordered by descending score. |

### `CacheSetRequest`

| Field | Type | Required |
|-------|------|----------|
| `value` | `unknown` | required |
| `ttl` | `number | null` | optional |

### `CacheGetResponse`

| Field | Type | Description |
|-------|------|-------------|
| `namespace` | `string` | Cache namespace (collection name). |
| `key` | `string` | Cache key. |
| `value` | `unknown` | Stored value. |
| `expires_at` | `string | null` | ISO string expiry time, or null if permanent. |

## Providers

| Provider | Status | Default |
|----------|--------|---------|
| [qdrant](https://qdrant.tech/) | active | yes |

## Usage

```bash
# Install
curl -fsSL https://mem.prim.sh/install.sh | sh

# Example request
curl -X POST https://mem.prim.sh/v1/collections \
  -H "X-402-Payment: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Environment

- `PRIM_PAY_TO`
- `PRIM_NETWORK`
- `QDRANT_URL`
- `GOOGLE_API_KEY`
- `WALLET_INTERNAL_URL`

## Development

```bash
pnpm install
pnpm dev           # run locally (port 3008)
pnpm check         # lint + typecheck + test
pnpm test          # tests only
pnpm typecheck     # typecheck only
```

## x402 Payment

Every paid endpoint requires an x402 payment header (USDC on Base). Use the [x402 client](https://github.com/coinbase/x402) or prim's wallet.sh to pay.

## License

Apache-2.0
