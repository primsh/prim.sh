import { resolve } from "node:path";
import {
  createAgentStackMiddleware,
  createWalletAllowlistChecker,
  forbidden,
  notFound,
  invalidRequest,
  serviceError,
} from "@primsh/x402-middleware";
import type { ApiError } from "@primsh/x402-middleware";
import { createPrimApp } from "@primsh/x402-middleware/create-prim-app";
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
    llmsTxtPath: import.meta.dir ? resolve(import.meta.dir, "../../../site/spawn/llms.txt") : undefined,
    routes: SPAWN_ROUTES,
    metricsName: "spawn.prim.sh",
    pricing: {
      routes: [
        { method: "POST", path: "/v1/servers", price_usdc: "0.01", description: "Create server" },
        { method: "GET", path: "/v1/servers", price_usdc: "0.001", description: "List servers" },
        { method: "GET", path: "/v1/servers/{id}", price_usdc: "0.001", description: "Get server" },
        { method: "DELETE", path: "/v1/servers/{id}", price_usdc: "0.005", description: "Delete server" },
        { method: "POST", path: "/v1/servers/{id}/start", price_usdc: "0.002", description: "Start server" },
        { method: "POST", path: "/v1/servers/{id}/stop", price_usdc: "0.002", description: "Stop server" },
        { method: "POST", path: "/v1/servers/{id}/reboot", price_usdc: "0.002", description: "Reboot server" },
        { method: "POST", path: "/v1/servers/{id}/resize", price_usdc: "0.01", description: "Resize server" },
        { method: "POST", path: "/v1/servers/{id}/rebuild", price_usdc: "0.005", description: "Rebuild server" },
        { method: "POST", path: "/v1/ssh-keys", price_usdc: "0.001", description: "Register SSH key" },
        { method: "GET", path: "/v1/ssh-keys", price_usdc: "0.001", description: "List SSH keys" },
        { method: "DELETE", path: "/v1/ssh-keys/{id}", price_usdc: "0.001", description: "Delete SSH key" },
      ],
    },
  },
  { createAgentStackMiddleware, createWalletAllowlistChecker },
);

const logger = (app as typeof app & { logger: { warn: (msg: string, extra?: Record<string, unknown>) => void } }).logger;

// POST /v1/servers — Create server
app.post("/v1/servers", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) {
    return c.json(forbidden("No wallet address in payment"), 403);
  }

  let body: CreateServerRequest;
  try {
    body = await c.req.json<CreateServerRequest>();
  } catch (err) {
    logger.warn("JSON parse failed on POST /v1/servers", { error: String(err) });
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

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
app.get("/v1/servers/:id", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) {
    return c.json(forbidden("No wallet address in payment"), 403);
  }

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
  } catch (err) {
    logger.warn("JSON parse failed on POST /v1/servers/:id/resize", { error: String(err) });
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
  } catch (err) {
    logger.warn("JSON parse failed on POST /v1/servers/:id/rebuild", { error: String(err) });
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
  } catch (err) {
    logger.warn("JSON parse failed on POST /v1/ssh-keys", { error: String(err) });
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
