import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { createAgentStackMiddleware } from "@agentstack/x402-middleware";
import type {
  WalletCreateRequest,
  WalletListResponse,
  WalletDetailResponse,
  WalletDeactivateResponse,
  SendRequest,
  SendResponse,
  HistoryResponse,
  FundRequestResponse,
  FundRequestListResponse,
  FundRequestApproveResponse,
  FundRequestDenyResponse,
  PolicyResponse,
  PauseResponse,
  ResumeResponse,
  ApiError,
} from "./api.ts";
import { isAddress } from "viem";
import { createWallet, listWallets, getWallet, deactivateWallet, claimWallet, sendUsdc } from "./service.ts";

const PAY_TO_ADDRESS = "0x0000000000000000000000000000000000000000";
const NETWORK = "eip155:8453";

const WALLET_ROUTES = {
  "GET /v1/wallets": "$0.001",
  "GET /v1/wallets/[address]": "$0.001",
  "DELETE /v1/wallets/[address]": "$0.01",
  "POST /v1/wallets/[address]/send": "$0.01",
  "POST /v1/wallets/[address]/swap": "$0.01",
  "GET /v1/wallets/[address]/history": "$0.001",
  "POST /v1/wallets/[address]/fund-request": "$0.001",
  "GET /v1/wallets/[address]/fund-requests": "$0.001",
  "POST /v1/fund-requests/[id]/approve": "$0.01",
  "POST /v1/fund-requests/[id]/deny": "$0.001",
  "GET /v1/wallets/[address]/policy": "$0.001",
  "PUT /v1/wallets/[address]/policy": "$0.005",
  "POST /v1/wallets/[address]/pause": "$0.001",
  "POST /v1/wallets/[address]/resume": "$0.001",
} as const;

function notImplemented(): ApiError {
  return {
    error: {
      code: "not_implemented",
      message: "Endpoint not implemented",
    },
  };
}

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
      freeRoutes: ["GET /", "POST /v1/wallets"],
    },
    { ...WALLET_ROUTES },
  ),
);

app.get("/", (c) => {
  return c.json({ service: "wallet.sh", status: "ok" });
});

// POST /v1/wallets — Create wallet (FREE)
app.post("/v1/wallets", async (c) => {
  let chain: string | undefined;
  try {
    const body = await c.req.json<WalletCreateRequest>();
    chain = body.chain;
  } catch {
    // No body or invalid JSON — use default chain
  }
  const result = createWallet(chain);
  return c.json(result, 201);
});

// Claim token middleware — runs before ownership-gated routes
// Extracts X-Claim-Token and attempts to claim the wallet for the caller
const claimMiddleware: MiddlewareHandler<{ Variables: AppVariables }> = async (c, next) => {
  const claimToken = c.req.header("X-Claim-Token");
  if (claimToken) {
    const address = c.req.param("address") as string | undefined;
    const caller = c.get("walletAddress");

    if (address && caller) {
      const claimed = claimWallet(address, claimToken, caller);
      if (!claimed) {
        return c.json(forbidden("Invalid claim token"), 403);
      }
    }
  }
  await next();
};

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
app.get("/v1/wallets/:address", claimMiddleware, async (c) => {
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
app.delete("/v1/wallets/:address", claimMiddleware, (c) => {
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

// POST /v1/wallets/:address/send
app.post("/v1/wallets/:address/send", claimMiddleware, async (c) => {
  const address = c.req.param("address");
  const caller = c.get("walletAddress");
  if (!caller) {
    return c.json(forbidden("No wallet address in payment"), 403);
  }

  let body: Partial<SendRequest>;
  try {
    body = await c.req.json<Partial<SendRequest>>();
  } catch {
    return c.json({ error: { code: "invalid_request", message: "Invalid JSON body" } } as ApiError, 400);
  }

  const { to, amount, idempotencyKey } = body;

  if (!to || !amount || !idempotencyKey) {
    return c.json({ error: { code: "invalid_request", message: "Missing required fields: to, amount, idempotencyKey" } } as ApiError, 400);
  }

  if (!isAddress(to)) {
    return c.json({ error: { code: "invalid_request", message: "Invalid Ethereum address: to" } } as ApiError, 400);
  }

  const amountNum = Number.parseFloat(amount);
  if (Number.isNaN(amountNum) || amountNum <= 0) {
    return c.json({ error: { code: "invalid_request", message: "amount must be a positive decimal string" } } as ApiError, 400);
  }

  const result = await sendUsdc(address, { to, amount, idempotencyKey }, caller);
  if (!result.ok) {
    const { status, code, message } = result;
    return c.json({ error: { code, message } } as ApiError, status as 400 | 403 | 404 | 409 | 422 | 500 | 502);
  }
  return c.json(result.data as SendResponse, 200);
});

// POST /v1/wallets/:address/swap (deferred)
app.post("/v1/wallets/:address/swap", (c) => {
  return c.json(notImplemented(), 501);
});

// GET /v1/wallets/:address/history
app.get("/v1/wallets/:address/history", (c) => {
  return c.json(notImplemented() as unknown as HistoryResponse, 501);
});

// POST /v1/wallets/:address/fund-request
app.post("/v1/wallets/:address/fund-request", (c) => {
  return c.json(notImplemented() as unknown as FundRequestResponse, 501);
});

// GET /v1/wallets/:address/fund-requests
app.get("/v1/wallets/:address/fund-requests", (c) => {
  return c.json(notImplemented() as unknown as FundRequestListResponse, 501);
});

// POST /v1/fund-requests/:id/approve
app.post("/v1/fund-requests/:id/approve", (c) => {
  return c.json(notImplemented() as unknown as FundRequestApproveResponse, 501);
});

// POST /v1/fund-requests/:id/deny
app.post("/v1/fund-requests/:id/deny", (c) => {
  return c.json(notImplemented() as unknown as FundRequestDenyResponse, 501);
});

// GET /v1/wallets/:address/policy
app.get("/v1/wallets/:address/policy", (c) => {
  return c.json(notImplemented() as unknown as PolicyResponse, 501);
});

// PUT /v1/wallets/:address/policy
app.put("/v1/wallets/:address/policy", (c) => {
  return c.json(notImplemented() as unknown as PolicyResponse, 501);
});

// POST /v1/wallets/:address/pause
app.post("/v1/wallets/:address/pause", (c) => {
  return c.json(notImplemented() as unknown as PauseResponse, 501);
});

// POST /v1/wallets/:address/resume
app.post("/v1/wallets/:address/resume", (c) => {
  return c.json(notImplemented() as unknown as ResumeResponse, 501);
});

export default app;
