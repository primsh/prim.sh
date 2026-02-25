import { Hono } from "hono";
import { isAddress, getAddress } from "viem";
import { getNetworkConfig } from "@agentstack/x402-middleware";
import { RateLimiter } from "./rate-limit.ts";
import { dripUsdc, dripEth } from "./service.ts";

const app = new Hono();

// Rate limiters
const usdcLimiter = new RateLimiter(2 * 60 * 60 * 1000); // 2 hours
const ethLimiter = new RateLimiter(60 * 60 * 1000); // 1 hour

// Testnet guard — refuse to serve on mainnet
app.use("*", async (c, next) => {
  // Allow health check on any network
  if (c.req.path === "/" && c.req.method === "GET") {
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
  } catch {
    return c.json({ error: { code: "invalid_request", message: "Invalid JSON body" } }, 400);
  }

  const rateCheck = usdcLimiter.check(address);
  if (!rateCheck.allowed) {
    const retryAfter = Math.ceil(rateCheck.retryAfterMs / 1000);
    return c.json(
      {
        error: {
          code: "rate_limited",
          message: `Next drip in ${Math.ceil(retryAfter / 60)} minutes`,
          retryAfter,
        },
      },
      429,
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
  } catch {
    return c.json({ error: { code: "invalid_request", message: "Invalid JSON body" } }, 400);
  }

  const rateCheck = ethLimiter.check(address);
  if (!rateCheck.allowed) {
    const retryAfter = Math.ceil(rateCheck.retryAfterMs / 1000);
    return c.json(
      {
        error: {
          code: "rate_limited",
          message: `Next drip in ${Math.ceil(retryAfter / 60)} minutes`,
          retryAfter,
        },
      },
      429,
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
      retryAfterMs: usdcCheck.retryAfterMs,
    },
    eth: {
      available: ethCheck.allowed,
      retryAfterMs: ethCheck.retryAfterMs,
    },
  });
});

export default app;
