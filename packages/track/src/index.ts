import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

const LLMS_TXT = import.meta.dir
  ? readFileSync(resolve(import.meta.dir, "../../../site/track/llms.txt"), "utf-8")
  : "";
import {
  createAgentStackMiddleware,
  createLogger,
  createWalletAllowlistChecker,
  getNetworkConfig,
  invalidRequest,
  notFound,
  requestIdMiddleware,
} from "@primsh/x402-middleware";
import type { ApiError } from "@primsh/x402-middleware";
import type { TrackRequest } from "./api.ts";
import { trackPackage } from "./service.ts";

const logger = createLogger("track.sh");

const networkConfig = getNetworkConfig();
const PAY_TO_ADDRESS = process.env.PRIM_PAY_TO;
if (!PAY_TO_ADDRESS) {
  throw new Error("[track.sh] PRIM_PAY_TO environment variable is required");
}
const NETWORK = networkConfig.network;
const WALLET_INTERNAL_URL = process.env.WALLET_INTERNAL_URL ?? "http://127.0.0.1:3001";
const checkAllowlist = createWalletAllowlistChecker(WALLET_INTERNAL_URL);

const TRACK_ROUTES = {
  "POST /v1/track": "$0.05",
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

app.use(
  "*",
  createAgentStackMiddleware(
    {
      payTo: PAY_TO_ADDRESS,
      network: NETWORK,
      freeRoutes: ["GET /", "GET /llms.txt"],
      checkAllowlist,
    },
    { ...TRACK_ROUTES },
  ),
);

// GET / — health check (free)
app.get("/", (c) => {
  return c.json({ service: "track.sh", status: "ok" });
});

// GET /llms.txt — machine-readable API reference (free)
app.get("/llms.txt", (c) => {
  c.header("Content-Type", "text/plain; charset=utf-8");
  return c.body(LLMS_TXT);
});

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
