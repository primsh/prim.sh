import { resolve } from "node:path";
import {
  createAgentStackMiddleware,
  createWalletAllowlistChecker,
  forbidden,
  invalidRequest,
  notFound,
  parseJsonBody,
  requireCaller,
} from "@primsh/x402-middleware";
import type { ApiError, PaginatedList } from "@primsh/x402-middleware";
import { createPrimApp } from "@primsh/x402-middleware/create-prim-app";
import type {
  CollectionResponse,
  CreateCollectionRequest,
  GetCacheResponse,
  QueryRequest,
  QueryResponse,
  SetCacheRequest,
  UpsertRequest,
  UpsertResponse,
} from "./api.ts";
import {
  cacheDelete,
  cacheGet,
  cacheSet,
  createCollection,
  deleteCollection,
  getCollection,
  listCollections,
  queryDocuments,
  upsertDocuments,
} from "./service.ts";

const MEM_ROUTES = {
  "POST /v1/collections": "$0.001",
  "GET /v1/collections": "$0.001",
  "GET /v1/collections/[id]": "$0.001",
  "DELETE /v1/collections/[id]": "$0.001",
  "POST /v1/collections/[id]/upsert": "$0.0001",
  "POST /v1/collections/[id]/query": "$0.0001",
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
    llmsTxtPath: import.meta.dir
      ? resolve(import.meta.dir, "../../../site/mem/llms.txt")
      : undefined,
    routes: MEM_ROUTES,
    metricsName: "mem.prim.sh",
  },
  { createAgentStackMiddleware, createWalletAllowlistChecker },
);

const logger = app.logger;

// ─── Collection routes ────────────────────────────────────────────────────

// POST /v1/collections — Create collection
app.post("/v1/collections", async (c) => {
  const callerOrRes = requireCaller(c);
  if (callerOrRes instanceof Response) return callerOrRes;
  const caller = callerOrRes;

  const bodyOrRes = await parseJsonBody<CreateCollectionRequest>(c, logger, "POST /v1/collections");
  if (bodyOrRes instanceof Response) return bodyOrRes;
  const body = bodyOrRes;

  const result = await createCollection(body, caller);
  if (!result.ok) {
    if (result.code === "invalid_request") return c.json(invalidRequest(result.message), 400);
    if (result.code === "collection_name_taken")
      return c.json(backendError(result.code, result.message), 409);
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    return c.json(backendError(result.code, result.message), result.status as 502);
  }
  return c.json(result.data as CollectionResponse, 201);
});

// GET /v1/collections — List collections
app.get("/v1/collections", (c) => {
  const callerOrRes = requireCaller(c);
  if (callerOrRes instanceof Response) return callerOrRes;
  const caller = callerOrRes;

  const limit = Math.min(Number(c.req.query("limit")) || 20, 100);
  const page = Math.max(Number(c.req.query("page")) || 1, 1);

  const data = listCollections(caller, limit, page);
  return c.json(data as PaginatedList<CollectionResponse>, 200);
});

// GET /v1/collections/:id — Get collection (live document_count)
app.get("/v1/collections/:id", async (c) => {
  const callerOrRes = requireCaller(c);
  if (callerOrRes instanceof Response) return callerOrRes;
  const caller = callerOrRes;

  const result = await getCollection(c.req.param("id"), caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    return c.json(forbidden(result.message), 403);
  }
  return c.json(result.data as CollectionResponse, 200);
});

// DELETE /v1/collections/:id — Delete collection
app.delete("/v1/collections/:id", async (c) => {
  const callerOrRes = requireCaller(c);
  if (callerOrRes instanceof Response) return callerOrRes;
  const caller = callerOrRes;

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
  const callerOrRes = requireCaller(c);
  if (callerOrRes instanceof Response) return callerOrRes;
  const caller = callerOrRes;

  const bodyOrRes = await parseJsonBody<UpsertRequest>(c, logger, "POST /v1/collections/:id/upsert");
  if (bodyOrRes instanceof Response) return bodyOrRes;
  const body = bodyOrRes;

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
  const callerOrRes = requireCaller(c);
  if (callerOrRes instanceof Response) return callerOrRes;
  const caller = callerOrRes;

  const bodyOrRes = await parseJsonBody<QueryRequest>(c, logger, "POST /v1/collections/:id/query");
  if (bodyOrRes instanceof Response) return bodyOrRes;
  const body = bodyOrRes;

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
  const callerOrRes = requireCaller(c);
  if (callerOrRes instanceof Response) return callerOrRes;
  const caller = callerOrRes;

  const bodyOrRes = await parseJsonBody<SetCacheRequest>(c, logger, "PUT /v1/cache/:namespace/:key");
  if (bodyOrRes instanceof Response) return bodyOrRes;
  const body = bodyOrRes;

  const result = cacheSet(c.req.param("namespace"), c.req.param("key"), body, caller);
  if (!result.ok) {
    return c.json(invalidRequest(result.message), 400);
  }
  return c.json(result.data as GetCacheResponse, 200);
});

// GET /v1/cache/:namespace/:key — Get cache entry
app.get("/v1/cache/:namespace/:key", (c) => {
  const callerOrRes = requireCaller(c);
  if (callerOrRes instanceof Response) return callerOrRes;
  const caller = callerOrRes;

  const result = cacheGet(c.req.param("namespace"), c.req.param("key"), caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    return c.json(forbidden(result.message), 403);
  }
  return c.json(result.data as GetCacheResponse, 200);
});

// DELETE /v1/cache/:namespace/:key — Delete cache entry
app.delete("/v1/cache/:namespace/:key", (c) => {
  const callerOrRes = requireCaller(c);
  if (callerOrRes instanceof Response) return callerOrRes;
  const caller = callerOrRes;

  const result = cacheDelete(c.req.param("namespace"), c.req.param("key"), caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    return c.json(forbidden(result.message), 403);
  }
  return c.json(result.data, 200);
});

export default app;
