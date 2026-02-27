import {
  createPrimApp,
  createAgentStackMiddleware,
  createWalletAllowlistChecker,
  providerError,
  rateLimited,
  invalidRequest,
  createLogger,
} from "@primsh/x402-middleware";
import type { SearchRequest, ExtractRequest } from "./api.ts";
import { searchWeb, searchNews, extractUrls } from "./service.ts";

const logger = createLogger("search.sh");

const app = createPrimApp(
  {
    name: "search.sh",
    routes: {
      "POST /v1/search": "$0.01",
      "POST /v1/search/news": "$0.01",
      "POST /v1/extract": "$0.005",
    },
    metrics: true,
    pricing: [
      { method: "POST", path: "/v1/search", price_usdc: "0.01", description: "Web search" },
      { method: "POST", path: "/v1/search/news", price_usdc: "0.01", description: "News search" },
      { method: "POST", path: "/v1/extract", price_usdc: "0.005", description: "URL content extraction" },
    ],
  },
  { createAgentStackMiddleware, createWalletAllowlistChecker },
);

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
