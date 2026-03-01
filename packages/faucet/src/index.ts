// SPDX-License-Identifier: Apache-2.0
import { resolve } from "node:path";
import {
  createAgentStackMiddleware,
  createLogger,
  createWalletAllowlistChecker,
  getNetworkConfig,
} from "@primsh/x402-middleware";
import { createPrimApp } from "@primsh/x402-middleware/create-prim-app";
import { getAddress, isAddress } from "viem";
import { RateLimiter } from "./rate-limit.ts";
import { dripEth, dripUsdc, getTreasuryBalance, refillTreasury } from "./service.ts";

const app = createPrimApp(
  {
    serviceName: "faucet.sh",
    llmsTxtPath: import.meta.dir
      ? resolve(import.meta.dir, "../../../site/faucet/llms.txt")
      : undefined,
    routes: {},
    metricsName: "faucet.prim.sh",
    freeService: true,
    skipHealthCheck: true,
    pricing: {
      routes: [
        {
          method: "POST",
          path: "/v1/faucet/usdc",
          price_usdc: "0",
          description: "Dispense test USDC (free, rate-limited)",
        },
        {
          method: "POST",
          path: "/v1/faucet/eth",
          price_usdc: "0",
          description: "Dispense test ETH (free, rate-limited)",
        },
        {
          method: "GET",
          path: "/v1/faucet/status",
          price_usdc: "0",
          description: "Rate limit status",
        },
        {
          method: "GET",
          path: "/v1/faucet/treasury",
          price_usdc: "0",
          description: "Treasury balance",
        },
        {
          method: "POST",
          path: "/v1/faucet/refill",
          price_usdc: "0",
          description: "Refill treasury from CDP faucet",
        },
      ],
    },
  },
  { createAgentStackMiddleware, createWalletAllowlistChecker },
);

const logger = createLogger("faucet.sh");

// Rate limiters (SQLite-backed, persist across restarts)
const usdcLimiter = new RateLimiter("usdc", 2 * 60 * 60 * 1000); // 2 hours
const ethLimiter = new RateLimiter("eth", 60 * 60 * 1000); // 1 hour
const refillLimiter = new RateLimiter("refill", 10 * 60 * 1000); // 10 minutes

// Testnet guard — refuse to serve on mainnet
app.use("*", async (c, next) => {
  // Allow health check and pricing on any network
  if (
    c.req.method === "GET" &&
    (c.req.path === "/" ||
      c.req.path === "/pricing" ||
      c.req.path === "/llms.txt" ||
      c.req.path === "/v1/metrics" ||
      c.req.path === "/v1/faucet/treasury")
  ) {
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

// GET / — Health check (custom: includes network + testnet fields)
app.get("/", (c) => {
  const config = getNetworkConfig();
  return c.json({
    service: "faucet.sh",
    status: "ok",
    network: config.network,
    testnet: config.isTestnet,
  });
});

// POST /v1/faucet/usdc — Dispense test USDC
app.post("/v1/faucet/usdc", async (c) => {
  let address: string;
  try {
    const body = await c.req.json<{ address?: string }>();
    if (!body.address || !isAddress(body.address)) {
      return c.json({ error: { code: "invalid_request", message: "Valid address required" } }, 400);
    }
    address = getAddress(body.address);
  } catch (err) {
    logger.warn("JSON parse failed on POST /v1/faucet/usdc", { error: String(err) });
    return c.json({ error: { code: "invalid_request", message: "Invalid JSON body" } }, 400);
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
      return c.json({ error: { code: "invalid_request", message: "Valid address required" } }, 400);
    }
    address = getAddress(body.address);
  } catch (err) {
    logger.warn("JSON parse failed on POST /v1/faucet/eth", { error: String(err) });
    return c.json({ error: { code: "invalid_request", message: "Invalid JSON body" } }, 400);
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
    const code = (err as Error & { code?: string }).code;
    if (code === "treasury_low") {
      return c.json({ error: { code: "treasury_low", message } }, 503);
    }
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

// GET /v1/faucet/treasury — Treasury ETH balance
app.get("/v1/faucet/treasury", async (c) => {
  try {
    const status = await getTreasuryBalance();
    return c.json(status, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: { code: "faucet_error", message } }, 502);
  }
});

// POST /v1/faucet/refill — Batch-claim testnet ETH from CDP faucet
app.post("/v1/faucet/refill", async (c) => {
  const rateCheck = refillLimiter.check("__refill__");
  if (!rateCheck.allowed) {
    const retryAfter = Math.ceil(rateCheck.retryAfterMs / 1000);
    return new Response(
      JSON.stringify({
        error: {
          code: "rate_limited",
          message: `Refill available in ${Math.ceil(retryAfter / 60)} minutes`,
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
    let batchSize: number | undefined;
    try {
      const body = await c.req.json<{ batch_size?: number }>();
      if (body.batch_size != null) {
        batchSize = body.batch_size;
      }
    } catch {
      // No body or invalid JSON — use defaults
    }

    const result = await refillTreasury(batchSize);
    refillLimiter.record("__refill__");
    return c.json(result, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("CDP_API_KEY")) {
      return c.json({ error: { code: "faucet_error", message } }, 502);
    }
    return c.json({ error: { code: "faucet_error", message } }, 500);
  }
});

export default app;
