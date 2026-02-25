# M-1: Build mem.sh — Vector Memory + KV Cache

## Context

mem.sh is the agent memory primitive. Agents send text, mem.sh embeds it, stores vectors in Qdrant, and returns semantic search results. A KV cache layer in SQLite handles ephemeral session state. Everything gated by x402.

**Backend**: Qdrant (HTTP API, self-hosted)
**Embeddings**: Provider-agnostic interface; ship with Google `gemini-embedding-001` (free tier). Prim absorbs embedding cost.
**Scope**: Full spec — collections + upsert + query + KV cache + x402

## Package Structure

```
packages/mem/
├── src/
│   ├── index.ts          # Hono routes + x402 middleware
│   ├── service.ts         # Business logic (ServiceResult pattern)
│   ├── db.ts              # SQLite: collection metadata + cache entries
│   ├── api.ts             # Types (requests, responses, error codes)
│   ├── qdrant.ts          # Qdrant REST client (thin fetch wrapper)
│   ├── embeddings.ts      # EmbeddingProvider interface + Google impl
│   └── __mocks__/bun-sqlite.ts  # Copy from packages/store/
├── test/mem.test.ts
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## Dependency Direction

```
index.ts  →  service.ts  →  db.ts (leaf)
                          →  qdrant.ts (leaf)
                          →  embeddings.ts (leaf)
index.ts  →  api.ts (types only)
index.ts  →  @agentstack/x402-middleware
```

No circular deps. `db.ts`, `qdrant.ts`, `embeddings.ts` are independent leaves.

## Routes + Pricing

```
GET  /                              free    health check
POST /v1/collections                $0.01   create collection
GET  /v1/collections                $0.001  list collections
GET  /v1/collections/:id            $0.001  get collection
DELETE /v1/collections/:id          $0.01   delete collection
POST /v1/collections/:id/upsert    $0.001  embed text → store vectors
POST /v1/collections/:id/query     $0.001  semantic search
PUT  /v1/cache/:namespace/:key      $0.0001 set cache key (body: { value, ttl? })
GET  /v1/cache/:namespace/:key      $0.0001 get cache key
DELETE /v1/cache/:namespace/:key    $0.0001 delete cache key
```

Note: query uses POST (body contains text + filter + top_k). The llms.txt says GET — update it later.

## File Specs

### api.ts — Types

Error codes: `not_found | forbidden | invalid_request | qdrant_error | embedding_error | rate_limited | collection_name_taken`

Key types:
- `CreateCollectionRequest`: `{ name, distance?: "Cosine"|"Euclid"|"Dot", dimension?: number }`
- `CollectionResponse`: `{ id, name, owner_wallet, dimension, distance, document_count, created_at }`
  - `document_count`: included in single-get (live Qdrant `points_count` call), `null` in list responses (avoids N+1 Qdrant calls)
- `UpsertDocument`: `{ id?, text, metadata? }` — `id` must be UUID v4 string if provided; non-UUID values rejected with `invalid_request`
- `UpsertRequest`: `{ documents: UpsertDocument[] }` — always array
- `UpsertResponse`: `{ upserted, ids }`
- `QueryRequest`: `{ text, top_k?, filter? }` — filter is Qdrant-native passthrough
- `QueryMatch`: `{ id, score, text, metadata }`
- `QueryResponse`: `{ matches: QueryMatch[] }`
- `CacheSetRequest`: `{ value, ttl? }` — namespace + key from path params, ttl in seconds
- `CacheGetResponse`: `{ namespace, key, value, expires_at }`

### qdrant.ts — Qdrant HTTP Client

Env: `QDRANT_URL` (default `http://localhost:6333`), `QDRANT_API_KEY` (optional).

**Minimum Qdrant version: 1.10+** (uses unified `/points/query` endpoint, not legacy `/points/search`).

Functions (all thin `fetch` wrappers):
- `createCollection(name, { size, distance })` — `PUT /collections/{name}` body: `{ "vectors": { "size": 768, "distance": "Cosine" } }`
- `deleteCollection(name)` — `DELETE /collections/{name}`
- `getCollectionInfo(name)` — `GET /collections/{name}`, returns `result.points_count`
- `upsertPoints(collection, points[])` — `PUT /collections/{name}/points` body: `{ "points": [{ "id": "uuid", "vector": [...], "payload": {...} }] }`
- `queryPoints(collection, vector, limit, filter?)` — `POST /collections/{name}/points/query` body:
  ```json
  {
    "query": [0.1, 0.2, ...],
    "limit": 10,
    "filter": { "must": [{ "key": "source", "match": { "value": "chat" } }] },
    "with_payload": true
  }
  ```
  Response: `{ "status": "ok", "result": { "points": [{ "id": "uuid", "score": 0.95, "payload": {...} }] } }`

`QdrantError` class with status code mapping:
| Qdrant HTTP | Mapped code |
|---|---|
| 404 | not_found |
| 409 | collection_name_taken |
| 400/422 | invalid_request |
| 429 | rate_limited |
| other | qdrant_error |

### embeddings.ts — Embedding Provider

Interface:
```
EmbeddingProvider {
  embedDocuments(texts: string[]): Promise<number[][]>
  embedQuery(text: string): Promise<number[]>
  dimensions: number
  model: string
}
```

`GoogleEmbeddingProvider`:
- Env: `GOOGLE_API_KEY` (required), `EMBEDDING_MODEL` (default `gemini-embedding-001`), `EMBEDDING_DIMENSIONS` (default 768)
- Endpoint: `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:batchEmbedContents?key={key}`
- `embedDocuments` uses `taskType: "RETRIEVAL_DOCUMENT"`
- `embedQuery` uses `taskType: "RETRIEVAL_QUERY"`
- Request body:
  ```json
  {
    "requests": [
      {
        "model": "models/gemini-embedding-001",
        "content": { "parts": [{ "text": "document text here" }] },
        "taskType": "RETRIEVAL_DOCUMENT",
        "outputDimensionality": 768
      }
    ]
  }
  ```
- Response: `{ "embeddings": [{ "values": [0.1, 0.2, ...] }] }` — extract `embeddings[i].values`

**Singleton pattern**: module-level `let _provider: EmbeddingProvider | null = null`. `getEmbeddingProvider()` creates on first call. `resetEmbeddingProvider()` sets to null (required for test isolation — called in `beforeEach`).

Factory: `getEmbeddingProvider()` reads `EMBEDDING_PROVIDER` env (default "google").

### db.ts — SQLite

Env: `MEM_DB_PATH` (default `./mem.db`). Singleton `getDb()` / `resetDb()`.

Tables:
```sql
collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_wallet TEXT NOT NULL,
  qdrant_collection TEXT NOT NULL UNIQUE,
  dimension INTEGER NOT NULL DEFAULT 768,
  distance TEXT NOT NULL DEFAULT 'Cosine',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)
-- UNIQUE INDEX on (owner_wallet, name)

cache_entries (
  namespace TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,           -- JSON blob
  owner_wallet TEXT NOT NULL,
  expires_at INTEGER,            -- epoch ms, NULL = permanent
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (owner_wallet, namespace, key)
)
```

Query functions follow store.sh patterns exactly (parameterized queries, typed returns).

### service.ts — Business Logic

`ServiceResult<T>` pattern, `checkCollectionOwnership()` pattern — identical to store.sh.

**Qdrant collection naming**: `sha256(wallet)[0:8]_collectionName` to isolate wallets.

**Collection CRUD**: create (validate name → Qdrant create → SQLite insert), list (paginated from SQLite), get (ownership check + Qdrant info for doc count), delete (ownership check → Qdrant delete → SQLite delete).

**Upsert**: ownership check → validate IDs (must be UUID v4 if provided, reject non-UUID with `invalid_request`) → extract texts → `embedDocuments(texts)` → build Qdrant points `{ id, vector, payload: { text, ...metadata } }` → `upsertPoints()`. Auto-generate `crypto.randomUUID()` if no id. Max 100 docs per call. Reserved `text` key in payload.

**Query**: ownership check → `embedQuery(text)` → `queryPoints()` → map results. Default `top_k=10`, max 100. Filter passthrough to Qdrant.

**Cache set** (`cacheSet(namespace, key, request, callerWallet)`): validate namespace (1-128 alphanum+hyphens+underscores) + key (1-512 chars) → compute `expires_at` from ttl (`Date.now() + ttl * 1000`, or null if no ttl) → `INSERT OR REPLACE` → after insert, with ~10% probability (`Math.random() < 0.1`), run `DELETE FROM cache_entries WHERE expires_at IS NOT NULL AND expires_at < ?` with `Date.now()`.

**Cache get**: query → if not found, 404 → if found and `expires_at !== null && expires_at < Date.now()`, delete the row and return 404 → otherwise return value (`JSON.parse`).

Decision table for cache TTL:
```
exists | expires_at null | now < expires_at | result
-------|-----------------|------------------|-------
false  | -               | -                | 404
true   | true            | -                | return value
true   | false           | true             | return value
true   | false           | false            | delete + 404
```

### index.ts — Routes

Standard Hono wiring. `createAgentStackMiddleware(...)` with `MEM_ROUTES` pricing. Each handler: extract `walletAddress` → call service → map `ServiceResult` to HTTP. Error helpers: `forbidden()`, `notFound()`, `invalidRequest()`, `backendError()`.

Route pricing map keys (must match x402-middleware bracket syntax):
```
"POST /v1/collections": "$0.01"
"GET /v1/collections": "$0.001"
"GET /v1/collections/[id]": "$0.001"
"DELETE /v1/collections/[id]": "$0.01"
"POST /v1/collections/[id]/upsert": "$0.001"
"POST /v1/collections/[id]/query": "$0.001"
"PUT /v1/cache/[namespace]/[key]": "$0.0001"
"GET /v1/cache/[namespace]/[key]": "$0.0001"
"DELETE /v1/cache/[namespace]/[key]": "$0.0001"
```

## Env Variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `MEM_DB_PATH` | No | `./mem.db` | SQLite path |
| `QDRANT_URL` | No | `http://localhost:6333` | Qdrant server |
| `QDRANT_API_KEY` | No | — | Qdrant auth |
| `GOOGLE_API_KEY` | Yes | — | Embedding API |
| `EMBEDDING_PROVIDER` | No | `google` | Provider selector |
| `EMBEDDING_MODEL` | No | `gemini-embedding-001` | Model name |
| `EMBEDDING_DIMENSIONS` | No | `768` | Output dimensions |
| `PRIM_PAY_TO` | No | `0x000...` | Payment recipient |
| `PRIM_NETWORK` | No | `eip155:8453` | Chain |

## Dependencies

Runtime: `hono`, `@agentstack/x402-middleware` (workspace). No other deps — Qdrant and Google APIs accessed via `fetch` (Bun built-in). No Qdrant SDK, no Google SDK.

Dev: `@x402/core`, `typescript`, `vitest` (same as all other primitives).

## Phases

1. **Scaffold**: package.json, tsconfig, vitest.config, bun-sqlite mock, api.ts
2. **External clients**: qdrant.ts + embeddings.ts (independent leaves)
3. **Database**: db.ts (collections + cache tables, query functions)
4. **Service**: service.ts (all business logic, depends on 1-3)
5. **Routes**: index.ts (thin Hono layer, depends on 4)

## Test Strategy (~85 tests)

Mock `fetch` via `vi.stubGlobal` for both Qdrant and Google APIs. Test service layer directly (not HTTP). Call `resetDb()` + `resetEmbeddingProvider()` in `beforeEach`.

- Collection name validation (~8)
- Collection CRUD + ownership (~12)
- Upsert: single, batch, with/without id, invalid id (non-UUID), metadata, limits, errors (~14)
- Query: matches, top_k, filter, error mapping (~10)
- Cache set/get/delete (~10): basic CRUD, overwrite, JSON round-trip
- Cache TTL (~10): set with TTL, get before expiry, get after expiry (delete + 404), null TTL (permanent), boundary (expires_at == now), opportunistic cleanup fires
- Cache namespace isolation (~5): same key different namespace, same key different wallet, cross-wallet invisible
- Qdrant error mapping (~5)
- Embedding error handling (~3): 429, 401, malformed response
- document_count (~3): present in single-get, null in list, Qdrant info error handling

## Reference Files

- `packages/store/src/service.ts` — ServiceResult, ownership, row mappers
- `packages/store/src/db.ts` — getDb/resetDb, bun:sqlite, INTEGER timestamps
- `packages/store/src/cloudflare.ts` — external API client pattern
- `packages/store/test/store.test.ts` — env-before-imports, mockFetch
- `packages/store/src/index.ts` — route wiring, x402 setup, error helpers

## Before Closing

- [ ] `pnpm -C packages/mem check` passes
- [ ] Wallet ownership checked before every operation
- [ ] Qdrant collection names prefixed (not raw user input)
- [ ] Cache lazy cleanup triggers on read path
- [ ] Both TTL true/false paths tested
- [ ] `resetDb()` + `resetEmbeddingProvider()` called in beforeEach
- [ ] Mock fetch covers all Qdrant + Google endpoints
- [ ] UpsertDocument.id validated as UUID v4 (non-UUID rejected)
- [ ] document_count: live in single-get, null in list
- [ ] Cache routes use consistent path params (PUT/GET/DELETE /v1/cache/:namespace/:key)
