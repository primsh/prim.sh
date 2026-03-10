// SPDX-License-Identifier: Apache-2.0
/**
 * createPrimApp — shared factory for all prim.sh primitives.
 *
 * Wires standard middleware (requestId, bodyLimit, metrics, x402) so each
 * primitive's index.ts only needs to declare its routes config and add its
 * domain-specific handlers.
 *
 * Config flags:
 *   freeService    — skip REVENUE_WALLET validation + x402 middleware (faucet.sh)
 *   skipX402       — skip x402 middleware; caller wires its own (wallet.sh)
 *   skipBodyLimit  — skip default 1 MB bodyLimit; caller wires conditional limit (store.sh)
 *   skipHealthCheck — skip the default GET / health check; caller registers custom one (faucet.sh)
 */

import { existsSync, readFileSync } from "node:fs";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Logger } from "./logger.js";
import { createLogger } from "./logger.js";
import { feedbackUrlMiddleware } from "./feedback-url.js";
import { metricsHandler, metricsMiddleware } from "./metrics.js";
import { createAgentStackMiddleware, createWalletAllowlistChecker } from "./middleware.js";
import { getNetworkConfig } from "./network-config.js";
import { requestIdMiddleware } from "./request-id.js";
import type { AgentStackRouteConfig, CreditLedger, MeteredConfig } from "./types.js";

export type AppVariables = { walletAddress: string | undefined };

export type PrimApp = Hono<{ Variables: AppVariables }> & {
  logger: Logger;
  /** Credit ledger instance, available when metered config is provided. */
  creditLedger?: CreditLedger;
};

export interface PrimAppDeps {
  createAgentStackMiddleware?: typeof createAgentStackMiddleware;
  createWalletAllowlistChecker?: typeof createWalletAllowlistChecker;
  /** Pre-initialized credit ledger for metered billing. Required when config.metered is set. */
  creditLedger?: CreditLedger;
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
   * Skip REVENUE_WALLET validation + x402 middleware entirely.
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
  /**
   * Skip access log middleware (SQLite-backed request logging).
   * Defaults to false. Set to true in tests to avoid SQLite dependency.
   */
  skipAccessLog?: boolean;
  /** URL for feedback submission. Defaults to PRIM_FEEDBACK_URL env var. */
  feedbackUrl?: string;
  /** Custom body size limit in bytes. Defaults to 1 MB. Ignored when skipBodyLimit is true. */
  bodyLimitBytes?: number;
  /**
   * Enable metered billing with a credit ledger.
   * When present: initializes credit ledger, wires credit check before x402,
   * adds GET /v1/credit free route, starts daily credit expiry interval.
   */
  metered?: MeteredConfig;
}

/**
 * Build a pre-wired Hono app with standard prim.sh middleware stack.
 *
 * Middleware order (unless skipped):
 *   1.   requestIdMiddleware
 *   2.   accessLogMiddleware (wraps next(), logs after response)
 *   2.5. feedbackUrlMiddleware (when PRIM_FEEDBACK_URL or config.feedbackUrl is set)
 *   3.   bodyLimit (1 MB)
 *   4.   metricsMiddleware
 *   5.   createAgentStackMiddleware (x402 payment gate)
 *   6. GET /           — health check
 *   7. GET /llms.txt   — LLM-readable spec
 *   8. GET /v1/metrics — operational metrics
 *   9. GET /pricing    — pricing table (if config.pricing provided)
 *
 * Returns the Hono app. Callers add their domain-specific routes after.
 */
export function createPrimApp(config: PrimAppConfig, deps: PrimAppDeps = {}): PrimApp {
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
    bodyLimitBytes,
    metered,
  } = config;

  const _createAgentStackMiddleware = deps.createAgentStackMiddleware ?? createAgentStackMiddleware;
  const _createWalletAllowlistChecker =
    deps.createWalletAllowlistChecker ?? createWalletAllowlistChecker;

  const LLMS_TXT = llmsTxtPath && existsSync(llmsTxtPath) ? readFileSync(llmsTxtPath, "utf-8") : "";
  const logger = createLogger(serviceName);

  // Initialize credit ledger for metered billing.
  // credit.ts uses bun:sqlite — load via variable-path dynamic import to prevent
  // vitest/vite from statically resolving it (same pattern as access-log).
  const creditLedger: CreditLedger | undefined = deps.creditLedger;
  if (metered && creditLedger) {
    const expiryDays = metered.creditExpiryDays ?? 30;
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const expiryInterval = setInterval(() => {
      try {
        const expired = creditLedger.expireInactive(expiryDays);
        if (expired > 0) {
          logger.info(`Expired ${expired} inactive credit balance(s)`);
        }
      } catch (err) {
        logger.error("Credit expiry failed", { error: String(err) });
      }
    }, ONE_DAY_MS);
    // Don't block process exit
    expiryInterval.unref();
  }

  // Validate REVENUE_WALLET unless this is a free service
  if (!freeService) {
    const PAY_TO_ADDRESS = process.env.REVENUE_WALLET;
    if (!PAY_TO_ADDRESS) {
      throw new Error(`[${serviceName}] REVENUE_WALLET environment variable is required`);
    }
  }

  const app = new Hono<{ Variables: AppVariables }>();

  // 1. Request ID
  app.use("*", requestIdMiddleware());

  // 2. Access log (wraps next(), captures response status + wallet after x402 runs)
  const skipAccessLog = config.skipAccessLog ?? !!process.env.VITEST;
  if (!skipAccessLog) {
    let accessLogHandler: MiddlewareHandler | undefined;
    // Module path as variable prevents vitest/vite from statically resolving bun:sqlite
    const accessLogModule = "./access-log.js";
    app.use("*", async (c, next) => {
      if (!accessLogHandler) {
        const mod = await import(/* @vite-ignore */ accessLogModule);
        accessLogHandler = mod.createAccessLogMiddleware(serviceName, {
          routes,
          network: getNetworkConfig().network,
        }) as MiddlewareHandler;
      }
      return accessLogHandler(c, next);
    });
  }

  // 2.5. Feedback URL header
  const resolvedFeedbackUrl = feedbackUrl ?? process.env.PRIM_FEEDBACK_URL;
  if (resolvedFeedbackUrl) {
    app.use("*", feedbackUrlMiddleware(resolvedFeedbackUrl));
  }

  // 3. Body size limit (1 MB) — unless caller wants to wire its own
  if (!skipBodyLimit) {
    app.use(
      "*",
      bodyLimit({
        maxSize: bodyLimitBytes ?? 1024 * 1024,
        onError: (c) => c.json({ error: "Request too large" }, 413),
      }),
    );
  }

  // 4. Metrics collection
  app.use("*", metricsMiddleware());

  // 5. x402 payment gate — unless freeService or skipX402
  if (!freeService && !skipX402) {
    const PAY_TO_ADDRESS = process.env.REVENUE_WALLET as string;
    const networkConfig = getNetworkConfig();
    const NETWORK = networkConfig.network;
    const WALLET_INTERNAL_URL = process.env.WALLET_INTERNAL_URL ?? "http://127.0.0.1:3001";
    const checkAllowlist = _createWalletAllowlistChecker(WALLET_INTERNAL_URL);

    const standardFreeRoutes = [
      "GET /",
      "GET /llms.txt",
      "GET /pricing",
      "GET /v1/metrics",
      "GET /internal/usage",
      ...extraFreeRoutes,
    ];

    // Add /v1/credit as a free route when metered billing is active
    if (creditLedger) {
      standardFreeRoutes.push("GET /v1/credit");
    }

    app.use(
      "*",
      _createAgentStackMiddleware(
        {
          payTo: PAY_TO_ADDRESS,
          network: NETWORK,
          freeRoutes: standardFreeRoutes,
          checkAllowlist,
          creditLedger,
        },
        { ...routes },
      ),
    );
  }

  // 6. Standard free routes
  if (!skipHealthCheck) {
    app.get("/", (c) => {
      return c.json({ service: serviceName, status: "ok", network: getNetworkConfig().network });
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

  // 10. Internal usage endpoint (access log query over HTTP)
  if (!skipAccessLog) {
    const usageModule = "./usage-endpoint.js";
    app.get("/internal/usage", async (c) => {
      const mod = await import(/* @vite-ignore */ usageModule);
      const handler = mod.createUsageHandler(serviceName);
      return handler(c);
    });
  }

  // Credit balance endpoint — free route, returns balance for a given wallet
  if (creditLedger) {
    app.get("/v1/credit", (c) => {
      const wallet = c.req.query("wallet");
      if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
        return c.json(
          { error: { code: "invalid_request", message: "Missing or invalid ?wallet=0x... param" } },
          400,
        );
      }
      const balance = creditLedger.getBalance(wallet);
      return c.json({ balance_usdc: balance, updated_at: new Date().toISOString() });
    });
  }

  // Expose logger and credit ledger so callers can use the same instances
  const primApp = app as PrimApp;
  primApp.logger = logger;
  if (creditLedger) {
    primApp.creditLedger = creditLedger;
  }

  return primApp;
}
