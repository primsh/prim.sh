import { Hono } from "hono";
import { createAgentStackMiddleware } from "@agentstack/x402-middleware";
import type {
  ApiError,
  CreateZoneRequest,
  CreateZoneResponse,
  ZoneResponse,
  ZoneListResponse,
  CreateRecordRequest,
  UpdateRecordRequest,
  RecordResponse,
  RecordListResponse,
  DomainSearchResponse,
} from "./api.ts";
import {
  createZone,
  listZones,
  getZone,
  deleteZone,
  createRecord,
  listRecords,
  getRecord,
  updateRecord,
  deleteRecord,
  searchDomains,
} from "./service.ts";

const PAY_TO_ADDRESS = "0x0000000000000000000000000000000000000000";
const NETWORK = "eip155:8453";

const DOMAIN_ROUTES = {
  "GET /v1/domains/search": "$0.001",
  "POST /v1/zones": "$0.05",
  "GET /v1/zones": "$0.001",
  "GET /v1/zones/[id]": "$0.001",
  "DELETE /v1/zones/[id]": "$0.01",
  "POST /v1/zones/[zone_id]/records": "$0.001",
  "GET /v1/zones/[zone_id]/records": "$0.001",
  "GET /v1/zones/[zone_id]/records/[id]": "$0.001",
  "PUT /v1/zones/[zone_id]/records/[id]": "$0.001",
  "DELETE /v1/zones/[zone_id]/records/[id]": "$0.001",
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

function serviceUnavailable(message: string): ApiError {
  return { error: { code: "service_unavailable", message } };
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
    { ...DOMAIN_ROUTES },
  ),
);

// GET / — health check (free)
app.get("/", (c) => {
  return c.json({ service: "domain.sh", status: "ok" });
});

// GET /v1/domains/search — Check availability + pricing for domains
app.get("/v1/domains/search", async (c) => {
  const query = c.req.query("query");
  if (!query) return c.json(invalidRequest("query parameter is required"), 400);

  const tldsParam = c.req.query("tlds");
  const tlds = tldsParam ? tldsParam.split(",").map((t) => t.trim()).filter(Boolean) : [];

  const result = await searchDomains(query, tlds);
  if (!result.ok) {
    if (result.status === 503) return c.json(serviceUnavailable(result.message), 503);
    return c.json(invalidRequest(result.message), 400);
  }
  return c.json(result.data as DomainSearchResponse, 200);
});

// POST /v1/zones — Create zone
app.post("/v1/zones", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  let body: CreateZoneRequest;
  try {
    body = await c.req.json<CreateZoneRequest>();
  } catch {
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await createZone(body, caller);
  if (!result.ok) {
    if (result.code === "invalid_request" || result.code === "domain_taken") return c.json(invalidRequest(result.message), 400);
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    return c.json(cloudflareError(result.message), result.status as 502);
  }
  return c.json(result.data as CreateZoneResponse, 201);
});

// GET /v1/zones — List zones
app.get("/v1/zones", (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const limit = Math.min(Number(c.req.query("limit")) || 20, 100);
  const page = Math.max(Number(c.req.query("page")) || 1, 1);

  const data = listZones(caller, limit, page);
  return c.json(data as ZoneListResponse, 200);
});

// GET /v1/zones/:id — Get zone
app.get("/v1/zones/:id", (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = getZone(c.req.param("id"), caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    return c.json(forbidden(result.message), 403);
  }
  return c.json(result.data as ZoneResponse, 200);
});

// DELETE /v1/zones/:id — Delete zone
app.delete("/v1/zones/:id", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = await deleteZone(c.req.param("id"), caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    return c.json(cloudflareError(result.message), result.status as 502);
  }
  return c.json(result.data, 200);
});

// POST /v1/zones/:zone_id/records — Create record
app.post("/v1/zones/:zone_id/records", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  let body: CreateRecordRequest;
  try {
    body = await c.req.json<CreateRecordRequest>();
  } catch {
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await createRecord(c.req.param("zone_id"), body, caller);
  if (!result.ok) {
    if (result.code === "invalid_request") return c.json(invalidRequest(result.message), 400);
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    return c.json(cloudflareError(result.message), result.status as 502);
  }
  return c.json(result.data as RecordResponse, 201);
});

// GET /v1/zones/:zone_id/records — List records
app.get("/v1/zones/:zone_id/records", (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = listRecords(c.req.param("zone_id"), caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    return c.json(forbidden(result.message), 403);
  }
  return c.json(result.data as RecordListResponse, 200);
});

// GET /v1/zones/:zone_id/records/:id — Get record
app.get("/v1/zones/:zone_id/records/:id", (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = getRecord(c.req.param("zone_id"), c.req.param("id"), caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    return c.json(forbidden(result.message), 403);
  }
  return c.json(result.data as RecordResponse, 200);
});

// PUT /v1/zones/:zone_id/records/:id — Update record
app.put("/v1/zones/:zone_id/records/:id", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  let body: UpdateRecordRequest;
  try {
    body = await c.req.json<UpdateRecordRequest>();
  } catch {
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await updateRecord(c.req.param("zone_id"), c.req.param("id"), body, caller);
  if (!result.ok) {
    if (result.code === "invalid_request") return c.json(invalidRequest(result.message), 400);
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    return c.json(cloudflareError(result.message), result.status as 502);
  }
  return c.json(result.data as RecordResponse, 200);
});

// DELETE /v1/zones/:zone_id/records/:id — Delete record
app.delete("/v1/zones/:zone_id/records/:id", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = await deleteRecord(c.req.param("zone_id"), c.req.param("id"), caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    return c.json(cloudflareError(result.message), result.status as 502);
  }
  return c.json(result.data, 200);
});

export default app;
