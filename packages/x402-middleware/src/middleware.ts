// SPDX-License-Identifier: Apache-2.0
import { HTTPFacilitatorClient, decodePaymentSignatureHeader } from "@x402/core/http";
import type { FacilitatorClient, RouteConfig } from "@x402/core/server";
import type { Network } from "@x402/core/types";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { paymentMiddlewareFromConfig } from "@x402/hono";
import type { SchemeRegistration } from "@x402/hono";
import type { MiddlewareHandler } from "hono";
import { verifySessionJwt } from "./jwt.js";
import { createLogger } from "./logger.js";
import { RateLimiter } from "./rate-limit.js";
import type {
  AgentStackMiddlewareOptions,
  AgentStackRouteConfig,
  CostCalculator,
  CreditLedger,
  RouteConfig as AgentStackRouteConfigEntry,
} from "./types.js";

const log = createLogger("x402-middleware", { module: "allowlist" });

const DEFAULT_NETWORK: Network = "eip155:8453";
const DEFAULT_FACILITATOR_URL = process.env.FACILITATOR_URL ?? "https://facilitator.payai.network";
const WALLET_ADDRESS_KEY = "walletAddress";
const WALLET_CHECK_TIMEOUT_MS = 2000;

/**
 * Creates a `checkAllowlist` callback that queries wallet.sh's internal API.
 * Fail-closed: on timeout or network error, denies access and logs a warning.
 *
 * Reads `PRIM_INTERNAL_KEY` from the environment and sends it as `x-internal-key`
 * header. Without this key, wallet.sh returns 401 on internal endpoints.
 *
 * @param walletInternalUrl - Base URL for wallet.sh internal API (e.g. "http://127.0.0.1:3001")
 */
export function createWalletAllowlistChecker(
  walletInternalUrl: string,
): (address: string) => Promise<boolean> {
  const internalKey = process.env.PRIM_INTERNAL_KEY;
  if (!internalKey) {
    log.warn("PRIM_INTERNAL_KEY not set — allowlist checks will fail");
  }

  return async (address: string): Promise<boolean> => {
    const url = `${walletInternalUrl}/internal/allowlist/check?address=${encodeURIComponent(address)}`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), WALLET_CHECK_TIMEOUT_MS);
      const headers: Record<string, string> = {};
      if (internalKey) {
        headers["x-internal-key"] = internalKey;
      }
      let res: Response;
      try {
        res = await fetch(url, { signal: controller.signal, headers });
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) {
        log.warn("wallet.sh allowlist check returned non-OK", { address, status: res.status });
        return false;
      }
      const body = (await res.json()) as { allowed: boolean };
      return body.allowed === true;
    } catch (err) {
      const reason = err instanceof Error && err.name === "AbortError" ? "timeout" : String(err);
      log.warn("wallet.sh allowlist check failed", { address, reason });
      return false;
    }
  };
}

/**
 * Per-request cache for estimated prices. Keyed by route pattern + request URL
 * to avoid cross-request contamination. The estimation middleware populates this
 * before x402 runs; the DynamicPrice function reads it.
 */
const estimateCache = new Map<string, string>();

/** Maps route patterns to their CostEstimator functions. */
const meteredEstimators = new Map<
  string,
  (c: Parameters<MiddlewareHandler>[0]) => Promise<string>
>();

function getEstimateCacheKey(pattern: string, requestId: string): string {
  return `${pattern}:${requestId}`;
}

/** Map of route pattern → static price string, used by credit check for static routes. */
const routePrices = new Map<string, string>();

/** Maps route patterns to their CostCalculator functions for post-response settlement. */
const routeCalculators = new Map<string, CostCalculator>();

function makeDynamicPriceReader(
  pattern: string,
): (ctx: { adapter: { getUrl: () => string } }) => string {
  return (ctx) => {
    const key = getEstimateCacheKey(pattern, ctx.adapter.getUrl());
    const cached = estimateCache.get(key);
    if (!cached) throw new Error(`No cached estimate for route "${pattern}"`);
    return cached;
  };
}

function normalizeRouteConfigEntry(
  pattern: string,
  value: string | AgentStackRouteConfigEntry,
  options: { payTo: string; network: Network; creditLedger?: CreditLedger },
): [string, RouteConfig] {
  const rawPrice = typeof value === "string" ? value : value.price;

  if (!rawPrice) {
    throw new Error(`Missing price for route "${pattern}"`);
  }

  const description = typeof value === "string" ? undefined : value.description;

  // Extract calculator for post-response settlement (MB-5)
  if (typeof value !== "string" && value.calculator) {
    routeCalculators.set(pattern, value.calculator);
  }

  // For function prices (CostEstimator): the estimation middleware runs the estimator
  // and stores the result in estimateCache before x402 runs. The DynamicPrice function
  // retrieves it via the request URL as a correlation key.
  let price: string | ((ctx: { adapter: { getUrl: () => string } }) => string);
  if (typeof rawPrice === "function") {
    meteredEstimators.set(pattern, rawPrice);
    price = makeDynamicPriceReader(pattern);
  } else if (options.creditLedger) {
    // When credit ledger is active, static routes also use DynamicPrice so the
    // credit check can reduce the price by mutating the estimate cache.
    routePrices.set(pattern, rawPrice);
    price = makeDynamicPriceReader(pattern);
  } else {
    routePrices.set(pattern, rawPrice);
    price = rawPrice;
  }

  return [
    pattern,
    {
      accepts: {
        scheme: "exact",
        network: options.network,
        payTo: options.payTo,
        price,
      },
      description,
    },
  ];
}

function buildAllowlist(options: AgentStackMiddlewareOptions): Set<string> | null {
  const raw: string[] = [];

  if (options.allowlist && options.allowlist.length > 0) {
    raw.push(...options.allowlist);
  }

  const envVar = process.env.PRIM_ALLOWLIST;
  if (envVar && envVar.trim().length > 0) {
    raw.push(
      ...envVar
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }

  if (raw.length === 0) return null;

  return new Set(raw.map((addr) => addr.toLowerCase()));
}

export function createAgentStackMiddleware(
  options: AgentStackMiddlewareOptions,
  routes: AgentStackRouteConfig,
): MiddlewareHandler {
  const network: Network = (options.network ?? DEFAULT_NETWORK) as Network;
  const facilitatorUrl = options.facilitatorUrl ?? DEFAULT_FACILITATOR_URL;
  const freeRoutes = new Set(options.freeRoutes ?? []);
  const identityRoutes = new Set(options.identityRoutes ?? []);
  const allowlist = buildAllowlist(options);
  const accessUrl = options.accessUrl ?? process.env.PRIM_ACCESS_URL;
  const rateLimiter = options.rateLimit
    ? new RateLimiter(typeof options.rateLimit === "object" ? options.rateLimit : {})
    : null;

  const creditLedger = options.creditLedger ?? null;

  const effectiveRoutes: Record<string, RouteConfig> = {};

  for (const [pattern, value] of Object.entries(routes)) {
    if (freeRoutes.has(pattern)) {
      continue;
    }

    const [routeKey, config] = normalizeRouteConfigEntry(pattern, value, {
      payTo: options.payTo,
      network,
      creditLedger: creditLedger ?? undefined,
    });

    effectiveRoutes[routeKey] = config;
  }

  function extractWalletAddress(c: Parameters<MiddlewareHandler>[0]) {
    const header = c.req.header("payment-signature") ?? c.req.header("x-payment");

    if (!header) return;

    try {
      const decoded = decodePaymentSignatureHeader(header) as {
        payload?: { authorization?: { from?: string } };
        authorization?: { from?: string };
        from?: string;
      };

      const from =
        decoded.payload?.authorization?.from ?? decoded.authorization?.from ?? decoded.from;

      if (typeof from === "string") {
        c.set(WALLET_ADDRESS_KEY, from);
      }
    } catch {
      // Malformed payment header — ignore and proceed without walletAddress
    }
  }

  async function denyWallet(c: Parameters<MiddlewareHandler>[0]): Promise<boolean> {
    if (!allowlist && !options.checkAllowlist) return false;
    const wallet = c.get(WALLET_ADDRESS_KEY) as string | undefined;
    if (!wallet) return false; // No payment header yet — let x402 return 402
    const lower = wallet.toLowerCase();
    if (allowlist?.has(lower)) return false; // Static allowlist fast path
    if (options.checkAllowlist) return !(await options.checkAllowlist(lower));
    // Static allowlist exists but wallet not found
    return true;
  }

  function getRouteKey(c: Parameters<MiddlewareHandler>[0]): string {
    return `${c.req.method} ${new URL(c.req.url).pathname}`;
  }

  async function tryJwtAuth(c: Parameters<MiddlewareHandler>[0]): Promise<boolean> {
    const authHeader = c.req.header("authorization");
    if (!authHeader?.startsWith("Bearer ")) return false;
    const token = authHeader.slice(7);
    const result = await verifySessionJwt(token);
    if (!result.ok) return false;
    c.set(WALLET_ADDRESS_KEY, result.data.address);
    return true;
  }

  function checkRateLimit(c: Parameters<MiddlewareHandler>[0]): Response | null {
    if (!rateLimiter) return null;
    const wallet = c.get(WALLET_ADDRESS_KEY) as string | undefined;
    if (!wallet) return null; // No wallet yet — let x402 handle 402
    const result = rateLimiter.check(wallet);
    c.header("X-RateLimit-Limit", String(rateLimiter.max));
    c.header("X-RateLimit-Remaining", String(result.remaining));
    c.header("X-RateLimit-Reset", String(Math.ceil(result.resetMs / 1000)));
    if (!result.allowed) {
      return c.json(
        {
          error: "rate_limited",
          message: "Too many requests. Try again later.",
          retry_after: Math.ceil(result.resetMs / 1000),
        },
        429,
      );
    }
    return null;
  }

  /** Strip leading "$" from price strings (e.g. "$0.005" → "0.005"). */
  function parsePrice(price: string): number {
    return Number.parseFloat(price.replace(/^\$/, ""));
  }

  /**
   * Check credit balance. Returns:
   * - "skip"    — full credit covers the request, deducted. Caller calls next() directly.
   * - "reduced" — partial credit deducted, estimate cache updated. Caller calls payment().
   * - null      — no credit. Caller calls payment().
   */
  function checkCredit(
    c: Parameters<MiddlewareHandler>[0],
    routeKey: string,
    cacheKey: string,
  ): "skip" | "reduced" | null {
    if (!creditLedger) return null;
    const wallet = c.get(WALLET_ADDRESS_KEY) as string | undefined;
    if (!wallet) return null;

    const rawPrice = (c.get("estimatedPrice") as string | undefined) ?? routePrices.get(routeKey);
    if (!rawPrice) return null;

    const priceNum = parsePrice(rawPrice);
    if (Number.isNaN(priceNum) || priceNum <= 0) return null;

    const balance = creditLedger.getBalance(wallet);
    const balanceNum = Number.parseFloat(balance);

    if (balanceNum <= 0) return null;

    const requestId = c.get("requestId") as string | undefined;
    const priceStr = priceNum.toFixed(6);

    if (balanceNum >= priceNum) {
      creditLedger.deductCredit(wallet, priceStr, requestId);
      c.set("paidVia" as never, "credit");
      c.set("estimatedPrice", rawPrice);
      return "skip";
    }

    creditLedger.deductCredit(wallet, balance, requestId);
    const scale = 1_000_000;
    const reduced = `$${((Math.round(priceNum * scale) - Math.round(balanceNum * scale)) / scale).toFixed(6)}`;
    estimateCache.set(cacheKey, reduced);
    c.set("paidVia" as never, "partial");
    return "reduced";
  }

  /**
   * Post-response settlement: if the route has a CostCalculator, compute the
   * actual cost and reconcile with the credit ledger. Sets X-Prim-* headers
   * on non-streaming responses.
   */
  /**
   * Post-response settlement. For streaming responses with a usagePromise,
   * settlement is deferred until the stream ends to avoid deadlocking — the
   * middleware must return the response before the client can consume it, so
   * we cannot await stream completion inline.
   */
  async function settleResponse(
    c: Parameters<MiddlewareHandler>[0],
    routeKey: string,
  ): Promise<void> {
    if (!creditLedger) return;
    const calculator = routeCalculators.get(routeKey);
    if (!calculator) return;
    if (!c.res || c.res.status === 402) return;
    const wallet = c.get(WALLET_ADDRESS_KEY) as string | undefined;
    if (!wallet) return;
    const estimated = c.get("estimatedPrice") as string | undefined;
    if (!estimated) return;
    const requestId = c.get("requestId") as string | undefined;

    const estimatedNum = parsePrice(estimated);
    const estimatedStr = estimatedNum.toFixed(6);

    const isStreaming = c.res.headers.get("content-type")?.includes("text/event-stream");

    if (c.res.status >= 400) {
      creditLedger.settle(wallet, estimatedStr, "0.000000", requestId);
      if (!isStreaming) {
        c.header("X-Prim-Cost", "0.000000");
        c.header("X-Prim-Estimated", estimatedStr);
        c.header("X-Prim-Credit", creditLedger.getBalance(wallet));
      }
      return;
    }

    // For streaming: the usagePromise resolves after the client consumes the
    // stream. Awaiting it here would deadlock (response can't be sent while
    // the middleware blocks). Instead, schedule settlement to run after the
    // stream completes.
    const usagePromise = c.get("usagePromise" as never) as Promise<unknown> | undefined;
    if (isStreaming && usagePromise) {
      usagePromise
        .then(async () => {
          const rawActual = await calculator(c, c.res);
          const actualStr = parsePrice(rawActual).toFixed(6);
          creditLedger.settle(wallet, estimatedStr, actualStr, requestId);
        })
        .catch(() => {
          // Stream errored — settle at estimated cost (no refund)
          creditLedger.settle(wallet, estimatedStr, estimatedStr, requestId);
        });
      return;
    }

    // Non-streaming: safe to await inline
    if (usagePromise) {
      await usagePromise;
    }
    const rawActual = await calculator(c, c.res);
    const actualStr = parsePrice(rawActual).toFixed(6);
    creditLedger.settle(wallet, estimatedStr, actualStr, requestId);

    if (!isStreaming) {
      c.header("X-Prim-Cost", actualStr);
      c.header("X-Prim-Estimated", estimatedStr);
      c.header("X-Prim-Credit", creditLedger.getBalance(wallet));
    }
  }

  if (Object.keys(effectiveRoutes).length === 0) {
    return async (c: Parameters<MiddlewareHandler>[0], next: Parameters<MiddlewareHandler>[1]) => {
      // For identity routes, try JWT auth first
      if (identityRoutes.has(getRouteKey(c))) {
        if (await tryJwtAuth(c)) {
          const rateLimitResponse = checkRateLimit(c);
          if (rateLimitResponse) return rateLimitResponse;
          await next();
          return;
        }
      }
      extractWalletAddress(c);
      if (await denyWallet(c)) {
        return c.json(
          {
            error: "wallet_not_allowed",
            message: accessUrl
              ? `This service is in private beta. Request access via ${accessUrl}`
              : "This service is in private beta",
            ...(accessUrl && { access_url: accessUrl }),
          },
          403,
        );
      }
      const rateLimitResponse = checkRateLimit(c);
      if (rateLimitResponse) return rateLimitResponse;
      await next();
    };
  }

  const facilitatorClient: FacilitatorClient = new HTTPFacilitatorClient({
    url: facilitatorUrl,
  });
  const schemes: SchemeRegistration[] = [{ network, server: new ExactEvmScheme() }];
  const payment = paymentMiddlewareFromConfig(effectiveRoutes, facilitatorClient, schemes);

  return async (c, next) => {
    // For identity routes, try JWT auth first — skip x402 if valid
    if (identityRoutes.has(getRouteKey(c))) {
      if (await tryJwtAuth(c)) {
        const rateLimitResponse = checkRateLimit(c);
        if (rateLimitResponse) return rateLimitResponse;
        await next();
        return;
      }
    }
    extractWalletAddress(c);
    if (await denyWallet(c)) {
      return c.json(
        {
          error: "wallet_not_allowed",
          message: accessUrl
            ? `This service is in private beta. Request access via ${accessUrl}`
            : "This service is in private beta",
          ...(accessUrl && { access_url: accessUrl }),
        },
        403,
      );
    }
    const rateLimitResponse = checkRateLimit(c);
    if (rateLimitResponse) return rateLimitResponse;

    // Run cost estimation for metered routes before x402 payment gate
    const routeKey = getRouteKey(c);
    const estimator = meteredEstimators.get(routeKey);
    const cacheKey = getEstimateCacheKey(routeKey, c.req.url);

    // Wrap next() to run settlement after the handler completes
    const nextWithSettlement = async () => {
      await next();
      await settleResponse(c, routeKey);
    };

    if (estimator) {
      const estimate = await estimator(c);
      estimateCache.set(cacheKey, estimate);
      c.set("estimatedPrice", estimate);
      try {
        const credit = checkCredit(c, routeKey, cacheKey);
        if (credit === "skip") {
          await nextWithSettlement();
          return;
        }
        return await payment(c, nextWithSettlement);
      } finally {
        estimateCache.delete(cacheKey);
      }
    }

    // Static route: populate cache if credit ledger needs dynamic pricing
    if (creditLedger && routePrices.has(routeKey)) {
      const staticPrice = routePrices.get(routeKey)!;
      estimateCache.set(cacheKey, staticPrice);
      try {
        const credit = checkCredit(c, routeKey, cacheKey);
        if (credit === "skip") {
          await nextWithSettlement();
          return;
        }
        return await payment(c, nextWithSettlement);
      } finally {
        estimateCache.delete(cacheKey);
      }
    }

    return payment(c, nextWithSettlement);
  };
}
