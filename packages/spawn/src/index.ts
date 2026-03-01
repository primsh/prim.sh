// SPDX-License-Identifier: Apache-2.0
import { resolve } from "node:path";
import {
  createAgentStackMiddleware,
  createWalletAllowlistChecker,
  forbidden,
  invalidRequest,
  notFound,
  parseJsonBody,
  requireCaller,
  serviceError,
} from "@primsh/x402-middleware";
import type { ApiError, PaginatedList } from "@primsh/x402-middleware";
import { createPrimApp } from "@primsh/x402-middleware/create-prim-app";
import type {
  ActionOnlyResponse,
  CreateServerRequest,
  CreateServerResponse,
  CreateSshKeyRequest,
  DeleteServerResponse,
  RebuildRequest,
  RebuildResponse,
  ResizeRequest,
  ResizeResponse,
  ServerResponse,
  SshKeyResponse,
} from "./api.ts";
import {
  createServer,
  deleteServer,
  deleteSshKey,
  getServer,
  listServers,
  listSshKeys,
  rebootServer,
  rebuildServer,
  registerSshKey,
  resizeServer,
  startServer,
  stopServer,
} from "./service.ts";

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

function providerError(message: string): ApiError {
  return { error: { code: "provider_error", message } };
}

const app = createPrimApp(
  {
    serviceName: "spawn.sh",
    llmsTxtPath: import.meta.dir
      ? resolve(import.meta.dir, "../../../site/spawn/llms.txt")
      : undefined,
    routes: SPAWN_ROUTES,
    metricsName: "spawn.prim.sh",
    pricing: {
      routes: [
        { method: "POST", path: "/v1/servers", price_usdc: "0.01", description: "Create server" },
        { method: "GET", path: "/v1/servers", price_usdc: "0.001", description: "List servers" },
        { method: "GET", path: "/v1/servers/{id}", price_usdc: "0.001", description: "Get server" },
        {
          method: "DELETE",
          path: "/v1/servers/{id}",
          price_usdc: "0.005",
          description: "Delete server",
        },
        {
          method: "POST",
          path: "/v1/servers/{id}/start",
          price_usdc: "0.002",
          description: "Start server",
        },
        {
          method: "POST",
          path: "/v1/servers/{id}/stop",
          price_usdc: "0.002",
          description: "Stop server",
        },
        {
          method: "POST",
          path: "/v1/servers/{id}/reboot",
          price_usdc: "0.002",
          description: "Reboot server",
        },
        {
          method: "POST",
          path: "/v1/servers/{id}/resize",
          price_usdc: "0.01",
          description: "Resize server",
        },
        {
          method: "POST",
          path: "/v1/servers/{id}/rebuild",
          price_usdc: "0.005",
          description: "Rebuild server",
        },
        {
          method: "POST",
          path: "/v1/ssh-keys",
          price_usdc: "0.001",
          description: "Register SSH key",
        },
        { method: "GET", path: "/v1/ssh-keys", price_usdc: "0.001", description: "List SSH keys" },
        {
          method: "DELETE",
          path: "/v1/ssh-keys/{id}",
          price_usdc: "0.001",
          description: "Delete SSH key",
        },
      ],
    },
  },
  { createAgentStackMiddleware, createWalletAllowlistChecker },
);

const logger = app.logger;

// POST /v1/servers — Create server
app.post("/v1/servers", async (c) => {
  const callerOrRes = requireCaller(c);
  if (callerOrRes instanceof Response) return callerOrRes;
  const caller = callerOrRes;

  const bodyOrRes = await parseJsonBody<CreateServerRequest>(c, logger, "POST /v1/servers");
  if (bodyOrRes instanceof Response) return bodyOrRes;
  const body = bodyOrRes;

  const result = await createServer(body, caller);
  if (!result.ok) {
    if (result.status === 400) return c.json(invalidRequest(result.message), 400);
    if (result.status === 403) return c.json(serviceError(result.code, result.message), 403);
    if (result.status === 404) return c.json(notFound(result.message), 404);
    return c.json(providerError(result.message), result.status as 502);
  }
  return c.json(result.data as CreateServerResponse, 201);
});

// GET /v1/servers — List servers
app.get("/v1/servers", (c) => {
  const callerOrRes = requireCaller(c);
  if (callerOrRes instanceof Response) return callerOrRes;
  const caller = callerOrRes;

  const limitParam = c.req.query("limit");
  const pageParam = c.req.query("page");
  const limit = Math.min(Number(limitParam) || 20, 100);
  const page = Math.max(Number(pageParam) || 1, 1);

  const data = listServers(caller, limit, page);
  return c.json(data as PaginatedList<ServerResponse>, 200);
});

// GET /v1/servers/:id — Get server
app.get("/v1/servers/:id", async (c) => {
  const callerOrRes = requireCaller(c);
  if (callerOrRes instanceof Response) return callerOrRes;
  const caller = callerOrRes;

  const id = c.req.param("id");
  const result = await getServer(id, caller);

  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    return c.json(forbidden(result.message), 403);
  }
  return c.json(result.data as ServerResponse, 200);
});

// DELETE /v1/servers/:id — Delete server
app.delete("/v1/servers/:id", async (c) => {
  const callerOrRes = requireCaller(c);
  if (callerOrRes instanceof Response) return callerOrRes;
  const caller = callerOrRes;

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
  const callerOrRes = requireCaller(c);
  if (callerOrRes instanceof Response) return callerOrRes;
  const caller = callerOrRes;

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
  const callerOrRes = requireCaller(c);
  if (callerOrRes instanceof Response) return callerOrRes;
  const caller = callerOrRes;

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
  const callerOrRes = requireCaller(c);
  if (callerOrRes instanceof Response) return callerOrRes;
  const caller = callerOrRes;

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
  const callerOrRes = requireCaller(c);
  if (callerOrRes instanceof Response) return callerOrRes;
  const caller = callerOrRes;

  const bodyOrRes = await parseJsonBody<ResizeRequest>(c, logger, "POST /v1/servers/:id/resize");
  if (bodyOrRes instanceof Response) return bodyOrRes;
  const body = bodyOrRes;

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
  const callerOrRes = requireCaller(c);
  if (callerOrRes instanceof Response) return callerOrRes;
  const caller = callerOrRes;

  const bodyOrRes = await parseJsonBody<RebuildRequest>(c, logger, "POST /v1/servers/:id/rebuild");
  if (bodyOrRes instanceof Response) return bodyOrRes;
  const body = bodyOrRes;

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
  const callerOrRes = requireCaller(c);
  if (callerOrRes instanceof Response) return callerOrRes;
  const caller = callerOrRes;

  const bodyOrRes = await parseJsonBody<CreateSshKeyRequest>(c, logger, "POST /v1/ssh-keys");
  if (bodyOrRes instanceof Response) return bodyOrRes;
  const body = bodyOrRes;

  const result = await registerSshKey(body, caller);
  if (!result.ok) {
    if (result.status === 400) return c.json(invalidRequest(result.message), 400);
    return c.json(providerError(result.message), result.status as 502);
  }
  return c.json(result.data as SshKeyResponse, 201);
});

// GET /v1/ssh-keys — List SSH keys
app.get("/v1/ssh-keys", (c) => {
  const callerOrRes = requireCaller(c);
  if (callerOrRes instanceof Response) return callerOrRes;
  const caller = callerOrRes;

  const data = listSshKeys(caller);
  return c.json(data as PaginatedList<SshKeyResponse>, 200);
});

// DELETE /v1/ssh-keys/:id — Delete SSH key
app.delete("/v1/ssh-keys/:id", async (c) => {
  const callerOrRes = requireCaller(c);
  if (callerOrRes instanceof Response) return callerOrRes;
  const caller = callerOrRes;

  const result = await deleteSshKey(c.req.param("id"), caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    return c.json(providerError(result.message), result.status as 502);
  }
  return c.json(result.data, 200);
});

export default app;
