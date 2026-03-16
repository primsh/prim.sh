// SPDX-License-Identifier: Apache-2.0
import { resolve } from "node:path";
import {
  createAgentStackMiddleware,
  createWalletAllowlistChecker,
  invalidRequest,
  parseJsonBody,
} from "@primsh/x402-middleware";
import type { ApiError, CreditLedger, RouteConfig } from "@primsh/x402-middleware";
import { createPrimApp } from "@primsh/x402-middleware/create-prim-app";
import type { Context } from "hono";
import { ChatRequestSchema, EmbedRequestSchema } from "./api.ts";
import { createInferCalculator, createInferEstimator, initModelPricing } from "./pricing.ts";
import { chat, chatStream, embed, models } from "./service.ts";

const INTERNAL_KEY = process.env.PRIM_INTERNAL_KEY;

const chatRouteConfig: RouteConfig = {
  price: createInferEstimator(),
  calculator: createInferCalculator(),
  floor: "0.001",
};

const INFER_ROUTES: Record<string, string | RouteConfig> = {
  "POST /v1/chat": chatRouteConfig,
  "POST /v1/chat/completions": chatRouteConfig,
  "POST /v1/embed": "$0.0001",
  "GET /v1/models": "$0.001",
};

// Initialize credit ledger for metered billing.
// credit.ts uses bun:sqlite — variable-path import prevents vitest from resolving it.
let creditLedger: CreditLedger | undefined;
const dbPath =
  process.env.INFER_CREDIT_DB_PATH ?? resolve(process.env.PRIM_HOME ?? ".", "data/infer-credit.db");
if (!process.env.VITEST) {
  const creditModule = "@primsh/x402-middleware/credit";
  const { createCreditLedger } = await import(/* @vite-ignore */ creditModule);
  creditLedger = createCreditLedger(dbPath);
}

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
    extraFreeRoutes: ["POST /internal/credit/add"],
    metricsName: "infer.prim.sh",
    metered: { dbPath },
    pricing: {
      routes: [
        {
          method: "POST",
          path: "/v1/chat",
          price_usdc: "metered",
          description: "Chat completion (metered). Price varies by model and token count.",
        },
        {
          method: "POST",
          path: "/v1/chat/completions",
          price_usdc: "metered",
          description: "OpenAI-compatible chat completion alias (metered).",
        },
        {
          method: "POST",
          path: "/v1/embed",
          price_usdc: "0.0001",
          description: "Generate embeddings for text input. Returns vector array.",
        },
        {
          method: "GET",
          path: "/v1/models",
          price_usdc: "0.001",
          description: "List available models with pricing and capabilities.",
        },
      ],
    },
  },
  { createAgentStackMiddleware, createWalletAllowlistChecker, creditLedger },
);

const logger = app.logger;

// Initialize model pricing cache on startup
initModelPricing().catch((err) => {
  logger.error("Failed to initialize model pricing cache", { error: String(err) });
});

interface StreamUsage {
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  cost?: number;
}

/**
 * Extract usage data from an SSE stream without consuming it.
 * Returns a TransformStream that passes data through unchanged,
 * plus a promise that resolves with usage data from the final chunk.
 */
function createUsageExtractor(): {
  transform: TransformStream<Uint8Array, Uint8Array>;
  usage: Promise<StreamUsage | null>;
} {
  let usageResolve: (v: StreamUsage | null) => void;
  const usage = new Promise<StreamUsage | null>((r) => {
    usageResolve = r;
  });

  let buffer = "";
  let lastUsage: StreamUsage | null = null;

  const decoder = new TextDecoder();
  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      controller.enqueue(chunk);

      buffer += decoder.decode(chunk, { stream: true });

      // Parse complete SSE lines
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
        try {
          const parsed = JSON.parse(line.slice(6)) as {
            model?: string;
            usage?: { prompt_tokens: number; completion_tokens: number; cost?: number };
          };
          if (parsed.usage) {
            lastUsage = {
              model: parsed.model ?? "",
              prompt_tokens: parsed.usage.prompt_tokens,
              completion_tokens: parsed.usage.completion_tokens,
              cost: parsed.usage.cost,
            };
          }
        } catch {
          // Not valid JSON — skip
        }
      }
    },
    flush() {
      usageResolve(lastUsage);
    },
  });

  return { transform, usage };
}

// POST /v1/chat + /v1/chat/completions (OpenAI-compatible alias)
async function handleChat(c: Context) {
  const bodyOrRes = await parseJsonBody(c, logger, "POST /v1/chat", ChatRequestSchema);
  if (bodyOrRes instanceof Response) return bodyOrRes;
  const body = bodyOrRes;

  if (body.stream) {
    const result = await chatStream(body);

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

    // Extract usage from SSE stream for metered billing settlement
    const { transform, usage } = createUsageExtractor();
    const transformedBody = result.data.body?.pipeThrough(transform) ?? null;

    // Store the usage promise on context so the settlement hook can await it
    c.set("inferModel" as never, body.model);
    usage.then((u) => {
      if (u) {
        c.set("inferUsage" as never, u);
      }
    });
    c.set("usagePromise" as never, usage);

    return new Response(transformedBody, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
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

  // Set usage data on context for metered billing settlement
  c.set("inferModel" as never, result.data.model);
  c.set("inferUsage" as never, {
    prompt_tokens: result.data.usage.prompt_tokens,
    completion_tokens: result.data.usage.completion_tokens,
  });

  return c.json(result.data, 200);
}

app.post("/v1/chat", handleChat);
app.post("/v1/chat/completions", handleChat);

// POST /v1/embed — Generate embeddings for text input. Returns vector array.
app.post("/v1/embed", async (c) => {
  const bodyOrRes = await parseJsonBody(c, logger, "POST /v1/embed", EmbedRequestSchema);
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

// ── Internal endpoints ─────────────────────────────────────────────────────────

function internalAuth(c: Context): Response | null {
  if (!INTERNAL_KEY) {
    return c.json(
      { error: { code: "not_configured", message: "Internal API not configured" } },
      501,
    );
  }
  const key = c.req.header("x-internal-key");
  if (key !== INTERNAL_KEY) {
    return c.json({ error: { code: "unauthorized", message: "Invalid internal key" } }, 401);
  }
  return null;
}

// POST /internal/credit/add — Seed credit for a wallet (used by gate.sh on redemption)
app.post("/internal/credit/add", async (c) => {
  const denied = internalAuth(c);
  if (denied) return denied;

  if (!creditLedger) {
    return c.json(
      { error: { code: "not_configured", message: "Credit ledger not initialized" } },
      501,
    );
  }

  const body = await c.req.json<{ wallet: string; amount: string }>().catch(() => null);
  if (!body?.wallet || !body?.amount) {
    return c.json(invalidRequest("wallet and amount are required"), 400);
  }

  const amount = Number.parseFloat(body.amount);
  if (Number.isNaN(amount) || amount <= 0 || amount > 100) {
    return c.json(invalidRequest("amount must be a positive number (max 100)"), 400);
  }

  creditLedger.addCredit(body.wallet, body.amount, `gate-seed-${Date.now()}`);
  const balance = creditLedger.getBalance(body.wallet);
  logger.info("Credit seeded via internal API", {
    wallet: body.wallet,
    amount: body.amount,
    balance,
  });

  return c.json({ wallet: body.wallet, amount_added: body.amount, balance }, 200);
});

export default app;
