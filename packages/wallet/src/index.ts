import { Hono } from "hono";
import { createAgentStackMiddleware, getNetworkConfig } from "@agentstack/x402-middleware";
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

const networkConfig = getNetworkConfig();
const PAY_TO_ADDRESS = process.env.PRIM_PAY_TO ?? "0x0000000000000000000000000000000000000000";
const NETWORK = networkConfig.network;

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

function forbidden(message: string): ApiError {
  return { error: { code: "forbidden", message } };
}

function notFound(message: string): ApiError {
  return { error: { code: "not_found", message } };
}

type AppVariables = { walletAddress: string | undefined };
const app = new Hono<{ Variables: AppVariables }>();

app.use(
  "*",
  createAgentStackMiddleware(
    {
      payTo: PAY_TO_ADDRESS,
      network: NETWORK,
      freeRoutes: [
        "GET /",
        "POST /v1/wallets",
        "POST /v1/admin/circuit-breaker/pause",
        "POST /v1/admin/circuit-breaker/resume",
        "GET /v1/admin/circuit-breaker",
      ],
    },
    { ...WALLET_ROUTES },
  ),
);

app.get("/", (c) => {
  return c.json({ service: "wallet.sh", status: "ok" });
});

// POST /v1/wallets — Register wallet via EIP-191 signature (FREE)
app.post("/v1/wallets", async (c) => {
  let body: Partial<WalletRegisterRequest>;
  try {
    body = await c.req.json<Partial<WalletRegisterRequest>>();
  } catch {
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
  } catch {
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
  } catch {
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
  } catch {
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
  } catch {
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
  } catch {
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
  } catch {
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
  } catch {
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

export default app;
