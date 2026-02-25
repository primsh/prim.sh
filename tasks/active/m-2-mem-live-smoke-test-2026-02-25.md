# M-2: mem.sh Live Smoke Test

**Goal:** Add mem.sh to `scripts/integration-test.ts` — exercise every endpoint (collections, vectors, cache) via x402 payment on Base Sepolia against real Qdrant + Google Embeddings.

**Why:** Unit tests (96) mock all external calls. This verifies the real pipeline: x402 payment → Google embedding API → Qdrant vector storage, end-to-end.

## Prerequisites

- Running Qdrant instance (local Docker or hosted)
- Google API key with Gemini Embedding API access
- Funded test wallet on Base Sepolia (existing from prior integration runs)

## Env Vars (new, added to `scripts/.env.testnet`)

| Var | Required | Notes |
|-----|----------|-------|
| `GOOGLE_API_KEY` | yes | Gemini embedding API |
| `QDRANT_URL` | yes | e.g. `http://localhost:6333` |
| `QDRANT_API_KEY` | no | Only for authenticated Qdrant |
| `MEM_PORT` | no | Default `3006` |

## Changes

### 1. `scripts/integration-test.ts` — add mem.sh section

**Port:** `MEM_PORT` env var, default `3006` (3001–3005 taken by wallet/faucet/store/spawn/token).

**Guard:** Same pattern as spawn/token:
```
HAS_MEM = !!(process.env.GOOGLE_API_KEY && process.env.QDRANT_URL)
```
When false: `console.log("Skipping mem.sh tests — no GOOGLE_API_KEY/QDRANT_URL")`.

**Preflight:** Add `HAS_MEM` warning alongside existing `HAS_DO_TOKEN` / `HAS_TOKEN_DEPLOYER` warnings.

**Service start:** `startService("mem.sh", "packages/mem/src/index.ts", MEM_PORT)` — guarded by `HAS_MEM`.

**Cleanup tracking var:** `let testCollectionId: string | null = null` — added next to `testBucketId`, `testServerId`, etc.

**Test steps** (all via `primFetch` against `MEM_URL`):

| # | Step | Method + Path | Assert |
|---|------|---------------|--------|
| 1 | Create collection | `POST /v1/collections` body: `{ name: "integ-test-{ts}" }` | 201, response has `id`, `name`, `dimension === 768`, `distance === "Cosine"` |
| 2 | List collections | `GET /v1/collections` | 200, response `collections` array includes our collection by `id` |
| 3 | Get collection (pre-upsert) | `GET /v1/collections/:id` | 200, `document_count === 0` (live Qdrant count, empty collection) |
| 4 | Upsert documents | `POST /v1/collections/:id/upsert` body: 3 docs (see below) | 200, `upserted === 3`, `ids.length === 3` |
| 5 | Get collection (post-upsert) | `GET /v1/collections/:id` | 200, `document_count >= 3` |
| 6 | Semantic query | `POST /v1/collections/:id/query` body: `{ text: "machine learning and AI" }` | 200, `matches.length > 0`, `matches[0].score > 0`, `matches[0].text` is the AI doc |
| 7 | Cache set | `PUT /v1/cache/integ-{ts}/testkey` body: `{ value: { agent: "smoke" }, ttl: 300 }` | 200, response has `namespace`, `key`, `value.agent === "smoke"`, `expires_at !== null` |
| 8 | Cache get | `GET /v1/cache/integ-{ts}/testkey` | 200, `value.agent === "smoke"` (JSON round-trip) |
| 9 | Cache delete | `DELETE /v1/cache/integ-{ts}/testkey` | 200, `status === "deleted"` |
| 10 | Cache get (after delete) | `GET /v1/cache/integ-{ts}/testkey` | 404 |
| 11 | Delete collection | `DELETE /v1/collections/:id` | 200, `status === "deleted"`, set `testCollectionId = null` |

**Upsert document corpus** (3 docs, thematically distinct for reliable semantic retrieval):

```json
[
  { "text": "the quick brown fox jumps over the lazy dog", "metadata": { "source": "classic" } },
  { "text": "artificial intelligence is transforming software development and machine learning", "metadata": { "source": "tech" } },
  { "text": "the recipe calls for two cups of flour and one egg", "metadata": { "source": "cooking" } }
]
```

Query `"machine learning and AI"` should surface the tech doc as top match (Gemini cosine similarity). Assert `matches[0].text` contains `"artificial intelligence"`.

**Step 10 — 404 assertion:** The `step()` helper throws on non-2xx, so step 10 must handle the expected 404 differently. Call `primFetch` directly, assert `res.status === 404` without throwing.

**Cleanup in `finally` block:** Add `testCollectionId` cleanup alongside existing bucket/server/key cleanup. Uses `primFetch` to `DELETE /v1/collections/:id`.

### 2. `scripts/.env.testnet` — document new vars

Add comments for `GOOGLE_API_KEY`, `QDRANT_URL`, `QDRANT_API_KEY` (optional), `MEM_PORT`. Do NOT commit actual values.

If there's a `.env.example`, add there too.

## Cost per run

| Operation | Price | Count | Subtotal |
|-----------|-------|-------|----------|
| Create collection | $0.01 | 1 | $0.01 |
| List collections | $0.001 | 1 | $0.001 |
| Get collection | $0.001 | 2 | $0.002 |
| Upsert | $0.001 | 1 | $0.001 |
| Query | $0.001 | 1 | $0.001 |
| Delete collection | $0.01 | 1 | $0.01 |
| Cache set | $0.0001 | 1 | $0.0001 |
| Cache get | $0.0001 | 2 | $0.0002 |
| Cache delete | $0.0001 | 1 | $0.0001 |
| **Total** | | **11 steps** | **~$0.026** |

Plus Google Embedding API cost (~$0.000025 per 1K chars, negligible).

## Decision table: HAS_MEM guard

| GOOGLE_API_KEY set | QDRANT_URL set | Run mem.sh tests? |
|--------------------|----------------|-------------------|
| yes | yes | yes |
| yes | no | no — skip with warning |
| no | yes | no — skip with warning |
| no | no | no — skip with warning |

## Test assertions (exact)

```
// Step 1: Create
assert res.status === 201
assert data.id starts with "c_"
assert data.dimension === 768
assert data.distance === "Cosine"

// Step 3: Get (pre-upsert)
assert data.document_count === 0

// Step 4: Upsert
assert data.upserted === 3
assert data.ids.length === 3

// Step 5: Get (post-upsert)
assert data.document_count >= 3

// Step 6: Query
assert data.matches.length > 0
assert data.matches[0].score > 0
assert data.matches[0].text includes "artificial intelligence"

// Step 7: Cache set
assert data.namespace === "integ-{ts}"
assert data.key === "testkey"
assert data.value.agent === "smoke"
assert data.expires_at !== null

// Step 8: Cache get
assert data.value.agent === "smoke"

// Step 9: Cache delete
assert data.status === "deleted"

// Step 10: Cache get (404)
assert res.status === 404

// Step 11: Delete collection
assert data.status === "deleted"
```

## Inversion-prone logic

**Step 10 (404 check):** This is the one step where non-2xx is *expected*. The `step()` wrapper normally throws on error. Two approaches:
- Option A: Call `primFetch` raw inside `step()`, assert `res.status === 404` manually, don't call `res.json()` on error path
- Option B: Catch the error, verify it's 404-related

Prefer Option A — cleaner, matches existing patterns where `step()` bodies do their own assertions.

**Note:** `primFetch` returns the 404 response (doesn't throw) because 404 is not a 402 payment challenge. Only 402 triggers the x402 retry flow. So raw `primFetch` → check `res.status === 404` works.

## Before closing

- [ ] Run full integration test: `set -a && source scripts/.env.testnet && set +a && bun run scripts/integration-test.ts`
- [ ] All 11 mem.sh steps pass (or skip cleanly if env vars missing)
- [ ] Existing store/spawn/token tests still pass (no regression)
- [ ] Cleanup runs on failure (collection deleted in finally block)
- [ ] Verify `document_count` increments after upsert (live Qdrant, not cached)
- [ ] Verify semantic query returns relevant match (not random)
