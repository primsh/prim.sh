import { Hono } from "hono";
import { createAgentStackMiddleware, getNetworkConfig } from "@primsh/x402-middleware";
import type { SearchRequest, ExtractRequest, ApiError } from "./api.ts";
import { searchWeb, searchNews, extractUrls } from "./service.ts";

const networkConfig = getNetworkConfig();
const PAY_TO_ADDRESS = process.env.PRIM_PAY_TO ?? "0x0000000000000000000000000000000000000000";
const NETWORK = networkConfig.network;

const SEARCH_ROUTES = {
  "POST /v1/search": "$0.01",
  "POST /v1/search/news": "$0.01",
  "POST /v1/extract": "$0.005",
} as const;

function invalidRequest(message: string): ApiError {
  return { error: { code: "invalid_request", message } };
}

function providerError(message: string): ApiError {
  return { error: { code: "provider_error", message } };
}

function rateLimited(message: string): ApiError {
  return { error: { code: "rate_limited", message } };
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
    { ...SEARCH_ROUTES },
  ),
);

// GET / — health check (free)
app.get("/", (c) => {
  return c.json({ service: "search.sh", status: "ok" });
});

// POST /v1/search — Web search
app.post("/v1/search", async (c) => {
  let body: SearchRequest;
  try {
    body = await c.req.json<SearchRequest>();
  } catch {
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
  } catch {
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
  } catch {
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
