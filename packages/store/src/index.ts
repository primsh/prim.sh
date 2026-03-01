import { resolve } from "node:path";
import {
  createAgentStackMiddleware,
  createWalletAllowlistChecker,
  forbidden,
  invalidRequest,
  notFound,
} from "@primsh/x402-middleware";
import type { ApiError } from "@primsh/x402-middleware";
import { createPrimApp } from "@primsh/x402-middleware/create-prim-app";
import { bodyLimit } from "hono/body-limit";
import type {
  BucketListResponse,
  BucketResponse,
  CreateBucketRequest,
  CreateBucketResponse,
  DeleteObjectResponse,
  ObjectListResponse,
  PutObjectResponse,
  QuotaResponse,
  ReconcileResponse,
  SetQuotaRequest,
} from "./api.ts";
import {
  createBucket,
  deleteBucket,
  deleteObject,
  getBucket,
  getObject,
  getUsage,
  listBuckets,
  listObjects,
  putObject,
  reconcileUsage,
  setQuotaForBucket,
} from "./service.ts";

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

function r2Error(message: string): ApiError {
  return { error: { code: "r2_error", message } };
}

function quotaExceeded(message: string): ApiError {
  return { error: { code: "quota_exceeded", message } };
}

function bucketLimitExceeded(message: string): ApiError {
  return { error: { code: "bucket_limit_exceeded", message } };
}

function storageLimitExceeded(message: string): ApiError {
  return { error: { code: "storage_limit_exceeded", message } };
}

/** Extract object key from wildcard path — Hono 4.x doesn't capture `*` as a param. */
function extractObjectKey(c: { req: { path: string } }): string {
  const match = c.req.path.match(/\/objects\/(.+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

// store.sh uses skipBodyLimit: true because it needs a conditional body limit
// (object PUT routes must bypass the 1MB limit for streaming uploads to R2).
const app = createPrimApp(
  {
    serviceName: "store.sh",
    llmsTxtPath: import.meta.dir
      ? resolve(import.meta.dir, "../../../site/store/llms.txt")
      : undefined,
    routes: STORE_ROUTES,
    skipBodyLimit: true,
    metricsName: "store.prim.sh",
    pricing: {
      routes: [
        { method: "POST", path: "/v1/buckets", price_usdc: "0.05", description: "Create a bucket" },
        { method: "GET", path: "/v1/buckets", price_usdc: "0.001", description: "List buckets" },
        { method: "GET", path: "/v1/buckets/{id}", price_usdc: "0.001", description: "Get bucket" },
        {
          method: "DELETE",
          path: "/v1/buckets/{id}",
          price_usdc: "0.01",
          description: "Delete bucket",
        },
        {
          method: "PUT",
          path: "/v1/buckets/{id}/objects/*",
          price_usdc: "0.001",
          description: "Upload object",
        },
        {
          method: "GET",
          path: "/v1/buckets/{id}/objects",
          price_usdc: "0.001",
          description: "List objects",
        },
        {
          method: "GET",
          path: "/v1/buckets/{id}/objects/*",
          price_usdc: "0.001",
          description: "Download object",
        },
        {
          method: "DELETE",
          path: "/v1/buckets/{id}/objects/*",
          price_usdc: "0.001",
          description: "Delete object",
        },
        {
          method: "GET",
          path: "/v1/buckets/{id}/quota",
          price_usdc: "0.001",
          description: "Get quota and usage",
        },
        {
          method: "PUT",
          path: "/v1/buckets/{id}/quota",
          price_usdc: "0.01",
          description: "Set quota",
        },
        {
          method: "POST",
          path: "/v1/buckets/{id}/quota/reconcile",
          price_usdc: "0.05",
          description: "Reconcile usage",
        },
      ],
    },
  },
  { createAgentStackMiddleware, createWalletAllowlistChecker },
);

const logger = app.logger;

// Body size limit — skip for object PUT (streaming uploads to R2 can exceed 1MB)
app.use("*", async (c, next) => {
  if (c.req.method === "PUT" && c.req.path.includes("/objects/")) {
    return next();
  }
  return bodyLimit({
    maxSize: 1024 * 1024,
    onError: (c) => c.json({ error: "Request too large" }, 413),
  })(c, next);
});

// POST /v1/buckets — Create bucket
app.post("/v1/buckets", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  let body: CreateBucketRequest;
  try {
    body = await c.req.json<CreateBucketRequest>();
  } catch (err) {
    logger.warn("JSON parse failed on POST /v1/buckets", { error: String(err) });
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await createBucket(body, caller);
  if (!result.ok) {
    if (result.code === "invalid_request" || result.code === "bucket_name_taken")
      return c.json(invalidRequest(result.message), 400);
    if (result.code === "bucket_limit_exceeded")
      return c.json(bucketLimitExceeded(result.message), 403);
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

  const key = extractObjectKey(c);
  const contentType = c.req.header("Content-Type");
  const body = c.req.raw.body;
  if (!body) return c.json(invalidRequest("Request body is required"), 400);

  const clHeader = c.req.header("Content-Length");
  const contentLength = clHeader ? Number.parseInt(clHeader, 10) : null;

  const result = await putObject(c.req.param("id"), key, body, contentType, caller, contentLength);
  if (!result.ok) {
    if (result.code === "quota_exceeded") return c.json(quotaExceeded(result.message), 413);
    if (result.code === "storage_limit_exceeded")
      return c.json(storageLimitExceeded(result.message), 413);
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

  const key = extractObjectKey(c);

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

  const key = extractObjectKey(c);

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
  } catch (err) {
    logger.warn("JSON parse failed on PUT /v1/buckets/:id/quota", { error: String(err) });
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
