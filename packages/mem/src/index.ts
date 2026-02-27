import { resolve } from "node:path";
import {
  createAgentStackMiddleware,
  createWalletAllowlistChecker,
  forbidden,
  notFound,
  invalidRequest,
} from "@primsh/x402-middleware";
import type { ApiError } from "@primsh/x402-middleware";
import { createPrimApp } from "@primsh/x402-middleware/create-prim-app";
import type {
  CreateCollectionRequest,
  CollectionResponse,
  CollectionListResponse,
  UpsertRequest,
  UpsertResponse,
  QueryRequest,
  QueryResponse,
  SetCacheRequest,
  GetCacheResponse,
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

function backendError(code: string, message: string): ApiError {
  return { error: { code, message } };
}

// ─── App ──────────────────────────────────────────────────────────────────

const app = createPrimApp(
  {
    serviceName: "mem.sh",
    llmsTxtPath: import.meta.dir ? resolve(import.meta.dir, "../../../site/mem/llms.txt") : undefined,
    routes: MEM_ROUTES,
    metricsName: "mem.prim.sh",
  },
  { createAgentStackMiddleware, createWalletAllowlistChecker },
);

const logger = (app as typeof app & { logger: { warn: (msg: string, extra?: Record<string, unknown>) => void } }).logger;

// ─── Collection routes ────────────────────────────────────────────────────

// POST /v1/collections — Create collection
app.post("/v1/collections", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  let body: CreateCollectionRequest;
  try {
    body = await c.req.json<CreateCollectionRequest>();
  } catch (err) {
    logger.warn("JSON parse failed on POST /v1/collections", { error: String(err) });
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
  } catch (err) {
    logger.warn("JSON parse failed on POST /v1/collections/:id/upsert", { error: String(err) });
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
  } catch (err) {
    logger.warn("JSON parse failed on POST /v1/collections/:id/query", { error: String(err) });
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

  let body: SetCacheRequest;
  try {
    body = await c.req.json<SetCacheRequest>();
  } catch (err) {
    logger.warn("JSON parse failed on PUT /v1/cache/:namespace/:key", { error: String(err) });
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = cacheSet(c.req.param("namespace"), c.req.param("key"), body, caller);
  if (!result.ok) {
    return c.json(invalidRequest(result.message), 400);
  }
  return c.json(result.data as GetCacheResponse, 200);
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
  return c.json(result.data as GetCacheResponse, 200);
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
