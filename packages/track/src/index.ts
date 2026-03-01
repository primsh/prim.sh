import { resolve } from "node:path";
import {
  createAgentStackMiddleware,
  createWalletAllowlistChecker,
  invalidRequest,
  notFound,
} from "@primsh/x402-middleware";
import type { ApiError } from "@primsh/x402-middleware";
import { createPrimApp } from "@primsh/x402-middleware/create-prim-app";
import type { TrackRequest } from "./api.ts";
import { trackPackage } from "./service.ts";

const TRACK_ROUTES = {
  "POST /v1/track": "$0.05",
} as const;

function providerError(message: string): ApiError {
  return { error: { code: "provider_error", message } };
}

function rateLimited(message: string): ApiError {
  return { error: { code: "rate_limited", message } };
}

const app = createPrimApp(
  {
    serviceName: "track.sh",
    llmsTxtPath: import.meta.dir
      ? resolve(import.meta.dir, "../../../site/track/llms.txt")
      : undefined,
    routes: TRACK_ROUTES,
    metricsName: "track.prim.sh",
  },
  { createAgentStackMiddleware, createWalletAllowlistChecker },
);

const logger = app.logger;

// POST /v1/track — look up a tracking number
app.post("/v1/track", async (c) => {
  let body: TrackRequest;
  try {
    body = await c.req.json<TrackRequest>();
  } catch (err) {
    logger.warn("JSON parse failed on POST /v1/track", { error: String(err) });
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await trackPackage(body);

  if (!result.ok) {
    if (result.code === "invalid_request") return c.json(invalidRequest(result.message), 400);
    if (result.code === "not_found") return c.json(notFound(result.message), 404);
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
