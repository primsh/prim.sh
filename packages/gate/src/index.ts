import { join, resolve } from "node:path";
import {
  addToAllowlist,
  isAllowed,
  removeFromAllowlist,
} from "@primsh/x402-middleware/allowlist-db";
import {
  createAgentStackMiddleware,
  createLogger,
  createWalletAllowlistChecker,
  getNetworkConfig,
  parseJsonBody,
} from "@primsh/x402-middleware";
import { createPrimApp } from "@primsh/x402-middleware/create-prim-app";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { getAddress, isAddress } from "viem";
import type { CreateCodesRequest, RedeemRequest } from "./api.ts";
import { seedCodes } from "./db.ts";
import { createCodes, deleteCode, getCodes, redeemInvite } from "./service.ts";

const ALLOWLIST_DB_PATH =
  process.env.PRIM_ALLOWLIST_DB ??
  join(process.env.PRIM_DATA_DIR ?? "/var/lib/prim", "allowlist.db");

const INTERNAL_KEY = process.env.PRIM_INTERNAL_KEY;

// Seed invite codes from env on startup
const rawCodes = process.env.GATE_CODES ?? "";
if (rawCodes) {
  const codes = rawCodes.split(",").map((c) => c.trim()).filter(Boolean);
  const seeded = seedCodes(codes);
  if (seeded > 0) {
    const log = createLogger("gate.sh");
    log.info(`Seeded ${seeded} invite code(s)`);
  }
}

const app = createPrimApp(
  {
    serviceName: "gate.sh",
    llmsTxtPath: import.meta.dir
      ? resolve(import.meta.dir, "../../../site/gate/llms.txt")
      : undefined,
    routes: {},
    metricsName: "gate.prim.sh",
    freeService: true,
    skipHealthCheck: true,
    pricing: {
      routes: [
        {
          method: "POST",
          path: "/v1/redeem",
          price_usdc: "0",
          description: "Redeem an invite code. Wallet is allowlisted and funded.",
        },
      ],
    },
  },
  { createAgentStackMiddleware, createWalletAllowlistChecker },
);

const logger = createLogger("gate.sh");

// GET / — Health check
app.get("/", (c) => {
  const config = getNetworkConfig();
  return c.json({
    service: "gate.sh",
    status: "ok",
    network: config.network,
  });
});

// POST /v1/redeem — Redeem an invite code (free)
app.post("/v1/redeem", async (c) => {
  const bodyOrRes = await parseJsonBody<Partial<RedeemRequest>>(c, logger, "POST /v1/redeem");
  if (bodyOrRes instanceof Response) return bodyOrRes;
  const body = bodyOrRes;

  if (!body.code || typeof body.code !== "string" || !body.code.trim()) {
    return c.json({ error: { code: "invalid_request", message: "code is required" } }, 400);
  }

  if (!body.wallet || !isAddress(body.wallet)) {
    return c.json(
      { error: { code: "invalid_request", message: "Valid wallet address required" } },
      400,
    );
  }

  const wallet = getAddress(body.wallet);
  const result = await redeemInvite(body.code.trim(), wallet, ALLOWLIST_DB_PATH);

  if (!result.ok) {
    return c.json(
      { error: { code: result.code, message: result.message } },
      result.status as ContentfulStatusCode,
    );
  }

  return c.json(result.data, 200);
});

// ─── Internal: allowlist management ────────────────────────────────────────

function internalAuth(
  c: Parameters<import("hono").MiddlewareHandler>[0],
): Response | null {
  if (!INTERNAL_KEY) {
    return c.json(
      { error: { code: "not_configured", message: "Internal API not configured" } },
      501,
    );
  }
  const key = c.req.header("x-internal-key");
  if (key !== INTERNAL_KEY) {
    return c.json({ error: { code: "unauthorized", message: "Invalid internal key" } }, 401);
  }
  return null;
}

// POST /internal/allowlist/add
app.post("/internal/allowlist/add", async (c) => {
  const denied = internalAuth(c);
  if (denied) return denied;

  const bodyOrRes = await parseJsonBody<{ address?: string; added_by?: string; note?: string }>(c, logger, "POST /internal/allowlist/add");
  if (bodyOrRes instanceof Response) return bodyOrRes;
  const body = bodyOrRes;

  if (!body.address) {
    return c.json(
      { error: { code: "invalid_request", message: "Missing required field: address" } },
      400,
    );
  }

  addToAllowlist(ALLOWLIST_DB_PATH, body.address, body.added_by ?? "internal", body.note);
  return c.json({ ok: true, address: body.address.toLowerCase() }, 200);
});

// DELETE /internal/allowlist/:address
app.delete("/internal/allowlist/:address", (c) => {
  const denied = internalAuth(c);
  if (denied) return denied;

  const address = c.req.param("address");
  removeFromAllowlist(ALLOWLIST_DB_PATH, address);
  return c.json({ ok: true, address: address.toLowerCase() }, 200);
});

// GET /internal/allowlist/check
app.get("/internal/allowlist/check", (c) => {
  const denied = internalAuth(c);
  if (denied) return denied;

  const address = c.req.query("address");
  if (!address) {
    return c.json(
      { error: { code: "invalid_request", message: "Missing query param: address" } },
      400,
    );
  }

  const allowed = isAllowed(ALLOWLIST_DB_PATH, address);
  return c.json({ allowed, address: address.toLowerCase() }, 200);
});

// ─── Internal: code management ───────────────────────────────────────────────

// POST /internal/codes — create codes
app.post("/internal/codes", async (c) => {
  const denied = internalAuth(c);
  if (denied) return denied;

  const bodyOrRes = await parseJsonBody<Partial<CreateCodesRequest>>(c, logger, "POST /internal/codes");
  if (bodyOrRes instanceof Response) return bodyOrRes;
  const body = bodyOrRes;

  const result = createCodes(body);
  if (!result.ok) {
    return c.json(
      { error: { code: result.code, message: result.message } },
      result.status as ContentfulStatusCode,
    );
  }
  return c.json(result.data, 200);
});

// GET /internal/codes — list codes
app.get("/internal/codes", (c) => {
  const denied = internalAuth(c);
  if (denied) return denied;

  const status = c.req.query("status");
  const result = getCodes(status);
  if (!result.ok) {
    return c.json(
      { error: { code: result.code, message: result.message } },
      result.status as ContentfulStatusCode,
    );
  }
  return c.json(result.data, 200);
});

// DELETE /internal/codes/:code — revoke a code
app.delete("/internal/codes/:code", (c) => {
  const denied = internalAuth(c);
  if (denied) return denied;

  const code = c.req.param("code");
  const result = deleteCode(code);
  if (!result.ok) {
    return c.json(
      { error: { code: result.code, message: result.message } },
      result.status as ContentfulStatusCode,
    );
  }
  return c.json(result.data, 200);
});

export default app;
