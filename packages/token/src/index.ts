import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { createAgentStackMiddleware } from "@agentstack/x402-middleware";
import type {
  ApiError,
  CreateTokenRequest,
  MintRequest,
} from "./api.ts";
import {
  deployToken,
  listTokens,
  getToken,
  mintTokens,
  getSupply,
} from "./service.ts";

const PAY_TO_ADDRESS = "0x0000000000000000000000000000000000000000";
const NETWORK = "eip155:8453";

const TOKEN_ROUTES = {
  "POST /v1/tokens": "$1.00",
  "GET /v1/tokens": "$0.001",
  "GET /v1/tokens/[id]": "$0.001",
  "POST /v1/tokens/[id]/mint": "$0.10",
  "GET /v1/tokens/[id]/supply": "$0.001",
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

function rpcError(message: string): ApiError {
  return { error: { code: "rpc_error", message } };
}

function notMintable(message: string): ApiError {
  return { error: { code: "not_mintable", message } };
}

function exceedsMaxSupply(message: string): ApiError {
  return { error: { code: "exceeds_max_supply", message } };
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
    { ...TOKEN_ROUTES },
  ),
);

// GET / — health check (free)
app.get("/", (c) => {
  return c.json({ service: "token.sh", status: "ok" });
});

// POST /v1/tokens — Deploy new ERC-20
app.post("/v1/tokens", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  let body: CreateTokenRequest;
  try {
    body = await c.req.json<CreateTokenRequest>();
  } catch {
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await deployToken(body, caller);
  if (!result.ok) {
    if (result.code === "invalid_request") return c.json(invalidRequest(result.message), 400);
    if (result.code === "rpc_error") return c.json(rpcError(result.message), 502);
    return c.json(invalidRequest(result.message), result.status as ContentfulStatusCode);
  }
  return c.json(result.data, 201);
});

// GET /v1/tokens — List caller's tokens
app.get("/v1/tokens", (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = listTokens(caller);
  if (!result.ok) return c.json(invalidRequest(result.message), result.status as ContentfulStatusCode);
  return c.json(result.data, 200);
});

// GET /v1/tokens/:id — Token detail
app.get("/v1/tokens/:id", (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = getToken(c.req.param("id"), caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    return c.json(invalidRequest(result.message), result.status as ContentfulStatusCode);
  }
  return c.json(result.data, 200);
});

// POST /v1/tokens/:id/mint — Mint additional tokens
app.post("/v1/tokens/:id/mint", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  let body: MintRequest;
  try {
    body = await c.req.json<MintRequest>();
  } catch {
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await mintTokens(c.req.param("id"), body, caller);
  if (!result.ok) {
    if (result.code === "not_found") return c.json(notFound(result.message), 404);
    if (result.code === "not_mintable") return c.json(notMintable(result.message), 400);
    if (result.code === "forbidden") return c.json(forbidden(result.message), 403);
    if (result.code === "exceeds_max_supply") return c.json(exceedsMaxSupply(result.message), 422);
    if (result.code === "invalid_request") return c.json(invalidRequest(result.message), 400);
    if (result.code === "rpc_error") return c.json(rpcError(result.message), 502);
    return c.json(invalidRequest(result.message), result.status as ContentfulStatusCode);
  }
  return c.json(result.data, 200);
});

// GET /v1/tokens/:id/supply — Live on-chain totalSupply
app.get("/v1/tokens/:id/supply", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = await getSupply(c.req.param("id"), caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    if (result.code === "rpc_error") return c.json(rpcError(result.message), 502);
    return c.json(invalidRequest(result.message), result.status as ContentfulStatusCode);
  }
  return c.json(result.data, 200);
});

export default app;
