import { Hono } from "hono";
import { createAgentStackMiddleware } from "@primsh/x402-middleware";
import type {
  CreateServerRequest,
  CreateServerResponse,
  ServerListResponse,
  ServerResponse,
  DeleteServerResponse,
  ActionOnlyResponse,
  ResizeRequest,
  ResizeResponse,
  RebuildRequest,
  RebuildResponse,
  CreateSshKeyRequest,
  SshKeyResponse,
  SshKeyListResponse,
  ApiError,
} from "./api.ts";
import {
  createServer,
  listServers,
  getServer,
  deleteServer,
  startServer,
  stopServer,
  rebootServer,
  resizeServer,
  rebuildServer,
  registerSshKey,
  listSshKeys,
  deleteSshKey,
} from "./service.ts";

import { getNetworkConfig } from "@primsh/x402-middleware";

const networkConfig = getNetworkConfig();
const PAY_TO_ADDRESS = process.env.PRIM_PAY_TO ?? "0x0000000000000000000000000000000000000000";
const NETWORK = networkConfig.network;

const SPAWN_ROUTES = {
  "POST /v1/servers": "$0.01",
  "GET /v1/servers": "$0.001",
  "GET /v1/servers/[id]": "$0.001",
  "DELETE /v1/servers/[id]": "$0.005",
  "POST /v1/servers/[id]/start": "$0.002",
  "POST /v1/servers/[id]/stop": "$0.002",
  "POST /v1/servers/[id]/reboot": "$0.002",
  "POST /v1/servers/[id]/resize": "$0.01",
  "POST /v1/servers/[id]/rebuild": "$0.005",
  "POST /v1/ssh-keys": "$0.001",
  "GET /v1/ssh-keys": "$0.001",
  "DELETE /v1/ssh-keys/[id]": "$0.001",
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

function providerError(message: string): ApiError {
  return { error: { code: "provider_error", message } };
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
    { ...SPAWN_ROUTES },
  ),
);

// GET / — health check (free)
app.get("/", (c) => {
  return c.json({ service: "spawn.sh", status: "ok" });
});

// POST /v1/servers — Create server
app.post("/v1/servers", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) {
    return c.json(forbidden("No wallet address in payment"), 403);
  }

  let body: CreateServerRequest;
  try {
    body = await c.req.json<CreateServerRequest>();
  } catch {
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await createServer(body, caller);
  if (!result.ok) {
    if (result.status === 400) return c.json(invalidRequest(result.message), 400);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    if (result.status === 404) return c.json(notFound(result.message), 404);
    return c.json(providerError(result.message), result.status as 502);
  }
  return c.json(result.data as CreateServerResponse, 201);
});

// GET /v1/servers — List servers
app.get("/v1/servers", (c) => {
  const caller = c.get("walletAddress");
  if (!caller) {
    return c.json(forbidden("No wallet address in payment"), 403);
  }

  const limitParam = c.req.query("limit");
  const pageParam = c.req.query("page");
  const limit = Math.min(Number(limitParam) || 20, 100);
  const page = Math.max(Number(pageParam) || 1, 1);

  const data = listServers(caller, limit, page);
  return c.json(data as ServerListResponse, 200);
});

// GET /v1/servers/:id — Get server
app.get("/v1/servers/:id", (c) => {
  const caller = c.get("walletAddress");
  if (!caller) {
    return c.json(forbidden("No wallet address in payment"), 403);
  }

  const id = c.req.param("id");
  const result = getServer(id, caller);

  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    return c.json(forbidden(result.message), 403);
  }
  return c.json(result.data as ServerResponse, 200);
});

// DELETE /v1/servers/:id — Delete server
app.delete("/v1/servers/:id", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) {
    return c.json(forbidden("No wallet address in payment"), 403);
  }

  const id = c.req.param("id");
  const result = await deleteServer(id, caller);

  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    return c.json(providerError(result.message), result.status as 502);
  }
  return c.json(result.data as DeleteServerResponse, 200);
});

// POST /v1/servers/:id/start — Start server
app.post("/v1/servers/:id/start", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = await startServer(c.req.param("id"), caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    return c.json(providerError(result.message), result.status as 502);
  }
  return c.json(result.data as ActionOnlyResponse, 200);
});

// POST /v1/servers/:id/stop — Stop server
app.post("/v1/servers/:id/stop", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = await stopServer(c.req.param("id"), caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    return c.json(providerError(result.message), result.status as 502);
  }
  return c.json(result.data as ActionOnlyResponse, 200);
});

// POST /v1/servers/:id/reboot — Reboot server
app.post("/v1/servers/:id/reboot", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = await rebootServer(c.req.param("id"), caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    return c.json(providerError(result.message), result.status as 502);
  }
  return c.json(result.data as ActionOnlyResponse, 200);
});

// POST /v1/servers/:id/resize — Resize server
app.post("/v1/servers/:id/resize", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  let body: ResizeRequest;
  try {
    body = await c.req.json<ResizeRequest>();
  } catch {
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await resizeServer(c.req.param("id"), caller, body);
  if (!result.ok) {
    if (result.status === 400) return c.json(invalidRequest(result.message), 400);
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    return c.json(providerError(result.message), result.status as 502);
  }
  return c.json(result.data as ResizeResponse, 200);
});

// POST /v1/servers/:id/rebuild — Rebuild server
app.post("/v1/servers/:id/rebuild", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  let body: RebuildRequest;
  try {
    body = await c.req.json<RebuildRequest>();
  } catch {
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await rebuildServer(c.req.param("id"), caller, body);
  if (!result.ok) {
    if (result.status === 400) return c.json(invalidRequest(result.message), 400);
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    return c.json(providerError(result.message), result.status as 502);
  }
  return c.json(result.data as RebuildResponse, 200);
});

// POST /v1/ssh-keys — Register SSH key
app.post("/v1/ssh-keys", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  let body: CreateSshKeyRequest;
  try {
    body = await c.req.json<CreateSshKeyRequest>();
  } catch {
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await registerSshKey(body, caller);
  if (!result.ok) {
    if (result.status === 400) return c.json(invalidRequest(result.message), 400);
    return c.json(providerError(result.message), result.status as 502);
  }
  return c.json(result.data as SshKeyResponse, 201);
});

// GET /v1/ssh-keys — List SSH keys
app.get("/v1/ssh-keys", (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const data = listSshKeys(caller);
  return c.json(data as SshKeyListResponse, 200);
});

// DELETE /v1/ssh-keys/:id — Delete SSH key
app.delete("/v1/ssh-keys/:id", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = await deleteSshKey(c.req.param("id"), caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    return c.json(providerError(result.message), result.status as 502);
  }
  return c.json(result.data, 200);
});

export default app;
