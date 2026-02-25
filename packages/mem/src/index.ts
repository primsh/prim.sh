import { Hono } from "hono";
import { createAgentStackMiddleware, getNetworkConfig } from "@agentstack/x402-middleware";
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

app.use(
  "*",
  createAgentStackMiddleware(
    {
      payTo: PAY_TO_ADDRESS,
      network: NETWORK,
      freeRoutes: ["GET /"],
    },
    { ...MEM_ROUTES },
  ),
);

// GET / — health check (free)
app.get("/", (c) => {
  return c.json({ service: "mem.sh", status: "ok" });
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
