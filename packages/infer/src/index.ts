import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const LLMS_TXT = import.meta.dir
  ? readFileSync(resolve(import.meta.dir, "../../../site/infer/llms.txt"), "utf-8")
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
import type { ChatRequest, EmbedRequest } from "./api.ts";
import { chat, embed, models } from "./service.ts";

const logger = createLogger("infer.sh");

const networkConfig = getNetworkConfig();
const PAY_TO_ADDRESS = process.env.PRIM_PAY_TO;
if (!PAY_TO_ADDRESS) {
  throw new Error("[infer.sh] PRIM_PAY_TO environment variable is required");
}
const NETWORK = networkConfig.network;
const WALLET_INTERNAL_URL = process.env.WALLET_INTERNAL_URL ?? "http://127.0.0.1:3001";
const checkAllowlist = createWalletAllowlistChecker(WALLET_INTERNAL_URL);

const INFER_ROUTES = {
  "POST /v1/chat": "$0.01",
  "POST /v1/embed": "$0.001",
  "GET /v1/models": "$0.01"
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
    { ...INFER_ROUTES },
  ),
);

// GET / — health check (free)
app.get("/", (c) => {
  return c.json({ service: "infer.sh", status: "ok" });
});

// GET /llms.txt — machine-readable API reference (free)
app.get("/llms.txt", (c) => {
  c.header("Content-Type", "text/plain; charset=utf-8");
  return c.body(LLMS_TXT);
});

// GET /v1/metrics — operational metrics (free)
app.get("/v1/metrics", metricsHandler("infer.prim.sh"));

// GET /pricing — machine-readable pricing (free)
app.get("/pricing", (c) => {
  return c.json({
    service: "infer.prim.sh",
    currency: "USDC",
    network: "eip155:8453",
    routes: [
      { method: "POST", path: "/v1/chat", price_usdc: "pass-through + 10%", description: "Chat completion. Supports streaming, tool use, structured output." },
      { method: "POST", path: "/v1/embed", price_usdc: "0.001", description: "Generate embeddings for text input. Returns vector array." },
      { method: "GET", path: "/v1/models", price_usdc: "0.01", description: "List available models with pricing and capabilities." }
    ],
  });
});

// POST /v1/chat — Chat completion. Supports streaming, tool use, structured output.
app.post("/v1/chat", async (c) => {
  let body: ChatRequest;
  try {
    body = await c.req.json<ChatRequest>();
  } catch (err) {
    logger.warn("JSON parse failed on POST /v1/chat", { error: String(err) });
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await chat(body);

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

// POST /v1/embed — Generate embeddings for text input. Returns vector array.
app.post("/v1/embed", async (c) => {
  let body: EmbedRequest;
  try {
    body = await c.req.json<EmbedRequest>();
  } catch (err) {
    logger.warn("JSON parse failed on POST /v1/embed", { error: String(err) });
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await embed(body);

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

// GET /v1/models — List available models with pricing and capabilities.
app.get("/v1/models", async (c) => {
  const result = await models();

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

export default app;
