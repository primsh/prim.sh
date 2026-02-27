/**
 * createPrimApp() — shared factory for prim service entry points.
 *
 * Handles the ~70-line boilerplate every prim repeats:
 *   - env validation (PRIM_PAY_TO)
 *   - middleware wiring (requestId, bodyLimit, optional metrics, x402)
 *   - health check route (GET /)
 *   - llms.txt route (GET /llms.txt) if the file exists
 *   - optional metrics route (GET /v1/metrics)
 *   - optional pricing route (GET /pricing)
 *
 * What stays in each prim's index.ts: domain-specific route handlers only.
 *
 * ## Testability
 *
 * The factory accepts `createAgentStackMiddleware` and `createWalletAllowlistChecker`
 * as injected deps so that vitest mocks applied to `@primsh/x402-middleware` propagate
 * into the factory call. Each prim's index.ts imports them from `@primsh/x402-middleware`
 * and passes them through.
 */

import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getNetworkConfig } from "./network-config.js";
import { metricsMiddleware, metricsHandler } from "./metrics.js";
import { requestIdMiddleware } from "./request-id.js";
import type { createAgentStackMiddleware as _createAgentStackMiddleware } from "./middleware.js";
import type { createWalletAllowlistChecker as _createWalletAllowlistChecker } from "./middleware.js";
import type { AgentStackRouteConfig } from "./types.ts";
import type { ApiError } from "./errors.ts";

export type { ApiError };

/** A single entry in the /pricing response */
export interface PricingRoute {
  method: string;
  path: string;
  price_usdc: string;
  description: string;
}

export interface PrimAppConfig {
  /** Prim display name, e.g. "track.sh". Used in health check and logger. */
  name: string;
  /**
   * Paid route map. Keys are "METHOD /path", values are price strings e.g. "$0.05".
   * Same shape as AgentStackRouteConfig.
   */
  routes: AgentStackRouteConfig;
  /**
   * Additional free routes beyond the built-in defaults (GET /, GET /llms.txt).
   * Pass extra routes here if metrics or pricing routes need to be free.
   * Defaults computed automatically when metrics/pricing are enabled.
   */
  freeRoutes?: string[];
  /** Body size limit in bytes. Default: 1 MB. */
  maxBodySize?: number;
  /**
   * Enable metricsMiddleware + GET /v1/metrics handler.
   * Default: false.
   */
  metrics?: boolean;
  /**
   * Pricing data for GET /pricing response.
   * When provided, the /pricing route is registered (free).
   */
  pricing?: PricingRoute[];
}

/**
 * Injectable middleware deps for testability.
 * Each prim imports these from `@primsh/x402-middleware` so that vitest mocks propagate.
 */
export interface PrimAppDeps {
  createAgentStackMiddleware: typeof _createAgentStackMiddleware;
  createWalletAllowlistChecker: typeof _createWalletAllowlistChecker;
}

export type AppVariables = { walletAddress: string | undefined };

/** Shared error helpers — identical across all prims. */
export function providerError(message: string): ApiError {
  return { error: { code: "provider_error", message } };
}

export function rateLimited(message: string): ApiError {
  return { error: { code: "rate_limited", message } };
}

/**
 * Creates a pre-wired Hono app for a prim service.
 *
 * The returned app has all standard middleware and shared routes registered.
 * Callers add their domain-specific route handlers after calling this function,
 * then `export default app`.
 *
 * @param config - Service config (name, routes, options)
 * @param deps - Injectable middleware functions (import from `@primsh/x402-middleware` in your index.ts)
 */
export function createPrimApp(
  config: PrimAppConfig,
  deps: PrimAppDeps,
): Hono<{ Variables: AppVariables }> {
  const { createAgentStackMiddleware, createWalletAllowlistChecker } = deps;

  // ── env validation ─────────────────────────────────────────────────────────
  const PAY_TO_ADDRESS = process.env.PRIM_PAY_TO;
  if (!PAY_TO_ADDRESS) {
    throw new Error(`[${config.name}] PRIM_PAY_TO environment variable is required`);
  }

  const networkConfig = getNetworkConfig();
  const NETWORK = networkConfig.network;

  const WALLET_INTERNAL_URL =
    process.env.WALLET_INTERNAL_URL ?? "http://127.0.0.1:3001";
  const checkAllowlist = createWalletAllowlistChecker(WALLET_INTERNAL_URL);

  // ── llms.txt loading (optional — skip if file not found) ───────────────────
  // Factory file is at packages/x402-middleware/src/create-prim-app.ts.
  // site/ is at the workspace root: <factory-dir>/../../../site/<id>/llms.txt
  const _dir = dirname(fileURLToPath(import.meta.url));
  const id = config.name.replace(/\.sh$/, "");
  const llmsTxtPath = resolve(_dir, "../../../site", id, "llms.txt");
  const llmsTxt = existsSync(llmsTxtPath)
    ? readFileSync(llmsTxtPath, "utf-8")
    : null;

  // ── computed free routes ───────────────────────────────────────────────────
  const builtinFreeRoutes = ["GET /", "GET /llms.txt"];
  if (config.metrics) builtinFreeRoutes.push("GET /v1/metrics");
  if (config.pricing) builtinFreeRoutes.push("GET /pricing");
  const allFreeRoutes = [
    ...builtinFreeRoutes,
    ...(config.freeRoutes ?? []),
  ];

  // ── app construction ───────────────────────────────────────────────────────
  const app = new Hono<{ Variables: AppVariables }>();

  app.use("*", requestIdMiddleware());

  app.use(
    "*",
    bodyLimit({
      maxSize: config.maxBodySize ?? 1024 * 1024,
      onError: (c) => c.json({ error: "Request too large" }, 413),
    }),
  );

  if (config.metrics) {
    app.use("*", metricsMiddleware());
  }

  app.use(
    "*",
    createAgentStackMiddleware(
      {
        payTo: PAY_TO_ADDRESS,
        network: NETWORK,
        freeRoutes: allFreeRoutes,
        checkAllowlist,
      },
      { ...config.routes },
    ),
  );

  // ── shared routes ──────────────────────────────────────────────────────────

  // GET / — health check (free)
  app.get("/", (c) => {
    return c.json({ service: config.name, status: "ok" });
  });

  // GET /llms.txt — machine-readable API reference (free)
  if (llmsTxt !== null) {
    app.get("/llms.txt", (c) => {
      c.header("Content-Type", "text/plain; charset=utf-8");
      return c.body(llmsTxt);
    });
  }

  // GET /v1/metrics — operational metrics (free)
  if (config.metrics) {
    const serviceDomain = config.name.replace(/\.sh$/, ".prim.sh");
    app.get("/v1/metrics", metricsHandler(serviceDomain));
  }

  // GET /pricing — machine-readable pricing (free)
  if (config.pricing) {
    const serviceDomain = config.name.replace(/\.sh$/, ".prim.sh");
    const pricingData = config.pricing;
    app.get("/pricing", (c) => {
      return c.json({
        service: serviceDomain,
        currency: "USDC",
        network: "eip155:8453",
        routes: pricingData,
      });
    });
  }

  return app;
}
