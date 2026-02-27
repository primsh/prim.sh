import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createAgentStackMiddleware, createLogger, getNetworkConfig, metricsMiddleware, metricsHandler, requestIdMiddleware, forbidden, notFound } from "@primsh/x402-middleware";
import { addToAllowlist, removeFromAllowlist, isAllowed, createAllowlistChecker } from "@primsh/x402-middleware/allowlist-db";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  WalletRegisterRequest,
  WalletListResponse,
  WalletDetailResponse,
  WalletDeactivateResponse,
  FundRequestResponse,
  FundRequestListResponse,
  FundRequestApproveResponse,
  FundRequestDenyResponse,
  PolicyResponse,
  PauseResponse,
  ResumeResponse,
  ApiError,
} from "./api.ts";
import {
  registerWallet,
  listWallets,
  getWallet,
  deactivateWallet,
  createFundRequest,
  listFundRequests,
  approveFundRequest,
  denyFundRequest,
  getSpendingPolicy,
  updateSpendingPolicy,
  pauseWallet,
  resumeWallet,
} from "./service.ts";
import type { FundRequestCreateRequest, FundRequestDenyRequest, PolicyUpdateRequest, PauseRequest, ResumeRequest } from "./api.ts";
import { pause, resume, getState } from "./circuit-breaker.ts";

const _dir = import.meta.dir ?? dirname(fileURLToPath(import.meta.url));

const LLMS_TXT = readFileSync(
  resolve(_dir, "../../../site/wallet/llms.txt"), "utf-8"
);

const logger = createLogger("wallet.sh");

const networkConfig = getNetworkConfig();
const PAY_TO_ADDRESS = process.env.PRIM_PAY_TO;
if (!PAY_TO_ADDRESS) {
  throw new Error("[wallet.sh] PRIM_PAY_TO environment variable is required");
}
const NETWORK = networkConfig.network;
const INTERNAL_KEY = process.env.PRIM_INTERNAL_KEY;
const ALLOWLIST_DB_PATH = process.env.PRIM_ALLOWLIST_DB ?? join(process.env.PRIM_DATA_DIR ?? "/var/lib/prim", "allowlist.db");
const allowlistChecker = createAllowlistChecker(ALLOWLIST_DB_PATH);

const WALLET_ROUTES = {
  "GET /v1/wallets": "$0.001",
  "GET /v1/wallets/[address]": "$0.001",
  "DELETE /v1/wallets/[address]": "$0.01",
  "GET /v1/wallets/[address]/fund-requests": "$0.001",
  "POST /v1/wallets/[address]/fund-request": "$0.001",
  "POST /v1/fund-requests/[id]/approve": "$0.01",
  "POST /v1/fund-requests/[id]/deny": "$0.001",
  "GET /v1/wallets/[address]/policy": "$0.001",
  "PUT /v1/wallets/[address]/policy": "$0.005",
  "POST /v1/wallets/[address]/pause": "$0.001",
  "POST /v1/wallets/[address]/resume": "$0.001",
} as const;

type AppVariables = { walletAddress: string | undefined };
const app = new Hono<{ Variables: AppVariables }>();

app.use("*", requestIdMiddleware());

app.use("*", bodyLimit({
  maxSize: 1024 * 1024,
  onError: (c) => c.json({ error: "Request too large" }, 413),
}));

app.use("*", metricsMiddleware());

app.get("/v1/metrics", metricsHandler("wallet.prim.sh"));

app.use(
  "*",
  createAgentStackMiddleware(
    {
      payTo: PAY_TO_ADDRESS,
      network: NETWORK,
      checkAllowlist: allowlistChecker,
      freeRoutes: [
        "GET /",
        "GET /pricing",
        "GET /llms.txt",
        "GET /v1/metrics",
        "POST /v1/wallets",
        "POST /v1/admin/circuit-breaker/pause",
        "POST /v1/admin/circuit-breaker/resume",
        "GET /v1/admin/circuit-breaker",
        "POST /internal/allowlist/add",
        "DELETE /internal/allowlist/:address",
        "GET /internal/allowlist/check",
      ],
    },
    { ...WALLET_ROUTES },
  ),
);

app.get("/", (c) => {
  return c.json({ service: "wallet.sh", status: "ok" });
});

// GET /llms.txt — machine-readable API reference (free)
app.get("/llms.txt", (c) => {
  c.header("Content-Type", "text/plain; charset=utf-8");
  return c.body(LLMS_TXT);
});

// GET /pricing — machine-readable pricing (free)
app.get("/pricing", (c) => {
  return c.json({
    service: "wallet.prim.sh",
    currency: "USDC",
    network: "eip155:8453",
    routes: [
      { method: "GET", path: "/v1/wallets", price_usdc: "0.001", description: "List wallets" },
      { method: "GET", path: "/v1/wallets/{address}", price_usdc: "0.001", description: "Get wallet detail" },
      { method: "DELETE", path: "/v1/wallets/{address}", price_usdc: "0.01", description: "Deactivate wallet" },
      { method: "GET", path: "/v1/wallets/{address}/fund-requests", price_usdc: "0.001", description: "List fund requests" },
      { method: "POST", path: "/v1/wallets/{address}/fund-request", price_usdc: "0.001", description: "Create fund request" },
      { method: "POST", path: "/v1/fund-requests/{id}/approve", price_usdc: "0.01", description: "Approve fund request" },
      { method: "POST", path: "/v1/fund-requests/{id}/deny", price_usdc: "0.001", description: "Deny fund request" },
      { method: "GET", path: "/v1/wallets/{address}/policy", price_usdc: "0.001", description: "Get spending policy" },
      { method: "PUT", path: "/v1/wallets/{address}/policy", price_usdc: "0.005", description: "Update spending policy" },
      { method: "POST", path: "/v1/wallets/{address}/pause", price_usdc: "0.001", description: "Pause wallet" },
      { method: "POST", path: "/v1/wallets/{address}/resume", price_usdc: "0.001", description: "Resume wallet" },
    ],
  });
});

// POST /v1/wallets — Register wallet via EIP-191 signature (FREE)
app.post("/v1/wallets", async (c) => {
  let body: Partial<WalletRegisterRequest>;
  try {
    body = await c.req.json<Partial<WalletRegisterRequest>>();
  } catch (err) {
    logger.warn("JSON parse failed on POST /v1/wallets", { error: String(err) });
    return c.json({ error: { code: "invalid_request", message: "Invalid JSON body" } } as ApiError, 400);
  }

  const { address, signature, timestamp } = body;
  if (!address || !signature || !timestamp) {
    return c.json(
      { error: { code: "invalid_request", message: "Missing required fields: address, signature, timestamp" } } as ApiError,
      400,
    );
  }

  const result = await registerWallet({
    address,
    signature,
    timestamp,
    chain: body.chain,
    label: body.label,
  });

  if (!result.ok) {
    const { status, code, message } = result;
    return c.json({ error: { code, message } } as ApiError, status as 400 | 403 | 409);
  }
  return c.json(result.data, 201);
});

// GET /v1/wallets — List wallets
app.get("/v1/wallets", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) {
    return c.json(forbidden("No wallet address in payment"), 403);
  }

  const limitParam = c.req.query("limit");
  const limit = Math.min(Number(limitParam) || 20, 100);
  const after = c.req.query("after");

  const result = await listWallets(caller, limit, after);
  return c.json(result as WalletListResponse, 200);
});

// GET /v1/wallets/:address — Wallet detail
app.get("/v1/wallets/:address", async (c) => {
  const address = c.req.param("address");
  const caller = c.get("walletAddress");
  if (!caller) {
    return c.json(forbidden("No wallet address in payment"), 403);
  }

  const result = await getWallet(address, caller);
  if (!result.ok) {
    const status = result.status;
    if (status === 404) return c.json(notFound(result.message), 404);
    return c.json(forbidden(result.message), 403);
  }
  return c.json(result.data as WalletDetailResponse, 200);
});

// DELETE /v1/wallets/:address — Deactivate
app.delete("/v1/wallets/:address", (c) => {
  const address = c.req.param("address");
  const caller = c.get("walletAddress");
  if (!caller) {
    return c.json(forbidden("No wallet address in payment"), 403);
  }

  const result = deactivateWallet(address, caller);
  if (!result.ok) {
    const status = result.status;
    if (status === 404) return c.json(notFound(result.message), 404);
    return c.json(forbidden(result.message), 403);
  }
  return c.json(result.data as WalletDeactivateResponse, 200);
});

// POST /v1/wallets/:address/fund-request
app.post("/v1/wallets/:address/fund-request", async (c) => {
  const address = c.req.param("address");
  const caller = c.get("walletAddress");
  if (!caller) {
    return c.json(forbidden("No wallet address in payment"), 403);
  }

  let body: Partial<FundRequestCreateRequest>;
  try {
    body = await c.req.json<Partial<FundRequestCreateRequest>>();
  } catch (err) {
    logger.warn("JSON parse failed on POST /v1/wallets/:address/fund-request", { error: String(err) });
    return c.json({ error: { code: "invalid_request", message: "Invalid JSON body" } } as ApiError, 400);
  }

  const { amount, reason } = body;
  if (!amount || !reason) {
    return c.json({ error: { code: "invalid_request", message: "Missing required fields: amount, reason" } } as ApiError, 400);
  }

  const result = createFundRequest(address, { amount, reason }, caller);
  if (!result.ok) {
    const { status, code, message } = result;
    return c.json({ error: { code, message } } as ApiError, status as 400 | 403 | 404 | 500);
  }
  return c.json(result.data as FundRequestResponse, 200);
});

// GET /v1/wallets/:address/fund-requests
app.get("/v1/wallets/:address/fund-requests", (c) => {
  const address = c.req.param("address");
  const caller = c.get("walletAddress");
  if (!caller) {
    return c.json(forbidden("No wallet address in payment"), 403);
  }

  const limitParam = c.req.query("limit");
  const limit = Math.min(Number(limitParam) || 20, 100);
  const after = c.req.query("after");

  const result = listFundRequests(address, caller, limit, after);
  if (!result.ok) {
    const { status, code, message } = result;
    return c.json({ error: { code, message } } as ApiError, status as 403 | 404);
  }
  return c.json(result.data as FundRequestListResponse, 200);
});

// POST /v1/fund-requests/:id/approve
app.post("/v1/fund-requests/:id/approve", (c) => {
  const id = c.req.param("id");
  const caller = c.get("walletAddress");
  if (!caller) {
    return c.json(forbidden("No wallet address in payment"), 403);
  }

  const result = approveFundRequest(id, caller);
  if (!result.ok) {
    const { status, code, message } = result;
    return c.json({ error: { code, message } } as ApiError, status as 403 | 404 | 409);
  }
  return c.json(result.data as FundRequestApproveResponse, 200);
});

// POST /v1/fund-requests/:id/deny
app.post("/v1/fund-requests/:id/deny", async (c) => {
  const id = c.req.param("id");
  const caller = c.get("walletAddress");
  if (!caller) {
    return c.json(forbidden("No wallet address in payment"), 403);
  }

  let reason: string | undefined;
  try {
    const body = await c.req.json<Partial<FundRequestDenyRequest>>();
    reason = body.reason;
  } catch (err) {
    logger.warn("JSON parse failed on POST /v1/fund-requests/:id/deny", { error: String(err) });
    // No body or invalid JSON — reason is optional
  }

  const result = denyFundRequest(id, caller, reason);
  if (!result.ok) {
    const { status, code, message } = result;
    return c.json({ error: { code, message } } as ApiError, status as 403 | 404 | 409);
  }
  return c.json(result.data as FundRequestDenyResponse, 200);
});

// GET /v1/wallets/:address/policy
app.get("/v1/wallets/:address/policy", (c) => {
  const address = c.req.param("address");
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = getSpendingPolicy(address, caller);
  if (!result.ok) {
    const { status, code, message } = result;
    if (status === 404) return c.json(notFound(message), 404);
    return c.json(forbidden(message), 403);
  }
  return c.json(result.data as PolicyResponse, 200);
});

// PUT /v1/wallets/:address/policy
app.put("/v1/wallets/:address/policy", async (c) => {
  const address = c.req.param("address");
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  let body: Partial<PolicyUpdateRequest>;
  try {
    body = await c.req.json<Partial<PolicyUpdateRequest>>();
  } catch (err) {
    logger.warn("JSON parse failed on PUT /v1/wallets/:address/policy", { error: String(err) });
    return c.json({ error: { code: "invalid_request", message: "Invalid JSON body" } } as ApiError, 400);
  }

  const result = updateSpendingPolicy(address, caller, body);
  if (!result.ok) {
    const { status, code, message } = result;
    return c.json({ error: { code, message } } as ApiError, status as 400 | 403 | 404);
  }
  return c.json(result.data as PolicyResponse, 200);
});

// POST /v1/wallets/:address/pause
app.post("/v1/wallets/:address/pause", async (c) => {
  const address = c.req.param("address");
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  let scope: string | undefined;
  try {
    const body = await c.req.json<Partial<PauseRequest>>();
    scope = body.scope;
  } catch (err) {
    logger.warn("JSON parse failed on POST /v1/wallets/:address/pause", { error: String(err) });
    // scope optional, default to "all"
  }
  const effectiveScope = (scope ?? "all") as import("./api.ts").PauseScope;
  if (!["all", "send", "swap"].includes(effectiveScope)) {
    return c.json({ error: { code: "invalid_request", message: "scope must be one of: all, send, swap" } } as ApiError, 400);
  }

  const result = pauseWallet(address, caller, effectiveScope);
  if (!result.ok) {
    const { status, code, message } = result;
    if (status === 404) return c.json(notFound(message), 404);
    return c.json(forbidden(message), 403);
  }
  return c.json(result.data as PauseResponse, 200);
});

// POST /v1/wallets/:address/resume
app.post("/v1/wallets/:address/resume", async (c) => {
  const address = c.req.param("address");
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  let scope: string | undefined;
  try {
    const body = await c.req.json<Partial<ResumeRequest>>();
    scope = body.scope;
  } catch (err) {
    logger.warn("JSON parse failed on POST /v1/wallets/:address/resume", { error: String(err) });
    // scope optional, default to "all"
  }
  const effectiveScope = (scope ?? "all") as import("./api.ts").PauseScope;
  if (!["all", "send", "swap"].includes(effectiveScope)) {
    return c.json({ error: { code: "invalid_request", message: "scope must be one of: all, send, swap" } } as ApiError, 400);
  }

  const result = resumeWallet(address, caller, effectiveScope);
  if (!result.ok) {
    const { status, code, message } = result;
    if (status === 404) return c.json(notFound(message), 404);
    return c.json(forbidden(message), 403);
  }
  return c.json(result.data as ResumeResponse, 200);
});

// ─── Admin: circuit breaker ────────────────────────────────────────────────

// POST /v1/admin/circuit-breaker/pause
app.post("/v1/admin/circuit-breaker/pause", async (c) => {
  let scope: string | undefined;
  try {
    const body = await c.req.json<{ scope?: string }>();
    scope = body.scope;
  } catch (err) {
    logger.warn("JSON parse failed on POST /v1/admin/circuit-breaker/pause", { error: String(err) });
    return c.json({ error: { code: "invalid_request", message: "Invalid JSON body" } } as ApiError, 400);
  }

  if (!scope || !["all", "send", "swap"].includes(scope)) {
    return c.json({ error: { code: "invalid_request", message: "scope must be one of: all, send, swap" } } as ApiError, 400);
  }

  pause(scope as "all" | "send" | "swap");
  return c.json({ scope, paused: true }, 200);
});

// POST /v1/admin/circuit-breaker/resume
app.post("/v1/admin/circuit-breaker/resume", async (c) => {
  let scope: string | undefined;
  try {
    const body = await c.req.json<{ scope?: string }>();
    scope = body.scope;
  } catch (err) {
    logger.warn("JSON parse failed on POST /v1/admin/circuit-breaker/resume", { error: String(err) });
    return c.json({ error: { code: "invalid_request", message: "Invalid JSON body" } } as ApiError, 400);
  }

  if (!scope || !["all", "send", "swap"].includes(scope)) {
    return c.json({ error: { code: "invalid_request", message: "scope must be one of: all, send, swap" } } as ApiError, 400);
  }

  resume(scope as "all" | "send" | "swap");
  return c.json({ scope, paused: false }, 200);
});

// GET /v1/admin/circuit-breaker
app.get("/v1/admin/circuit-breaker", (c) => {
  const state = getState();
  return c.json(state, 200);
});

// ─── Internal: allowlist management ────────────────────────────────────────

function internalAuth(c: Parameters<import("hono").MiddlewareHandler>[0]): Response | null {
  if (!INTERNAL_KEY) {
    return c.json({ error: { code: "not_configured", message: "Internal API not configured" } }, 501);
  }
  const key = c.req.header("x-internal-key");
  if (key !== INTERNAL_KEY) {
    return c.json({ error: { code: "unauthorized", message: "Invalid internal key" } }, 401);
  }
  return null;
}

// POST /internal/allowlist/add — Add wallet to allowlist
app.post("/internal/allowlist/add", async (c) => {
  const denied = internalAuth(c);
  if (denied) return denied;

  let body: { address?: string; added_by?: string; note?: string };
  try {
    body = await c.req.json();
  } catch (err) {
    logger.warn("JSON parse failed on POST /internal/allowlist/add", { error: String(err) });
    return c.json({ error: { code: "invalid_request", message: "Invalid JSON body" } }, 400);
  }

  if (!body.address) {
    return c.json({ error: { code: "invalid_request", message: "Missing required field: address" } }, 400);
  }

  addToAllowlist(ALLOWLIST_DB_PATH, body.address, body.added_by ?? "internal", body.note);
  return c.json({ ok: true, address: body.address.toLowerCase() }, 200);
});

// DELETE /internal/allowlist/:address — Remove wallet from allowlist
app.delete("/internal/allowlist/:address", (c) => {
  const denied = internalAuth(c);
  if (denied) return denied;

  const address = c.req.param("address");
  removeFromAllowlist(ALLOWLIST_DB_PATH, address);
  return c.json({ ok: true, address: address.toLowerCase() }, 200);
});

// GET /internal/allowlist/check — Check if wallet is allowed
app.get("/internal/allowlist/check", (c) => {
  const denied = internalAuth(c);
  if (denied) return denied;

  const address = c.req.query("address");
  if (!address) {
    return c.json({ error: { code: "invalid_request", message: "Missing query param: address" } }, 400);
  }

  const allowed = isAllowed(ALLOWLIST_DB_PATH, address);
  return c.json({ allowed, address: address.toLowerCase() }, 200);
});

export default app;
