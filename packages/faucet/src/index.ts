import { Hono } from "hono";
import { isAddress, getAddress } from "viem";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const _dir = import.meta.dir ?? dirname(fileURLToPath(import.meta.url));

const LLMS_TXT = readFileSync(
  resolve(_dir, "../../../site/faucet/llms.txt"), "utf-8"
);
import { getNetworkConfig, createWalletAllowlistChecker, createLogger, metricsMiddleware, metricsHandler, requestIdMiddleware } from "@primsh/x402-middleware";
import { RateLimiter } from "./rate-limit.ts";
import { dripUsdc, dripEth } from "./service.ts";

const logger = createLogger("faucet.sh");

const WALLET_INTERNAL_URL = process.env.WALLET_INTERNAL_URL ?? "http://127.0.0.1:3001";
const checkAllowlist = createWalletAllowlistChecker(WALLET_INTERNAL_URL);

const app = new Hono();

app.use("*", requestIdMiddleware());

app.use("*", metricsMiddleware());

app.get("/v1/metrics", metricsHandler("faucet.prim.sh"));

// Rate limiters (SQLite-backed, persist across restarts)
const usdcLimiter = new RateLimiter("usdc", 2 * 60 * 60 * 1000); // 2 hours
const ethLimiter = new RateLimiter("eth", 60 * 60 * 1000); // 1 hour

// Testnet guard — refuse to serve on mainnet
app.use("*", async (c, next) => {
  // Allow health check and pricing on any network
  if (c.req.method === "GET" && (c.req.path === "/" || c.req.path === "/pricing" || c.req.path === "/llms.txt" || c.req.path === "/v1/metrics")) {
    return next();
  }

  const config = getNetworkConfig();
  if (!config.isTestnet) {
    return c.json(
      { error: { code: "mainnet_rejected", message: "faucet.sh only operates on testnet" } },
      403,
    );
  }
  return next();
});

// GET /llms.txt — machine-readable API reference (free)
app.get("/llms.txt", (c) => {
  c.header("Content-Type", "text/plain; charset=utf-8");
  return c.body(LLMS_TXT);
});

// GET / — Health check
app.get("/", (c) => {
  const config = getNetworkConfig();
  return c.json({
    service: "faucet.sh",
    status: "ok",
    network: config.network,
    testnet: config.isTestnet,
  });
});

// GET /pricing — machine-readable pricing (free)
app.get("/pricing", (c) => {
  return c.json({
    service: "faucet.prim.sh",
    currency: "USDC",
    network: "eip155:8453",
    routes: [
      { method: "POST", path: "/v1/faucet/usdc", price_usdc: "0", description: "Dispense test USDC (free, rate-limited)" },
      { method: "POST", path: "/v1/faucet/eth", price_usdc: "0", description: "Dispense test ETH (free, rate-limited)" },
      { method: "GET", path: "/v1/faucet/status", price_usdc: "0", description: "Rate limit status" },
    ],
  });
});

// POST /v1/faucet/usdc — Dispense test USDC
app.post("/v1/faucet/usdc", async (c) => {
  let address: string;
  try {
    const body = await c.req.json<{ address?: string }>();
    if (!body.address || !isAddress(body.address)) {
      return c.json(
        { error: { code: "invalid_request", message: "Valid address required" } },
        400,
      );
    }
    address = getAddress(body.address);
  } catch (err) {
    logger.warn("JSON parse failed on POST /v1/faucet/usdc", { error: String(err) });
    return c.json({ error: { code: "invalid_request", message: "Invalid JSON body" } }, 400);
  }

  if (!(await checkAllowlist(address.toLowerCase()))) {
    return c.json({ error: { code: "wallet_not_allowed", message: "This service is in private beta" } }, 403);
  }

  const rateCheck = usdcLimiter.check(address);
  if (!rateCheck.allowed) {
    const retryAfter = Math.ceil(rateCheck.retryAfterMs / 1000);
    return new Response(
      JSON.stringify({
        error: {
          code: "rate_limited",
          message: `Next drip in ${Math.ceil(retryAfter / 60)} minutes`,
          retryAfter,
        },
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfter),
        },
      },
    );
  }

  try {
    const result = await dripUsdc(address);
    usdcLimiter.record(address);
    return c.json(result, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: { code: "faucet_error", message } }, 502);
  }
});

// POST /v1/faucet/eth — Dispense test ETH
app.post("/v1/faucet/eth", async (c) => {
  let address: string;
  try {
    const body = await c.req.json<{ address?: string }>();
    if (!body.address || !isAddress(body.address)) {
      return c.json(
        { error: { code: "invalid_request", message: "Valid address required" } },
        400,
      );
    }
    address = getAddress(body.address);
  } catch (err) {
    logger.warn("JSON parse failed on POST /v1/faucet/eth", { error: String(err) });
    return c.json({ error: { code: "invalid_request", message: "Invalid JSON body" } }, 400);
  }

  if (!(await checkAllowlist(address.toLowerCase()))) {
    return c.json({ error: { code: "wallet_not_allowed", message: "This service is in private beta" } }, 403);
  }

  const rateCheck = ethLimiter.check(address);
  if (!rateCheck.allowed) {
    const retryAfter = Math.ceil(rateCheck.retryAfterMs / 1000);
    return new Response(
      JSON.stringify({
        error: {
          code: "rate_limited",
          message: `Next drip in ${Math.ceil(retryAfter / 60)} minutes`,
          retryAfter,
        },
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfter),
        },
      },
    );
  }

  try {
    const result = await dripEth(address);
    ethLimiter.record(address);
    return c.json(result, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: { code: "faucet_error", message } }, 502);
  }
});

// GET /v1/faucet/status — Rate limit status for an address
app.get("/v1/faucet/status", (c) => {
  const address = c.req.query("address");
  if (!address || !isAddress(address)) {
    return c.json(
      { error: { code: "invalid_request", message: "address query param required" } },
      400,
    );
  }

  const normalizedAddress = getAddress(address);
  const usdcCheck = usdcLimiter.check(normalizedAddress);
  const ethCheck = ethLimiter.check(normalizedAddress);

  return c.json({
    address: normalizedAddress,
    usdc: {
      available: usdcCheck.allowed,
      retry_after_ms: usdcCheck.retryAfterMs,
    },
    eth: {
      available: ethCheck.allowed,
      retry_after_ms: ethCheck.retryAfterMs,
    },
  });
});

export default app;
