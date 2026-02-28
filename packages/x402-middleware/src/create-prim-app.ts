/**
 * createPrimApp — shared factory for all prim.sh primitives.
 *
 * Wires standard middleware (requestId, bodyLimit, metrics, x402) so each
 * primitive's index.ts only needs to declare its routes config and add its
 * domain-specific handlers.
 *
 * Config flags:
 *   freeService    — skip PRIM_PAY_TO validation + x402 middleware (faucet.sh)
 *   skipX402       — skip x402 middleware; caller wires its own (wallet.sh)
 *   skipBodyLimit  — skip default 1 MB bodyLimit; caller wires conditional limit (store.sh)
 *   skipHealthCheck — skip the default GET / health check; caller registers custom one (faucet.sh)
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createLogger } from "./logger.js";
import { feedbackUrlMiddleware } from "./feedback-url.js";
import { metricsHandler, metricsMiddleware } from "./metrics.js";
import { createAgentStackMiddleware, createWalletAllowlistChecker } from "./middleware.js";
import { getNetworkConfig } from "./network-config.js";
import { requestIdMiddleware } from "./request-id.js";
import type { AgentStackRouteConfig } from "./types.js";

export type AppVariables = { walletAddress: string | undefined };

export interface PrimAppDeps {
  createAgentStackMiddleware?: typeof createAgentStackMiddleware;
  createWalletAllowlistChecker?: typeof createWalletAllowlistChecker;
}

export interface PrimAppConfig {
  /** Service name, e.g. "wallet.sh" */
  serviceName: string;
  /**
   * Absolute path to the prim's llms.txt file.
   * Optional: if undefined (e.g. import.meta.dir is unavailable under vitest), /llms.txt returns empty body.
   */
  llmsTxtPath?: string;
  /** Paid route map passed to createAgentStackMiddleware */
  routes: AgentStackRouteConfig;
  /** Additional free routes beyond the standard set (GET /, GET /llms.txt, GET /pricing, GET /v1/metrics) */
  extraFreeRoutes?: string[];
  /** Metrics service hostname, e.g. "wallet.prim.sh" */
  metricsName: string;
  /** Pricing data for GET /pricing endpoint */
  pricing?: {
    currency?: string;
    network?: string;
    routes: Array<{
      method: string;
      path: string;
      price_usdc: string;
      description: string;
    }>;
  };
  /**
   * Skip PRIM_PAY_TO validation + x402 middleware entirely.
   * Use for free-service primitives (faucet.sh).
   */
  freeService?: boolean;
  /**
   * Skip x402 middleware registration.
   * Use when the primitive wires its own x402 (wallet.sh).
   */
  skipX402?: boolean;
  /**
   * Skip the default 1 MB bodyLimit middleware.
   * Use when the primitive needs a conditional body limit (store.sh).
   */
  skipBodyLimit?: boolean;
  /**
   * Skip the default GET / health check route.
   * Use when the primitive registers a custom health check response (faucet.sh).
   */
  skipHealthCheck?: boolean;
  /** URL for feedback submission. Defaults to PRIM_FEEDBACK_URL env var. */
  feedbackUrl?: string;
}

/**
 * Build a pre-wired Hono app with standard prim.sh middleware stack.
 *
 * Middleware order (unless skipped):
 *   1.   requestIdMiddleware
 *   1.5. feedbackUrlMiddleware (when PRIM_FEEDBACK_URL or config.feedbackUrl is set)
 *   2.   bodyLimit (1 MB)
 *   3.   metricsMiddleware
 *   4.   createAgentStackMiddleware (x402 payment gate)
 *   5. GET /           — health check
 *   6. GET /llms.txt   — LLM-readable spec
 *   7. GET /v1/metrics — operational metrics
 *   8. GET /pricing    — pricing table (if config.pricing provided)
 *
 * Returns the Hono app. Callers add their domain-specific routes after.
 */
export function createPrimApp(
  config: PrimAppConfig,
  deps: PrimAppDeps = {},
): Hono<{ Variables: AppVariables }> {
  const {
    serviceName,
    llmsTxtPath,
    routes,
    extraFreeRoutes = [],
    metricsName,
    pricing,
    freeService = false,
    skipX402 = false,
    skipBodyLimit = false,
    skipHealthCheck = false,
    feedbackUrl,
  } = config;

  const _createAgentStackMiddleware = deps.createAgentStackMiddleware ?? createAgentStackMiddleware;
  const _createWalletAllowlistChecker =
    deps.createWalletAllowlistChecker ?? createWalletAllowlistChecker;

  const LLMS_TXT = llmsTxtPath && existsSync(llmsTxtPath) ? readFileSync(llmsTxtPath, "utf-8") : "";
  const logger = createLogger(serviceName);

  // Validate PRIM_PAY_TO unless this is a free service
  if (!freeService) {
    const PAY_TO_ADDRESS = process.env.PRIM_PAY_TO;
    if (!PAY_TO_ADDRESS) {
      throw new Error(`[${serviceName}] PRIM_PAY_TO environment variable is required`);
    }
  }

  const app = new Hono<{ Variables: AppVariables }>();

  // 1. Request ID
  app.use("*", requestIdMiddleware());

  // 1.5. Feedback URL header
  const resolvedFeedbackUrl = feedbackUrl ?? process.env.PRIM_FEEDBACK_URL;
  if (resolvedFeedbackUrl) {
    app.use("*", feedbackUrlMiddleware(resolvedFeedbackUrl));
  }

  // 2. Body size limit (1 MB) — unless caller wants to wire its own
  if (!skipBodyLimit) {
    app.use(
      "*",
      bodyLimit({
        maxSize: 1024 * 1024,
        onError: (c) => c.json({ error: "Request too large" }, 413),
      }),
    );
  }

  // 3. Metrics collection
  app.use("*", metricsMiddleware());

  // 4. x402 payment gate — unless freeService or skipX402
  if (!freeService && !skipX402) {
    const PAY_TO_ADDRESS = process.env.PRIM_PAY_TO as string;
    const networkConfig = getNetworkConfig();
    const NETWORK = networkConfig.network;
    const WALLET_INTERNAL_URL = process.env.WALLET_INTERNAL_URL ?? "http://127.0.0.1:3001";
    const checkAllowlist = _createWalletAllowlistChecker(WALLET_INTERNAL_URL);

    const standardFreeRoutes = [
      "GET /",
      "GET /llms.txt",
      "GET /pricing",
      "GET /v1/metrics",
      ...extraFreeRoutes,
    ];

    app.use(
      "*",
      _createAgentStackMiddleware(
        {
          payTo: PAY_TO_ADDRESS,
          network: NETWORK,
          freeRoutes: standardFreeRoutes,
          checkAllowlist,
        },
        { ...routes },
      ),
    );
  }

  // 5. Standard free routes
  if (!skipHealthCheck) {
    app.get("/", (c) => {
      return c.json({ service: serviceName, status: "ok" });
    });
  }

  app.get("/llms.txt", (c) => {
    c.header("Content-Type", "text/plain; charset=utf-8");
    return c.body(LLMS_TXT);
  });

  app.get("/v1/metrics", metricsHandler(metricsName));

  if (pricing) {
    const pricingResponse = {
      service: metricsName,
      currency: pricing.currency ?? "USDC",
      network: pricing.network ?? "eip155:8453",
      routes: pricing.routes,
    };
    app.get("/pricing", (c) => c.json(pricingResponse));
  }

  // Expose logger so callers can use the same logger instance
  (app as Hono<{ Variables: AppVariables }> & { logger: ReturnType<typeof createLogger> }).logger =
    logger;

  return app;
}
