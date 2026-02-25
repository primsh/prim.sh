import { Hono } from "hono";
import { createAgentStackMiddleware, getNetworkConfig } from "@agentstack/x402-middleware";
import type {
  ApiError,
  CreateBucketRequest,
  CreateBucketResponse,
  BucketResponse,
  BucketListResponse,
  PutObjectResponse,
  ObjectListResponse,
  DeleteObjectResponse,
  QuotaResponse,
  SetQuotaRequest,
  ReconcileResponse,
} from "./api.ts";
import {
  createBucket,
  listBuckets,
  getBucket,
  deleteBucket,
  putObject,
  getObject,
  deleteObject,
  listObjects,
  getUsage,
  setQuotaForBucket,
  reconcileUsage,
} from "./service.ts";

const networkConfig = getNetworkConfig();
const PAY_TO_ADDRESS = process.env.PRIM_PAY_TO ?? "0x0000000000000000000000000000000000000000";
const NETWORK = networkConfig.network;

const STORE_ROUTES = {
  "POST /v1/buckets": "$0.05",
  "GET /v1/buckets": "$0.001",
  "GET /v1/buckets/[id]": "$0.001",
  "DELETE /v1/buckets/[id]": "$0.01",
  "PUT /v1/buckets/[id]/objects/*": "$0.001",
  "GET /v1/buckets/[id]/objects": "$0.001",
  "GET /v1/buckets/[id]/objects/*": "$0.001",
  "DELETE /v1/buckets/[id]/objects/*": "$0.001",
  "GET /v1/buckets/[id]/quota": "$0.001",
  "PUT /v1/buckets/[id]/quota": "$0.01",
  "POST /v1/buckets/[id]/quota/reconcile": "$0.05",
} as const;

function forbidden(message: string): ApiError {
  return { error: { code: "forbidden", message } };
}

function notFound(message: string): ApiError {
  return { error: { code: "not_found", message } };
}

function invalidRequest(message: string): ApiError {
  return { error: { code: "invalid_request", message } };
}

function r2Error(message: string): ApiError {
  return { error: { code: "r2_error", message } };
}

function quotaExceeded(message: string): ApiError {
  return { error: { code: "quota_exceeded", message } };
}

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
    { ...STORE_ROUTES },
  ),
);

// GET / — health check (free)
app.get("/", (c) => {
  return c.json({ service: "store.sh", status: "ok" });
});

// POST /v1/buckets — Create bucket
app.post("/v1/buckets", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  let body: CreateBucketRequest;
  try {
    body = await c.req.json<CreateBucketRequest>();
  } catch {
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await createBucket(body, caller);
  if (!result.ok) {
    if (result.code === "invalid_request" || result.code === "bucket_name_taken") return c.json(invalidRequest(result.message), 400);
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    return c.json(r2Error(result.message), result.status as 502);
  }
  return c.json(result.data as CreateBucketResponse, 201);
});

// GET /v1/buckets — List buckets
app.get("/v1/buckets", (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const limit = Math.min(Number(c.req.query("limit")) || 20, 100);
  const page = Math.max(Number(c.req.query("page")) || 1, 1);

  const data = listBuckets(caller, limit, page);
  return c.json(data as BucketListResponse, 200);
});

// GET /v1/buckets/:id — Get bucket
app.get("/v1/buckets/:id", (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = getBucket(c.req.param("id"), caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    return c.json(forbidden(result.message), 403);
  }
  return c.json(result.data as BucketResponse, 200);
});

// DELETE /v1/buckets/:id — Delete bucket
app.delete("/v1/buckets/:id", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = await deleteBucket(c.req.param("id"), caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    return c.json(r2Error(result.message), result.status as 502);
  }
  return c.json(result.data, 200);
});

// ─── Object routes ──────────────────────────────────────────────────────

// PUT /v1/buckets/:id/objects/* — Upload object
app.put("/v1/buckets/:id/objects/*", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const key = decodeURIComponent(c.req.param("*") ?? "");
  const contentType = c.req.header("Content-Type");
  const body = c.req.raw.body;
  if (!body) return c.json(invalidRequest("Request body is required"), 400);

  const clHeader = c.req.header("Content-Length");
  const contentLength = clHeader ? Number.parseInt(clHeader, 10) : null;

  const result = await putObject(c.req.param("id"), key, body, contentType, caller, contentLength);
  if (!result.ok) {
    if (result.code === "quota_exceeded") return c.json(quotaExceeded(result.message), 413);
    if (result.status === 411) return c.json(invalidRequest(result.message), 411);
    if (result.code === "invalid_request") return c.json(invalidRequest(result.message), 400);
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    return c.json(r2Error(result.message), result.status as 502);
  }
  return c.json(result.data as PutObjectResponse, 200);
});

// GET /v1/buckets/:id/objects — List objects (must register before wildcard)
app.get("/v1/buckets/:id/objects", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const prefix = c.req.query("prefix") || undefined;
  const limit = Math.min(Number(c.req.query("limit")) || 100, 1000);
  const cursor = c.req.query("cursor") || undefined;

  const result = await listObjects(c.req.param("id"), caller, prefix, limit, cursor);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    return c.json(r2Error(result.message), result.status as 502);
  }
  return c.json(result.data as ObjectListResponse, 200);
});

// GET /v1/buckets/:id/objects/* — Download object (streaming)
app.get("/v1/buckets/:id/objects/*", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const key = decodeURIComponent(c.req.param("*") ?? "");

  const result = await getObject(c.req.param("id"), key, caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    return c.json(r2Error(result.message), result.status as 502);
  }

  return new Response(result.data.body, {
    status: 200,
    headers: {
      "Content-Type": result.data.contentType,
      "Content-Length": String(result.data.contentLength),
      ETag: result.data.etag,
    },
  });
});

// DELETE /v1/buckets/:id/objects/* — Delete object
app.delete("/v1/buckets/:id/objects/*", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const key = decodeURIComponent(c.req.param("*") ?? "");

  const result = await deleteObject(c.req.param("id"), key, caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    return c.json(r2Error(result.message), result.status as 502);
  }
  return c.json(result.data as DeleteObjectResponse, 200);
});

// ─── Quota routes ───────────────────────────────────────────────────────

// GET /v1/buckets/:id/quota — Get quota + usage
app.get("/v1/buckets/:id/quota", (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = getUsage(c.req.param("id"), caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    return c.json(forbidden(result.message), 403);
  }
  return c.json(result.data as QuotaResponse, 200);
});

// PUT /v1/buckets/:id/quota — Set quota
app.put("/v1/buckets/:id/quota", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  let body: SetQuotaRequest;
  try {
    body = await c.req.json<SetQuotaRequest>();
  } catch {
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = setQuotaForBucket(c.req.param("id"), caller, body.quota_bytes);
  if (!result.ok) {
    if (result.code === "invalid_request") return c.json(invalidRequest(result.message), 400);
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    return c.json(r2Error(result.message), result.status as 502);
  }
  return c.json(result.data as QuotaResponse, 200);
});

// POST /v1/buckets/:id/quota/reconcile — Reconcile usage
app.post("/v1/buckets/:id/quota/reconcile", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = await reconcileUsage(c.req.param("id"), caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    return c.json(r2Error(result.message), result.status as 502);
  }
  return c.json(result.data as ReconcileResponse, 200);
});

export default app;
