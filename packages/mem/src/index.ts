import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createAgentStackMiddleware, createWalletAllowlistChecker, getNetworkConfig } from "@primsh/x402-middleware";

const LLMS_TXT = `# mem.prim.sh — API Reference

> Vector memory and cache for agents. Semantic search collections backed by Qdrant with automatic text embedding, plus a lightweight key-value cache.

Base URL: https://mem.prim.sh
Auth: x402 payment protocol (USDC on Base)
Payment: Every non-free request returns 402 with payment requirements. Sign the payment and resend.

## Quick Start

1. POST /v1/collections with {"name": "my-notes"} → get a collection id
2. POST /v1/collections/{id}/upsert with {"documents": [{"text": "..."}]} → embed and store
3. POST /v1/collections/{id}/query with {"text": "search query"} → find similar documents

## Authentication

All paid endpoints use x402. The flow:
1. Send your request → get 402 response with payment requirements in headers
2. Sign a USDC payment for the specified amount
3. Resend request with X-PAYMENT header containing the signed payment

Free endpoints (no payment required): GET /, GET /llms.txt

## Endpoints

### POST /v1/collections — Create collection ($0.01)

Request body:
  name      string   Collection name, unique per wallet (required)
  distance  string   "Cosine" | "Euclid" | "Dot" (default: Cosine)
  dimension number   Vector dimension (default: 1536)

Response 201: CollectionResponse
  id              string        Collection ID (UUID)
  name            string        Collection name
  owner_wallet    string        Wallet address that created it
  dimension       number        Vector dimension
  distance        string        Distance metric
  document_count  number|null   Live Qdrant count (null in list responses)
  created_at      string        ISO 8601

Error 409: collection_name_taken

### GET /v1/collections — List collections ($0.001)

Query params:
  limit  number  Default 20, max 100
  page   number  Default 1

Response 200: {collections: CollectionResponse[], meta: {page, per_page, total}}
Note: document_count is null in list to avoid N+1 Qdrant calls.

### GET /v1/collections/:id — Get collection ($0.001)

Response 200: CollectionResponse with live document_count

### DELETE /v1/collections/:id — Delete collection ($0.01)

Permanently deletes the collection and all documents. Irreversible.
Response 200: {}

### POST /v1/collections/:id/upsert — Upsert documents ($0.001)

Request body:
  documents  UpsertDocument[]  (required)

UpsertDocument:
  id        string   UUID, auto-generated if omitted
  text      string   Text to embed (required)
  metadata  object   Arbitrary key-value metadata

Response 200:
  upserted  number    Count of documents upserted
  ids       string[]  UUIDs of upserted documents (in input order)

### POST /v1/collections/:id/query — Semantic query ($0.001)

Request body:
  text    string   Query text to embed (required)
  top_k   number   Max results (default 10)
  filter  object   Qdrant-native filter for metadata filtering

Response 200:
  matches  QueryMatch[]

QueryMatch:
  id        string  Document UUID
  score     number  Similarity score (higher = more similar)
  text      string  Stored text
  metadata  object  Stored metadata

Example filter: {"must": [{"key": "source", "match": {"value": "wikipedia"}}]}

### PUT /v1/cache/:namespace/:key — Set cache entry ($0.0001)

Namespace is scoped to the authenticated wallet.

Request body:
  value  any      Any JSON-serializable value (required)
  ttl    number   TTL in seconds. Omit or null for permanent.

Response 200: CacheGetResponse
  namespace   string        Cache namespace
  key         string        Cache key
  value       any           Stored value
  expires_at  string|null   ISO 8601 or null if permanent

### GET /v1/cache/:namespace/:key — Get cache entry ($0.0001)

Response 200: CacheGetResponse
Error 404: entry not found or expired

### DELETE /v1/cache/:namespace/:key — Delete cache entry ($0.0001)

Response 200: {}

## Error Format

All errors return:
  {"error": {"code": "error_code", "message": "Human-readable message"}}

Error codes: not_found, forbidden, invalid_request, qdrant_error, embedding_error, rate_limited, collection_name_taken

## Ownership

All resources are scoped to the wallet address that paid to create them. Your wallet address is extracted from the x402 payment. You can only access collections and cache namespaces you created.
`;

import type {
  ApiError,
  CreateCollectionRequest,
  CollectionResponse,
  CollectionListResponse,
  UpsertRequest,
  UpsertResponse,
  QueryRequest,
  QueryResponse,
  CacheSetRequest,
  CacheGetResponse,
} from "./api.ts";
import {
  createCollection,
  listCollections,
  getCollection,
  deleteCollection,
  upsertDocuments,
  queryDocuments,
  cacheSet,
  cacheGet,
  cacheDelete,
} from "./service.ts";

const networkConfig = getNetworkConfig();
const PAY_TO_ADDRESS = process.env.PRIM_PAY_TO ?? "0x0000000000000000000000000000000000000000";
const NETWORK = networkConfig.network;
const WALLET_INTERNAL_URL = process.env.WALLET_INTERNAL_URL ?? "http://127.0.0.1:3001";
const checkAllowlist = createWalletAllowlistChecker(WALLET_INTERNAL_URL);

const MEM_ROUTES = {
  "POST /v1/collections": "$0.01",
  "GET /v1/collections": "$0.001",
  "GET /v1/collections/[id]": "$0.001",
  "DELETE /v1/collections/[id]": "$0.01",
  "POST /v1/collections/[id]/upsert": "$0.001",
  "POST /v1/collections/[id]/query": "$0.001",
  "PUT /v1/cache/[namespace]/[key]": "$0.0001",
  "GET /v1/cache/[namespace]/[key]": "$0.0001",
  "DELETE /v1/cache/[namespace]/[key]": "$0.0001",
} as const;

// ─── Error helpers ────────────────────────────────────────────────────────

function forbidden(message: string): ApiError {
  return { error: { code: "forbidden", message } };
}

function notFound(message: string): ApiError {
  return { error: { code: "not_found", message } };
}

function invalidRequest(message: string): ApiError {
  return { error: { code: "invalid_request", message } };
}

function backendError(code: string, message: string): ApiError {
  return { error: { code, message } };
}

// ─── App ──────────────────────────────────────────────────────────────────

type AppVariables = { walletAddress: string | undefined };
const app = new Hono<{ Variables: AppVariables }>();

app.use("*", bodyLimit({
  maxSize: 1024 * 1024,
  onError: (c) => c.json({ error: "Request too large" }, 413),
}));

app.use(
  "*",
  createAgentStackMiddleware(
    {
      payTo: PAY_TO_ADDRESS,
      network: NETWORK,
      freeRoutes: ["GET /", "GET /llms.txt"],
      checkAllowlist,
    },
    { ...MEM_ROUTES },
  ),
);

// GET / — llms.txt (free)
app.get("/", (c) => {
  c.header("Content-Type", "text/plain; charset=utf-8");
  return c.body(LLMS_TXT);
});

// GET /llms.txt — machine-readable API reference (free)
app.get("/llms.txt", (c) => {
  c.header("Content-Type", "text/plain; charset=utf-8");
  return c.body(LLMS_TXT);
});

// ─── Collection routes ────────────────────────────────────────────────────

// POST /v1/collections — Create collection
app.post("/v1/collections", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  let body: CreateCollectionRequest;
  try {
    body = await c.req.json<CreateCollectionRequest>();
  } catch {
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await createCollection(body, caller);
  if (!result.ok) {
    if (result.code === "invalid_request") return c.json(invalidRequest(result.message), 400);
    if (result.code === "collection_name_taken") return c.json(backendError(result.code, result.message), 409);
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    return c.json(backendError(result.code, result.message), result.status as 502);
  }
  return c.json(result.data as CollectionResponse, 201);
});

// GET /v1/collections — List collections
app.get("/v1/collections", (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const limit = Math.min(Number(c.req.query("limit")) || 20, 100);
  const page = Math.max(Number(c.req.query("page")) || 1, 1);

  const data = listCollections(caller, limit, page);
  return c.json(data as CollectionListResponse, 200);
});

// GET /v1/collections/:id — Get collection (live document_count)
app.get("/v1/collections/:id", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = await getCollection(c.req.param("id"), caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    return c.json(forbidden(result.message), 403);
  }
  return c.json(result.data as CollectionResponse, 200);
});

// DELETE /v1/collections/:id — Delete collection
app.delete("/v1/collections/:id", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = await deleteCollection(c.req.param("id"), caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    return c.json(backendError(result.code, result.message), result.status as 502);
  }
  return c.json(result.data, 200);
});

// ─── Vector routes ─────────────────────────────────────────────────────────

// POST /v1/collections/:id/upsert — Embed + store documents
app.post("/v1/collections/:id/upsert", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  let body: UpsertRequest;
  try {
    body = await c.req.json<UpsertRequest>();
  } catch {
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await upsertDocuments(c.req.param("id"), body, caller);
  if (!result.ok) {
    if (result.code === "invalid_request") return c.json(invalidRequest(result.message), 400);
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    return c.json(backendError(result.code, result.message), result.status as 502);
  }
  return c.json(result.data as UpsertResponse, 200);
});

// POST /v1/collections/:id/query — Semantic search
app.post("/v1/collections/:id/query", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  let body: QueryRequest;
  try {
    body = await c.req.json<QueryRequest>();
  } catch {
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await queryDocuments(c.req.param("id"), body, caller);
  if (!result.ok) {
    if (result.code === "invalid_request") return c.json(invalidRequest(result.message), 400);
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    return c.json(backendError(result.code, result.message), result.status as 502);
  }
  return c.json(result.data as QueryResponse, 200);
});

// ─── Cache routes ──────────────────────────────────────────────────────────

// PUT /v1/cache/:namespace/:key — Set cache entry
app.put("/v1/cache/:namespace/:key", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  let body: CacheSetRequest;
  try {
    body = await c.req.json<CacheSetRequest>();
  } catch {
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = cacheSet(c.req.param("namespace"), c.req.param("key"), body, caller);
  if (!result.ok) {
    return c.json(invalidRequest(result.message), 400);
  }
  return c.json(result.data as CacheGetResponse, 200);
});

// GET /v1/cache/:namespace/:key — Get cache entry
app.get("/v1/cache/:namespace/:key", (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = cacheGet(c.req.param("namespace"), c.req.param("key"), caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    return c.json(forbidden(result.message), 403);
  }
  return c.json(result.data as CacheGetResponse, 200);
});

// DELETE /v1/cache/:namespace/:key — Delete cache entry
app.delete("/v1/cache/:namespace/:key", (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = cacheDelete(c.req.param("namespace"), c.req.param("key"), caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    return c.json(forbidden(result.message), 403);
  }
  return c.json(result.data, 200);
});

export default app;
