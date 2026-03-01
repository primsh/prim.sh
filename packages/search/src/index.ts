import { resolve } from "node:path";
import {
  ProviderRegistry,
  createAgentStackMiddleware,
  createWalletAllowlistChecker,
  invalidRequest,
} from "@primsh/x402-middleware";
import type { ApiError } from "@primsh/x402-middleware";
import { createPrimApp } from "@primsh/x402-middleware/create-prim-app";
import type { ExtractRequest, SearchRequest } from "./api.ts";
import type { ExtractProvider, SearchProvider } from "./provider.ts";
import { extractUrls, searchNews, searchWeb, setRegistry } from "./service.ts";
import { TavilyClient } from "./tavily.ts";

// ─── App ──────────────────────────────────────────────────────────────────────

const SEARCH_ROUTES = {
  "POST /v1/search": "$0.01",
  "POST /v1/search/news": "$0.01",
  "POST /v1/extract": "$0.005",
} as const;

function providerError(message: string): ApiError {
  return { error: { code: "provider_error", message } };
}

function rateLimited(message: string): ApiError {
  return { error: { code: "rate_limited", message } };
}

const app = createPrimApp(
  {
    serviceName: "search.sh",
    llmsTxtPath: import.meta.dir
      ? resolve(import.meta.dir, "../../../site/search/llms.txt")
      : undefined,
    routes: SEARCH_ROUTES,
    metricsName: "search.prim.sh",
    extraFreeRoutes: ["GET /health/providers"],
    pricing: {
      routes: [
        { method: "POST", path: "/v1/search", price_usdc: "0.01", description: "Web search" },
        {
          method: "POST",
          path: "/v1/search/news",
          price_usdc: "0.01",
          description: "News search",
        },
        {
          method: "POST",
          path: "/v1/extract",
          price_usdc: "0.005",
          description: "URL content extraction",
        },
      ],
    },
  },
  { createAgentStackMiddleware, createWalletAllowlistChecker },
);

const logger = app.logger;

// ─── Provider registry ────────────────────────────────────────────────────────

const TAVILY_API_KEY = process.env.TAVILY_API_KEY ?? "";

const searchRegistry = new ProviderRegistry<SearchProvider & ExtractProvider>({
  id: "search",
  fallback: false,
  log: (msg) => logger.info(msg),
});

searchRegistry.register(
  "tavily",
  () => {
    const client = new TavilyClient(TAVILY_API_KEY);
    return client;
  },
  { default: true },
);

setRegistry(searchRegistry);

// Run startup health check (non-blocking — don't await, let the server start)
searchRegistry.startup("search.sh").catch((err: unknown) => {
  logger.warn("Provider startup health check failed", { error: String(err) });
});

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /health/providers — provider health status (free)
app.get("/health/providers", async (c) => {
  const results = await searchRegistry.healthCheckAll();
  const active = searchRegistry.list()[0]; // best-effort; get() is async
  const providers: Record<string, { ok: boolean; latency_ms: number; message?: string }> = {};
  for (const [name, health] of results) {
    providers[name] = {
      ok: health.ok,
      latency_ms: health.latency_ms,
      ...(health.message ? { message: health.message } : {}),
    };
  }
  return c.json({ providers, active });
});

// POST /v1/search — Web search
app.post("/v1/search", async (c) => {
  let body: SearchRequest;
  try {
    body = await c.req.json<SearchRequest>();
  } catch (err) {
    logger.warn("JSON parse failed on POST /v1/search", { error: String(err) });
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await searchWeb(body);
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

// POST /v1/search/news — News search
app.post("/v1/search/news", async (c) => {
  let body: SearchRequest;
  try {
    body = await c.req.json<SearchRequest>();
  } catch (err) {
    logger.warn("JSON parse failed on POST /v1/search/news", { error: String(err) });
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await searchNews(body);
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

// POST /v1/extract — URL content extraction
app.post("/v1/extract", async (c) => {
  let body: ExtractRequest;
  try {
    body = await c.req.json<ExtractRequest>();
  } catch (err) {
    logger.warn("JSON parse failed on POST /v1/extract", { error: String(err) });
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await extractUrls(body);
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
