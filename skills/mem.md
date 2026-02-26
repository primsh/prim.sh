---
name: mem
version: 1.0.0
primitive: mem.prim.sh
requires: [wallet]
tools:
  - mem_collection_create
  - mem_collection_list
  - mem_collection_get
  - mem_collection_delete
  - mem_upsert
  - mem_query
  - mem_cache_put
  - mem_cache_get
  - mem_cache_delete
---

# mem.prim.sh

Vector memory and cache for agents. Semantic search collections backed by Qdrant with automatic text embedding. Lightweight key-value cache for fast ephemeral storage.

## When to use

Use mem when you need to:
- Store and semantically search unstructured text (research notes, document chunks, conversation history)
- Find related content by meaning rather than exact match (RAG, similarity search)
- Cache values within or across agent sessions with optional TTL
- Share semantic memory between agents (one upserts, another queries the same collection)

Do NOT use mem for:
- Exact-match key-value lookups when you know the key (use cache, or store.prim.sh objects)
- Binary or structured data storage (use store.prim.sh)
- Real-time event streaming (use pipe.prim.sh when available)

## Prerequisites

- Registered wallet (`wallet_register`)
- Wallet funded with USDC on Base (`faucet_usdc` on testnet)

## Common workflows

### 1. Create collection, upsert documents, query

```
1. mem_collection_create
   - name: "research-notes"
   → returns collection with id

2. mem_upsert
   - collection_id: <id from step 1>
   - documents: [
       {text: "Transformer models use self-attention mechanisms.", metadata: {source: "paper-A"}},
       {text: "GPT-4 was released in March 2023.", metadata: {source: "blog"}}
     ]
   → returns {upserted: 2, ids: [...]}

3. mem_query
   - collection_id: <id from step 1>
   - text: "How does self-attention work?"
   - top_k: 3
   → returns matches sorted by similarity score
```

### 2. Cache put and get

```
1. mem_cache_put
   - namespace: "agent-state"
   - key: "last-search"
   - value: {"query": "attention mechanisms", "result_ids": ["..."]}
   - ttl: 3600  (1 hour, or omit for permanent)
   → returns {namespace, key, value, expires_at}

2. mem_cache_get
   - namespace: "agent-state"
   - key: "last-search"
   → returns the stored value
```

### 3. List and manage collections

```
1. mem_collection_list
   → find collection by name; note: document_count is null in list

2. mem_collection_get with id
   → get live document_count from Qdrant

3. mem_collection_delete with id
   → permanently removes collection and all documents
```

### 4. Metadata filtering in queries

```
mem_query
  - collection_id: <id>
  - text: "attention mechanisms"
  - top_k: 5
  - filter: {"must": [{"key": "source", "match": {"value": "paper-A"}}]}
→ only returns matches where metadata.source == "paper-A"
```

## Error handling

- `collection_name_taken` (409) → A collection with that name already exists for your wallet. List collections to find the existing one or choose a different name.
- `invalid_request` (400) → Missing required fields or malformed JSON body.
- `not_found` (404) → Collection or cache entry does not exist. Verify the ID/namespace/key.
- `forbidden` (403) → The collection or namespace belongs to a different wallet.
- `qdrant_error` (502) → Upstream Qdrant error. Retry after a short wait.
- `embedding_error` (502) → Embedding model failed to process the text. Check that the text is non-empty and not excessively long.
- `rate_limited` (429) → Too many requests. Back off and retry.

## Gotchas

- **document_count is null in list responses:** `mem_collection_list` omits live counts to avoid N+1 Qdrant calls. Use `mem_collection_get` to get the live count for a specific collection.
- **Upsert by ID is replace, not merge:** If you provide a document ID that already exists, the entire document (text + metadata + vector) is replaced.
- **Auto-generated IDs:** If you omit `id` in a document, the returned `ids` array contains the auto-generated UUIDs in input order — save these if you need to reference the documents later.
- **Cache namespaces are wallet-scoped:** Two different wallets can use the same namespace+key without conflict. Your cache is private to your wallet.
- **Expired cache entries return 404:** After TTL expiry, `mem_cache_get` behaves identically to a missing entry.
- **Collection deletion is permanent:** All vectors and metadata are dropped from Qdrant. There is no recovery.
- **Qdrant filter syntax:** The `filter` field in `mem_query` is passed directly to Qdrant. See Qdrant filter docs for the full schema. Common pattern: `{"must": [{"key": "field", "match": {"value": "..."}}]}`.

## Related primitives

- **wallet** — Required. Your wallet identity determines which collections and cache namespaces you own.
- **store** — Use for binary or large structured data. mem is for text embeddings and cache.
- **infer** — Use infer.prim.sh to generate text, then upsert the results into mem for later retrieval.
