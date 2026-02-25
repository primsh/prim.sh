import { Hono } from "hono";
import { createAgentStackMiddleware } from "@agentstack/x402-middleware";
import type {
  ApiError,
  ZoneCreateRequest,
  ZoneCreateResponse,
  ZoneListResponse,
  RecordUpsertRequest,
  RecordUpsertResponse,
  RecordDeleteResponse,
} from "./api.ts";
import { createZone, listZones, upsertRecord, deleteRecord } from "./service.ts";

const PAY_TO_ADDRESS = "0x0000000000000000000000000000000000000000";
const NETWORK = "eip155:8453";

const DNS_ROUTES = {
  "POST /v1/zones": "$0.01",
  "GET /v1/zones": "$0.001",
  "POST /v1/zones/[id]/records": "$0.001",
  "DELETE /v1/zones/[id]/records/[record_id]": "$0.001",
  "POST /v1/zones/[id]/certificates": "$0.01",
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

function cloudflareError(message: string): ApiError {
  return { error: { code: "cloudflare_error", message } };
}

function notImplemented(message: string): ApiError {
  return { error: { code: "not_implemented", message } };
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
    { ...DNS_ROUTES },
  ),
);

// GET / — health check (free)
app.get("/", (c) => {
  return c.json({ service: "dns.sh", status: "ok" });
});

// POST /v1/zones — Create zone
app.post("/v1/zones", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) {
    return c.json(forbidden("No wallet address in payment"), 403);
  }

  let body: ZoneCreateRequest;
  try {
    body = await c.req.json<ZoneCreateRequest>();
  } catch {
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await createZone(body, caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    if (result.code === "invalid_request") return c.json(invalidRequest(result.message), 400);
    return c.json(cloudflareError(result.message), result.status as 400 | 401 | 403 | 404 | 422 | 429 | 500 | 502);
  }

  return c.json(result.data as ZoneCreateResponse, 201);
});

// GET /v1/zones — List zones
app.get("/v1/zones", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) {
    return c.json(forbidden("No wallet address in payment"), 403);
  }

  const pageParam = c.req.query("page");
  const perPageParam = c.req.query("per_page");
  const page = Math.max(Number(pageParam) || 1, 1);
  const perPage = Math.min(Number(perPageParam) || 20, 100);

  try {
    const data = await listZones(caller, page, perPage);
    return c.json(data as ZoneListResponse, 200);
  } catch (err) {
    if (err instanceof Error) {
      return c.json(cloudflareError(err.message), 502);
    }
    return c.json(cloudflareError("Unknown error"), 502);
  }
});

// POST /v1/zones/:id/records — Create or update record
app.post("/v1/zones/:id/records", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) {
    return c.json(forbidden("No wallet address in payment"), 403);
  }

  const zoneId = c.req.param("id");

  let body: RecordUpsertRequest;
  try {
    body = await c.req.json<RecordUpsertRequest>();
  } catch {
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await upsertRecord(zoneId, body, caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    if (result.code === "invalid_request") return c.json(invalidRequest(result.message), 400);
    return c.json(cloudflareError(result.message), result.status as 400 | 401 | 403 | 404 | 422 | 429 | 500 | 502);
  }

  return c.json(result.data as RecordUpsertResponse, 200);
});

// DELETE /v1/zones/:id/records/:record_id — Delete record
app.delete("/v1/zones/:id/records/:record_id", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) {
    return c.json(forbidden("No wallet address in payment"), 403);
  }

  const zoneId = c.req.param("id");
  const recordId = c.req.param("record_id");

  const result = await deleteRecord(zoneId, recordId, caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    if (result.code === "invalid_request") return c.json(invalidRequest(result.message), 400);
    return c.json(cloudflareError(result.message), result.status as 400 | 401 | 403 | 404 | 422 | 429 | 500 | 502);
  }

  return c.json(result.data as RecordDeleteResponse, 200);
});

// POST /v1/zones/:id/certificates — Not yet implemented
app.post("/v1/zones/:id/certificates", (c) => {
  return c.json(notImplemented("Certificate issuance is not implemented yet"), 501);
});

export default app;

