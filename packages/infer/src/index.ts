import { resolve } from "node:path";
import {
  createAgentStackMiddleware,
  createWalletAllowlistChecker,
  invalidRequest,
  parseJsonBody,
} from "@primsh/x402-middleware";
import type { ApiError } from "@primsh/x402-middleware";
import { createPrimApp } from "@primsh/x402-middleware/create-prim-app";
import type { ChatRequest, EmbedRequest } from "./api.ts";
import { chat, embed, models } from "./service.ts";

const INFER_ROUTES = {
  "POST /v1/chat": "$0.01",
  "POST /v1/embed": "$0.001",
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
    serviceName: "infer.sh",
    llmsTxtPath: import.meta.dir
      ? resolve(import.meta.dir, "../../../site/infer/llms.txt")
      : undefined,
    routes: INFER_ROUTES,
    metricsName: "infer.prim.sh",
    pricing: {
      routes: [
        {
          method: "POST",
          path: "/v1/chat",
          price_usdc: "pass-through + 10%",
          description: "Chat completion. Supports streaming, tool use, structured output.",
        },
        {
          method: "POST",
          path: "/v1/embed",
          price_usdc: "0.001",
          description: "Generate embeddings for text input. Returns vector array.",
        },
        {
          method: "GET",
          path: "/v1/models",
          price_usdc: "0.01",
          description: "List available models with pricing and capabilities.",
        },
      ],
    },
  },
  { createAgentStackMiddleware, createWalletAllowlistChecker },
);

const logger = app.logger;

// POST /v1/chat — Chat completion. Supports streaming, tool use, structured output.
app.post("/v1/chat", async (c) => {
  const bodyOrRes = await parseJsonBody<ChatRequest>(c, logger, "POST /v1/chat");
  if (bodyOrRes instanceof Response) return bodyOrRes;
  const body = bodyOrRes;

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
  const bodyOrRes = await parseJsonBody<EmbedRequest>(c, logger, "POST /v1/embed");
  if (bodyOrRes instanceof Response) return bodyOrRes;
  const body = bodyOrRes;

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
