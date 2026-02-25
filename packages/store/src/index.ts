import { Hono } from "hono";
import { createAgentStackMiddleware } from "@agentstack/x402-middleware";
import type {
  ApiError,
  CreateBucketRequest,
  CreateBucketResponse,
  BucketResponse,
  BucketListResponse,
} from "./api.ts";
import {
  createBucket,
  listBuckets,
  getBucket,
  deleteBucket,
} from "./service.ts";

const PAY_TO_ADDRESS = "0x0000000000000000000000000000000000000000";
const NETWORK = "eip155:8453";

const STORE_ROUTES = {
  "POST /v1/buckets": "$0.05",
  "GET /v1/buckets": "$0.001",
  "GET /v1/buckets/[id]": "$0.001",
  "DELETE /v1/buckets/[id]": "$0.01",
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

export default app;
