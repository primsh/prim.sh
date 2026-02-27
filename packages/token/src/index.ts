import { resolve } from "node:path";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
  createAgentStackMiddleware,
  createWalletAllowlistChecker,
  forbidden,
  notFound,
  invalidRequest,
} from "@primsh/x402-middleware";
import type { ApiError } from "@primsh/x402-middleware";
import { createPrimApp } from "@primsh/x402-middleware/create-prim-app";
import type {
  CreateTokenRequest,
  MintRequest,
  CreatePoolRequest,
} from "./api.ts";
import {
  deployToken,
  listTokens,
  getToken,
  mintTokens,
  getSupply,
  createPool,
  getPool,
  getLiquidityParams,
} from "./service.ts";

const TOKEN_ROUTES = {
  "POST /v1/tokens": "$1.00",
  "GET /v1/tokens": "$0.001",
  "GET /v1/tokens/[id]": "$0.001",
  "POST /v1/tokens/[id]/mint": "$0.10",
  "GET /v1/tokens/[id]/supply": "$0.001",
  "POST /v1/tokens/[id]/pool": "$0.50",
  "GET /v1/tokens/[id]/pool": "$0.001",
  "GET /v1/tokens/[id]/pool/liquidity-params": "$0.001",
} as const;

function rpcError(message: string): ApiError {
  return { error: { code: "rpc_error", message } };
}

function notMintable(message: string): ApiError {
  return { error: { code: "not_mintable", message } };
}

function exceedsMaxSupply(message: string): ApiError {
  return { error: { code: "exceeds_max_supply", message } };
}

function poolExists(message: string): ApiError {
  return { error: { code: "pool_exists", message } };
}

const app = createPrimApp(
  {
    serviceName: "token.sh",
    llmsTxtPath: import.meta.dir ? resolve(import.meta.dir, "../../../site/token/llms.txt") : undefined,
    routes: TOKEN_ROUTES,
    metricsName: "token.prim.sh",
  },
  { createAgentStackMiddleware, createWalletAllowlistChecker },
);

const logger = (app as typeof app & { logger: { warn: (msg: string, extra?: Record<string, unknown>) => void } }).logger;

// POST /v1/tokens — Deploy new ERC-20
app.post("/v1/tokens", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  let body: CreateTokenRequest;
  try {
    body = await c.req.json<CreateTokenRequest>();
  } catch (err) {
    logger.warn("JSON parse failed on POST /v1/tokens", { error: String(err) });
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
  } catch (err) {
    logger.warn("JSON parse failed on POST /v1/tokens/:id/mint", { error: String(err) });
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

// POST /v1/tokens/:id/pool — Create + initialize Uniswap V3 pool
app.post("/v1/tokens/:id/pool", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  let body: CreatePoolRequest;
  try {
    body = await c.req.json<CreatePoolRequest>();
  } catch (err) {
    logger.warn("JSON parse failed on POST /v1/tokens/:id/pool", { error: String(err) });
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await createPool(c.req.param("id"), body, caller);
  if (!result.ok) {
    if (result.code === "not_found") return c.json(notFound(result.message), 404);
    if (result.code === "forbidden") return c.json(forbidden(result.message), 403);
    if (result.code === "pool_exists") return c.json(poolExists(result.message), 409);
    if (result.code === "invalid_request") return c.json(invalidRequest(result.message), 400);
    if (result.code === "rpc_error") return c.json(rpcError(result.message), 502);
    return c.json(invalidRequest(result.message), result.status as ContentfulStatusCode);
  }
  return c.json(result.data, 201);
});

// GET /v1/tokens/:id/pool/liquidity-params — Compute add-liquidity calldata
// NOTE: must be registered before GET /v1/tokens/:id/pool to avoid routing conflict
app.get("/v1/tokens/:id/pool/liquidity-params", (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const tokenAmount = c.req.query("tokenAmount") ?? "";
  const usdcAmount = c.req.query("usdcAmount") ?? "";

  const result = getLiquidityParams(c.req.param("id"), tokenAmount, usdcAmount, caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    if (result.code === "invalid_request") return c.json(invalidRequest(result.message), 400);
    return c.json(invalidRequest(result.message), result.status as ContentfulStatusCode);
  }
  return c.json(result.data, 200);
});

// GET /v1/tokens/:id/pool — Pool info
app.get("/v1/tokens/:id/pool", (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = getPool(c.req.param("id"), caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    return c.json(invalidRequest(result.message), result.status as ContentfulStatusCode);
  }
  return c.json(result.data, 200);
});

export default app;
