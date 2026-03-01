// SPDX-License-Identifier: Apache-2.0
import { resolve } from "node:path";
import {
  createAgentStackMiddleware,
  createWalletAllowlistChecker,
  invalidRequest,
  parseJsonBody,
} from "@primsh/x402-middleware";
import type { ApiError } from "@primsh/x402-middleware";
import { createPrimApp } from "@primsh/x402-middleware/create-prim-app";
import type { DescribeRequest, GenerateRequest, UpscaleRequest } from "./api.ts";
import { describe, generate, models, upscale } from "./service.ts";

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

const app = createPrimApp(
  {
    serviceName: "imagine.sh",
    llmsTxtPath: import.meta.dir
      ? resolve(import.meta.dir, "../../../site/imagine/llms.txt")
      : undefined,
    routes: IMAGINE_ROUTES,
    metricsName: "imagine.prim.sh",
    bodyLimitBytes: 25 * 1024 * 1024,
    pricing: {
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
    },
  },
  { createAgentStackMiddleware, createWalletAllowlistChecker },
);

const logger = app.logger;

// POST /v1/generate — Generate an image from a text prompt. Returns base64 or URL.
app.post("/v1/generate", async (c) => {
  const bodyOrRes = await parseJsonBody<GenerateRequest>(c, logger, "POST /v1/generate");
  if (bodyOrRes instanceof Response) return bodyOrRes;
  const body = bodyOrRes;

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
  const bodyOrRes = await parseJsonBody<DescribeRequest>(c, logger, "POST /v1/describe");
  if (bodyOrRes instanceof Response) return bodyOrRes;
  const body = bodyOrRes;

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
  const bodyOrRes = await parseJsonBody<UpscaleRequest>(c, logger, "POST /v1/upscale");
  if (bodyOrRes instanceof Response) return bodyOrRes;
  const body = bodyOrRes;

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
