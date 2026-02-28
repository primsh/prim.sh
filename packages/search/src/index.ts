import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

const LLMS_TXT = import.meta.dir
  ? readFileSync(resolve(import.meta.dir, "../../../site/search/llms.txt"), "utf-8")
  : "";
import {
  ProviderRegistry,
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
import type { ExtractRequest, SearchRequest } from "./api.ts";
import type { ExtractProvider, SearchProvider } from "./provider.ts";
import { extractUrls, searchNews, searchWeb, setRegistry } from "./service.ts";
import { TavilyClient } from "./tavily.ts";

const logger = createLogger("search.sh");

const networkConfig = getNetworkConfig();
const PAY_TO_ADDRESS = process.env.PRIM_PAY_TO;
if (!PAY_TO_ADDRESS) {
  throw new Error("[search.sh] PRIM_PAY_TO environment variable is required");
}
const NETWORK = networkConfig.network;
const WALLET_INTERNAL_URL = process.env.WALLET_INTERNAL_URL ?? "http://127.0.0.1:3001";
const checkAllowlist = createWalletAllowlistChecker(WALLET_INTERNAL_URL);

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
      freeRoutes: [
        "GET /",
        "GET /pricing",
        "GET /llms.txt",
        "GET /v1/metrics",
        "GET /health/providers",
      ],
      checkAllowlist,
    },
    { ...SEARCH_ROUTES },
  ),
);

// GET / — health check (free)
app.get("/", (c) => {
  return c.json({ service: "search.sh", status: "ok" });
});

// GET /llms.txt — machine-readable API reference (free)
app.get("/llms.txt", (c) => {
  c.header("Content-Type", "text/plain; charset=utf-8");
  return c.body(LLMS_TXT);
});

// GET /v1/metrics — operational metrics (free)
app.get("/v1/metrics", metricsHandler("search.prim.sh"));

// GET /pricing — machine-readable pricing (free)
app.get("/pricing", (c) => {
  return c.json({
    service: "search.prim.sh",
    currency: "USDC",
    network: "eip155:8453",
    routes: [
      { method: "POST", path: "/v1/search", price_usdc: "0.01", description: "Web search" },
      { method: "POST", path: "/v1/search/news", price_usdc: "0.01", description: "News search" },
      {
        method: "POST",
        path: "/v1/extract",
        price_usdc: "0.005",
        description: "URL content extraction",
      },
    ],
  });
});

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
