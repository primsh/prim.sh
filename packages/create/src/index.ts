import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const LLMS_TXT = import.meta.dir
  ? readFileSync(resolve(import.meta.dir, "../../../site/create/llms.txt"), "utf-8")
  : "";
import {
  createAgentStackMiddleware,
  createWalletAllowlistChecker,
  createLogger,
  getNetworkConfig,
  metricsMiddleware,
  metricsHandler,
  requestIdMiddleware,
  invalidRequest,
} from "@primsh/x402-middleware";
import type { ApiError } from "@primsh/x402-middleware";

import { scaffold, validate, schema, ports } from "./service.ts";

const logger = createLogger("create.sh");

const networkConfig = getNetworkConfig();
const PAY_TO_ADDRESS = process.env.PRIM_PAY_TO;
if (!PAY_TO_ADDRESS) {
  throw new Error("[create.sh] PRIM_PAY_TO environment variable is required");
}
const NETWORK = networkConfig.network;
const WALLET_INTERNAL_URL = process.env.WALLET_INTERNAL_URL ?? "http://127.0.0.1:3001";
const checkAllowlist = createWalletAllowlistChecker(WALLET_INTERNAL_URL);

const CREATE_ROUTES = {
  "POST /v1/scaffold": "$0.01",
  "POST /v1/validate": "$0.01",
  "GET /v1/schema": "$0.01",
  "GET /v1/ports": "$0.01"
} as const;

function providerError(message: string): ApiError {
  return { error: { code: "provider_error", message } };
}

function rateLimited(message: string): ApiError {
  return { error: { code: "rate_limited", message } };
}

type AppVariables = { walletAddress: string | undefined };
const app = new Hono<{ Variables: AppVariables }>();

app.use("*", requestIdMiddleware());

app.use("*", bodyLimit({
  maxSize: 1024 * 1024,
  onError: (c) => c.json({ error: "Request too large" }, 413),
}));

app.use("*", metricsMiddleware());

app.use(
  "*",
  createAgentStackMiddleware(
    {
      payTo: PAY_TO_ADDRESS,
      network: NETWORK,
      freeRoutes: ["GET /", "GET /pricing", "GET /llms.txt", "GET /v1/metrics"],
      checkAllowlist,
    },
    { ...CREATE_ROUTES },
  ),
);

// GET / — health check (free)
app.get("/", (c) => {
  return c.json({ service: "create.sh", status: "ok" });
});

// GET /llms.txt — machine-readable API reference (free)
app.get("/llms.txt", (c) => {
  c.header("Content-Type", "text/plain; charset=utf-8");
  return c.body(LLMS_TXT);
});

// GET /v1/metrics — operational metrics (free)
app.get("/v1/metrics", metricsHandler("create.prim.sh"));

// GET /pricing — machine-readable pricing (free)
app.get("/pricing", (c) => {
  return c.json({
    service: "create.prim.sh",
    currency: "USDC",
    network: "eip155:8453",
    routes: [
      { method: "POST", path: "/v1/scaffold", price_usdc: "0.01", description: "Generate a complete prim package from a prim.yaml spec. Returns file manifest with contents." },
      { method: "POST", path: "/v1/validate", price_usdc: "0.01", description: "Validate a prim.yaml spec against the schema without generating files." },
      { method: "GET", path: "/v1/schema", price_usdc: "0.01", description: "Return the prim.yaml JSON schema for agents to reference when writing specs." },
      { method: "GET", path: "/v1/ports", price_usdc: "0.01", description: "Return allocated ports and next available port number." }
    ],
  });
});

// POST /v1/scaffold — Generate a complete prim package from a prim.yaml spec. Returns file manifest with contents.
app.post("/v1/scaffold", async (c) => {
  let body: Record<string, unknown>;
  try {
    body = await c.req.json<Record<string, unknown>>();
  } catch (err) {
    logger.warn("JSON parse failed on POST /v1/scaffold", { error: String(err) });
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await scaffold(body);

  if (!result.ok) {
    if (result.code === "invalid_request") return c.json(invalidRequest(result.message), 400);
    if (result.code === "rate_limited") {
      return new Response(JSON.stringify(rateLimited(result.message)), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(result.retryAfter ?? "60"),
        },
      });
    }
    return c.json(providerError(result.message), 502);
  }

  return c.json(result.data, 200);
});

// POST /v1/validate — Validate a prim.yaml spec against the schema without generating files.
app.post("/v1/validate", async (c) => {
  let body: Record<string, unknown>;
  try {
    body = await c.req.json<Record<string, unknown>>();
  } catch (err) {
    logger.warn("JSON parse failed on POST /v1/validate", { error: String(err) });
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await validate(body);

  if (!result.ok) {
    if (result.code === "invalid_request") return c.json(invalidRequest(result.message), 400);
    if (result.code === "rate_limited") {
      return new Response(JSON.stringify(rateLimited(result.message)), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(result.retryAfter ?? "60"),
        },
      });
    }
    return c.json(providerError(result.message), 502);
  }

  return c.json(result.data, 200);
});

// GET /v1/schema — Return the prim.yaml JSON schema for agents to reference when writing specs.
app.get("/v1/schema", async (c) => {
  const result = await schema();

  if (!result.ok) {
    if (result.code === "invalid_request") return c.json(invalidRequest(result.message), 400);
    return c.json(providerError(result.message), 502);
  }

  return c.json(result.data, 200);
});

// GET /v1/ports — Return allocated ports and next available port number.
app.get("/v1/ports", async (c) => {
  const result = await ports();

  if (!result.ok) {
    if (result.code === "invalid_request") return c.json(invalidRequest(result.message), 400);
    return c.json(providerError(result.message), 502);
  }

  return c.json(result.data, 200);
});

export default app;
