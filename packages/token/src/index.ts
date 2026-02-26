import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { createAgentStackMiddleware, createWalletAllowlistChecker, getNetworkConfig } from "@primsh/x402-middleware";
import type {
  ApiError,
  CreateTokenRequest,
  MintRequest,
  CreatePoolRequest,
} from "./api.ts";
import {
  deployToken,
  listTokens,
  getToken,
  mintTokens,
  getSupply,
  createPool,
  getPool,
  getLiquidityParams,
} from "./service.ts";

const LLMS_TXT = `# token.prim.sh — API Reference

> ERC-20 token deployment and management for AI agents. Deploy tokens, mint supply, create Uniswap V3 pools.

Base URL: https://token.prim.sh
Auth: x402 payment protocol (USDC on Base)
Payment: Every non-free request returns 402 with payment requirements. Sign the payment and resend.

## Quick Start

1. POST /v1/tokens with name, symbol, initialSupply → get token id (deployStatus: "pending")
2. Poll GET /v1/tokens/{id} until deployStatus is "confirmed"
3. POST /v1/tokens/{id}/mint to mint additional tokens
4. POST /v1/tokens/{id}/pool to create a Uniswap V3 liquidity pool
5. GET /v1/tokens/{id}/pool/liquidity-params to get calldata for adding liquidity

## Authentication

All paid endpoints use x402. The flow:
1. Send your request → get 402 response with payment requirements in headers
2. Sign a USDC payment for the specified amount
3. Resend request with X-PAYMENT header containing the signed payment

Free endpoints (no payment required): GET /, GET /llms.txt

## Token Amounts

All token amounts (initialSupply, maxSupply, amount, totalSupply) are strings representing raw integer
values in the token's smallest unit. For a token with 18 decimals: 1 token = "1000000000000000000".
USDC has 6 decimals: $1 USDC = "1000000".

## Endpoints

### POST /v1/tokens — Deploy ERC-20 token ($1.00)

Request body:
  name           string        Token name (required)
  symbol         string        Ticker symbol, e.g. "MTK" (required)
  initialSupply  string        Initial supply in raw units (required)
  decimals       number        Decimal places, default 18 (optional)
  mintable       boolean       Allow future minting, default false (optional)
  maxSupply      string|null   Max mintable supply in raw units, null = no cap (optional)

Response 201: TokenResponse (deployStatus: "pending" — poll GET /v1/tokens/{id} until "confirmed")

### GET /v1/tokens — List tokens ($0.001)

Response 200:
  tokens  TokenResponse[]

### GET /v1/tokens/{id} — Get token details ($0.001)

Response 200: TokenResponse

TokenResponse shape:
  id              string                   Token ID (UUID)
  contractAddress string|null              Contract address (null while pending)
  ownerWallet     string                   Owner wallet address
  name            string                   Token name
  symbol          string                   Token symbol
  decimals        number                   Decimal places
  initialSupply   string                   Initial supply in raw units
  totalMinted     string                   Total minted so far in raw units
  mintable        boolean                  Whether additional minting is allowed
  maxSupply       string|null              Max supply in raw units or null
  txHash          string                   Deploy transaction hash
  deployStatus    "pending"|"confirmed"|"failed"
  createdAt       string                   ISO 8601

### POST /v1/tokens/{id}/mint — Mint additional tokens ($0.10)

Token must be mintable. Caller must own the token.

Request body:
  to      string   Recipient address (required)
  amount  string   Amount in raw units (required)

Response 200:
  txHash  string   Mint transaction hash
  to      string   Recipient address
  amount  string   Amount minted in raw units
  status  "pending"

### GET /v1/tokens/{id}/supply — Get total supply ($0.001)

Returns live on-chain totalSupply by querying the contract.

Response 200:
  tokenId         string
  contractAddress string
  totalSupply     string   Raw units

### POST /v1/tokens/{id}/pool — Create Uniswap V3 pool ($0.50)

Creates and initializes a token/USDC pool. One pool per token maximum.

Request body:
  pricePerToken  string   Initial price in USDC per token (required), e.g. "0.001"
  feeTier        number   Fee tier: 500 (0.05%), 3000 (0.3%), 10000 (1%), default 3000 (optional)

Response 201:
  poolAddress   string   Pool contract address
  token0        string   token0 address
  token1        string   token1 address (USDC)
  fee           number   Fee tier
  sqrtPriceX96  string   Initial sqrt price (Q64.96)
  tick          number   Initial tick
  txHash        string   Pool creation transaction hash

### GET /v1/tokens/{id}/pool — Get pool details ($0.001)

Response 200: PoolResponse (same shape as POST /v1/tokens/{id}/pool response)

### GET /v1/tokens/{id}/pool/liquidity-params — Get liquidity parameters ($0.001)

Returns calldata for adding liquidity. Submit the approvals[] on-chain before calling addLiquidity.

Query params:
  tokenAmount  string   Amount of tokens to add in raw units (required)
  usdcAmount   string   Amount of USDC to add in raw units (required)

Response 200:
  positionManagerAddress  string                 Uniswap V3 NonfungiblePositionManager
  token0                  string
  token1                  string
  fee                     number
  tickLower               number
  tickUpper               number
  amount0Desired          string
  amount1Desired          string
  amount0Min              string                 Slippage protection
  amount1Min              string                 Slippage protection
  recipient               string                 Address to receive LP NFT
  deadline                number                 Unix timestamp
  approvals               Approval[]             Submit these before addLiquidity

Approval shape:
  token    string   Token to approve
  spender  string   Spender (positionManagerAddress)
  amount   string   Amount to approve in raw units

## Error Format

All errors return:
  {"error": {"code": "error_code", "message": "Human-readable message"}}

Error codes:
  not_found          Token or pool not found (404)
  forbidden          Token belongs to a different wallet (403)
  invalid_request    Missing or invalid field (400)
  not_mintable       Token was deployed with mintable: false (400)
  exceeds_max_supply Mint would exceed maxSupply (422)
  pool_exists        Pool already exists for this token (409)
  rpc_error          Base RPC error (502)

## Ownership

All tokens are scoped to the wallet address that paid to create them. You can only access tokens your wallet owns.
`;

const networkConfig = getNetworkConfig();
const PAY_TO_ADDRESS = process.env.PRIM_PAY_TO ?? "0x0000000000000000000000000000000000000000";
const NETWORK = networkConfig.network;
const WALLET_INTERNAL_URL = process.env.WALLET_INTERNAL_URL ?? "http://127.0.0.1:3001";
const checkAllowlist = createWalletAllowlistChecker(WALLET_INTERNAL_URL);

const TOKEN_ROUTES = {
  "POST /v1/tokens": "$1.00",
  "GET /v1/tokens": "$0.001",
  "GET /v1/tokens/[id]": "$0.001",
  "POST /v1/tokens/[id]/mint": "$0.10",
  "GET /v1/tokens/[id]/supply": "$0.001",
  "POST /v1/tokens/[id]/pool": "$0.50",
  "GET /v1/tokens/[id]/pool": "$0.001",
  "GET /v1/tokens/[id]/pool/liquidity-params": "$0.001",
} as const;

function forbidden(message: string): ApiError {
  return { error: { code: "forbidden", message } };
}

function notFound(message: string): ApiError {
  return { error: { code: "not_found", message } };
}

function invalidRequest(message: string): ApiError {
  return { error: { code: "invalid_request", message } };
}

function rpcError(message: string): ApiError {
  return { error: { code: "rpc_error", message } };
}

function notMintable(message: string): ApiError {
  return { error: { code: "not_mintable", message } };
}

function exceedsMaxSupply(message: string): ApiError {
  return { error: { code: "exceeds_max_supply", message } };
}

function poolExists(message: string): ApiError {
  return { error: { code: "pool_exists", message } };
}

type AppVariables = { walletAddress: string | undefined };
const app = new Hono<{ Variables: AppVariables }>();

app.use("*", bodyLimit({
  maxSize: 1024 * 1024,
  onError: (c) => c.json({ error: "Request too large" }, 413),
}));

app.use(
  "*",
  createAgentStackMiddleware(
    {
      payTo: PAY_TO_ADDRESS,
      network: NETWORK,
      freeRoutes: ["GET /", "GET /llms.txt"],
      checkAllowlist,
    },
    { ...TOKEN_ROUTES },
  ),
);

// GET / — health check (free)
app.get("/", (c) => {
  return c.json({ service: "token.sh", status: "ok" });
});

// GET /llms.txt — machine-readable API reference (free)
app.get("/llms.txt", (c) => {
  return c.text(LLMS_TXT);
});

// POST /v1/tokens — Deploy new ERC-20
app.post("/v1/tokens", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  let body: CreateTokenRequest;
  try {
    body = await c.req.json<CreateTokenRequest>();
  } catch {
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await deployToken(body, caller);
  if (!result.ok) {
    if (result.code === "invalid_request") return c.json(invalidRequest(result.message), 400);
    if (result.code === "rpc_error") return c.json(rpcError(result.message), 502);
    return c.json(invalidRequest(result.message), result.status as ContentfulStatusCode);
  }
  return c.json(result.data, 201);
});

// GET /v1/tokens — List caller's tokens
app.get("/v1/tokens", (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = listTokens(caller);
  if (!result.ok) return c.json(invalidRequest(result.message), result.status as ContentfulStatusCode);
  return c.json(result.data, 200);
});

// GET /v1/tokens/:id — Token detail
app.get("/v1/tokens/:id", (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = getToken(c.req.param("id"), caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    return c.json(invalidRequest(result.message), result.status as ContentfulStatusCode);
  }
  return c.json(result.data, 200);
});

// POST /v1/tokens/:id/mint — Mint additional tokens
app.post("/v1/tokens/:id/mint", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  let body: MintRequest;
  try {
    body = await c.req.json<MintRequest>();
  } catch {
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await mintTokens(c.req.param("id"), body, caller);
  if (!result.ok) {
    if (result.code === "not_found") return c.json(notFound(result.message), 404);
    if (result.code === "not_mintable") return c.json(notMintable(result.message), 400);
    if (result.code === "forbidden") return c.json(forbidden(result.message), 403);
    if (result.code === "exceeds_max_supply") return c.json(exceedsMaxSupply(result.message), 422);
    if (result.code === "invalid_request") return c.json(invalidRequest(result.message), 400);
    if (result.code === "rpc_error") return c.json(rpcError(result.message), 502);
    return c.json(invalidRequest(result.message), result.status as ContentfulStatusCode);
  }
  return c.json(result.data, 200);
});

// GET /v1/tokens/:id/supply — Live on-chain totalSupply
app.get("/v1/tokens/:id/supply", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = await getSupply(c.req.param("id"), caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    if (result.code === "rpc_error") return c.json(rpcError(result.message), 502);
    return c.json(invalidRequest(result.message), result.status as ContentfulStatusCode);
  }
  return c.json(result.data, 200);
});

// POST /v1/tokens/:id/pool — Create + initialize Uniswap V3 pool
app.post("/v1/tokens/:id/pool", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  let body: CreatePoolRequest;
  try {
    body = await c.req.json<CreatePoolRequest>();
  } catch {
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await createPool(c.req.param("id"), body, caller);
  if (!result.ok) {
    if (result.code === "not_found") return c.json(notFound(result.message), 404);
    if (result.code === "forbidden") return c.json(forbidden(result.message), 403);
    if (result.code === "pool_exists") return c.json(poolExists(result.message), 409);
    if (result.code === "invalid_request") return c.json(invalidRequest(result.message), 400);
    if (result.code === "rpc_error") return c.json(rpcError(result.message), 502);
    return c.json(invalidRequest(result.message), result.status as ContentfulStatusCode);
  }
  return c.json(result.data, 201);
});

// GET /v1/tokens/:id/pool/liquidity-params — Compute add-liquidity calldata
// NOTE: must be registered before GET /v1/tokens/:id/pool to avoid routing conflict
app.get("/v1/tokens/:id/pool/liquidity-params", (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const tokenAmount = c.req.query("tokenAmount") ?? "";
  const usdcAmount = c.req.query("usdcAmount") ?? "";

  const result = getLiquidityParams(c.req.param("id"), tokenAmount, usdcAmount, caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    if (result.code === "invalid_request") return c.json(invalidRequest(result.message), 400);
    return c.json(invalidRequest(result.message), result.status as ContentfulStatusCode);
  }
  return c.json(result.data, 200);
});

// GET /v1/tokens/:id/pool — Pool info
app.get("/v1/tokens/:id/pool", (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = getPool(c.req.param("id"), caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    if (result.status === 403) return c.json(forbidden(result.message), 403);
    return c.json(invalidRequest(result.message), result.status as ContentfulStatusCode);
  }
  return c.json(result.data, 200);
});

export default app;
