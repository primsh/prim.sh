import { Hono } from "hono";
import { createAgentStackMiddleware } from "@agentstack/x402-middleware";
import type {
  WalletCreateResponse,
  WalletListResponse,
  WalletDetailResponse,
  WalletDeactivateResponse,
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

const app = new Hono();

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

// POST /v1/wallets — Create wallet (FREE); returns 201 stub
app.post("/v1/wallets", (c) => {
  const stub: WalletCreateResponse = {
    address: "0x0000000000000000000000000000000000000000",
    chain: "eip155:8453",
    balance: "0.00",
    funded: false,
    claimToken: "ctk_stub",
    createdAt: new Date().toISOString(),
  };
  return c.json(stub, 201);
});

// GET /v1/wallets — List wallets
app.get("/v1/wallets", (c) => {
  return c.json(notImplemented() as unknown as WalletListResponse, 501);
});

// GET /v1/wallets/:address — Wallet detail
app.get("/v1/wallets/:address", (c) => {
  return c.json(notImplemented() as unknown as WalletDetailResponse, 501);
});

// DELETE /v1/wallets/:address — Deactivate
app.delete("/v1/wallets/:address", (c) => {
  return c.json(notImplemented() as unknown as WalletDeactivateResponse, 501);
});

// POST /v1/wallets/:address/send
app.post("/v1/wallets/:address/send", (c) => {
  return c.json(notImplemented() as unknown as SendResponse, 501);
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
