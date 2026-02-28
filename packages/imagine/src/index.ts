import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

const LLMS_TXT = import.meta.dir
  ? readFileSync(resolve(import.meta.dir, "../../../site/imagine/llms.txt"), "utf-8")
  : "";
import {
  createAgentStackMiddleware,
  createLogger,
  createWalletAllowlistChecker,
  getNetworkConfig,
  invalidRequest,
  metricsHandler,
  metricsMiddleware,
  requestIdMiddleware,
} from "@primsh/x402-middleware";
import type { ApiError } from "@primsh/x402-middleware";
import type { DescribeRequest, GenerateRequest, UpscaleRequest } from "./api.ts";
import { describe, generate, models, upscale } from "./service.ts";

const logger = createLogger("imagine.sh");

const networkConfig = getNetworkConfig();
const PAY_TO_ADDRESS = process.env.PRIM_PAY_TO;
if (!PAY_TO_ADDRESS) {
  throw new Error("[imagine.sh] PRIM_PAY_TO environment variable is required");
}
const NETWORK = networkConfig.network;
const WALLET_INTERNAL_URL = process.env.WALLET_INTERNAL_URL ?? "http://127.0.0.1:3001";
const checkAllowlist = createWalletAllowlistChecker(WALLET_INTERNAL_URL);

const IMAGINE_ROUTES = {
  "POST /v1/generate": "$0.02",
  "POST /v1/describe": "$0.005",
  "POST /v1/upscale": "$0.01",
  "GET /v1/models": "$0.01",
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

app.use(
  "*",
  bodyLimit({
    maxSize: 1024 * 1024,
    onError: (c) => c.json({ error: "Request too large" }, 413),
  }),
);

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
    { ...IMAGINE_ROUTES },
  ),
);

// GET / — health check (free)
app.get("/", (c) => {
  return c.json({ service: "imagine.sh", status: "ok" });
});

// GET /llms.txt — machine-readable API reference (free)
app.get("/llms.txt", (c) => {
  c.header("Content-Type", "text/plain; charset=utf-8");
  return c.body(LLMS_TXT);
});

// GET /v1/metrics — operational metrics (free)
app.get("/v1/metrics", metricsHandler("imagine.prim.sh"));

// GET /pricing — machine-readable pricing (free)
app.get("/pricing", (c) => {
  return c.json({
    service: "imagine.prim.sh",
    currency: "USDC",
    network: "eip155:8453",
    routes: [
      {
        method: "POST",
        path: "/v1/generate",
        price_usdc: "0.02",
        description: "Generate an image from a text prompt. Returns base64 or URL.",
      },
      {
        method: "POST",
        path: "/v1/describe",
        price_usdc: "0.005",
        description: "Describe an image. Accepts base64 or URL. Returns text description.",
      },
      {
        method: "POST",
        path: "/v1/upscale",
        price_usdc: "0.01",
        description: "Upscale an image to higher resolution. Accepts base64 or URL.",
      },
      {
        method: "GET",
        path: "/v1/models",
        price_usdc: "0.01",
        description: "List available image models with capabilities and pricing.",
      },
    ],
  });
});

// POST /v1/generate — Generate an image from a text prompt. Returns base64 or URL.
app.post("/v1/generate", async (c) => {
  let body: GenerateRequest;
  try {
    body = await c.req.json<GenerateRequest>();
  } catch (err) {
    logger.warn("JSON parse failed on POST /v1/generate", { error: String(err) });
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await generate(body);

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

// POST /v1/describe — Describe an image. Accepts base64 or URL. Returns text description.
app.post("/v1/describe", async (c) => {
  let body: DescribeRequest;
  try {
    body = await c.req.json<DescribeRequest>();
  } catch (err) {
    logger.warn("JSON parse failed on POST /v1/describe", { error: String(err) });
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await describe(body);

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

// POST /v1/upscale — Upscale an image to higher resolution. Accepts base64 or URL.
app.post("/v1/upscale", async (c) => {
  let body: UpscaleRequest;
  try {
    body = await c.req.json<UpscaleRequest>();
  } catch (err) {
    logger.warn("JSON parse failed on POST /v1/upscale", { error: String(err) });
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await upscale(body);

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

// GET /v1/models — List available image models with capabilities and pricing.
app.get("/v1/models", async (c) => {
  let body: Record<string, unknown>;
  try {
    body = await c.req.json<Record<string, unknown>>();
  } catch (err) {
    logger.warn("JSON parse failed on GET /v1/models", { error: String(err) });
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await models(body);

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
