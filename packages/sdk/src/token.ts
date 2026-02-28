// THIS FILE IS GENERATED — DO NOT EDIT
// Source: specs/openapi/token.yaml
// Regenerate: pnpm gen:sdk

// ── Types ──────────────────────────────────────────────────────────────────

export interface TokenResponse {
  /** Unique token identifier (e.g. "tk_abc1234f"). */
  id: string;
  /** Deployed contract address. null while deploy_status is "pending". */
  contract_address: string | null;
  /** Ethereum address of the wallet that deployed this token. */
  owner_wallet: string;
  /** Token name (e.g. "MyToken"). */
  name: string;
  /** Token ticker symbol (uppercase alphanumeric, 1–11 chars). */
  symbol: string;
  /** Number of decimal places (default 18). */
  decimals: number;
  /** Initial supply in raw token units (string to avoid BigInt precision loss). */
  initial_supply: string;
  /** Total tokens minted so far in raw units. */
  total_minted: string;
  /** Whether additional tokens can be minted after deploy. */
  mintable: boolean;
  /** Maximum mintable supply in raw units. null = no cap. */
  max_supply: string | null;
  /** Transaction hash of the deploy transaction. */
  tx_hash: string;
  /** Current deployment status. Poll until "confirmed" before minting or creating a pool. */
  deploy_status: "pending" | "confirmed" | "failed";
  /** ISO 8601 timestamp of token creation. */
  created_at: string;
}

export interface MintResponse {
  /** Transaction hash of the mint transaction. */
  tx_hash: string;
  /** Recipient address. */
  to: string;
  /** Amount minted in raw token units. */
  amount: string;
  /** Always "pending" — mint is submitted but not yet confirmed on-chain. */
  status: "pending";
}

export interface SupplyResponse {
  /** Token identifier. */
  token_id: string;
  /** Deployed contract address. */
  contract_address: string;
  /** Live on-chain total supply in raw token units. */
  total_supply: string;
}

export interface PoolResponse {
  /** Address of the created Uniswap V3 pool. */
  pool_address: string;
  /** Address of token0 in the pool pair. */
  token0: string;
  /** Address of token1 in the pool pair (typically USDC). */
  token1: string;
  /** Pool fee tier in hundredths of a basis point (e.g. 3000 = 0.3%). */
  fee: number;
  /** Initial sqrt price as Q64.96 fixed-point (string for BigInt precision). */
  sqrt_price_x96: string;
  /** Current tick at pool initialization. */
  tick: number;
  /** Transaction hash of the pool creation transaction. */
  tx_hash: string;
}

export interface LiquidityApproval {
  /** Token contract address to approve. */
  token: string;
  /** Spender address (position manager) to approve. */
  spender: string;
  /** Amount to approve in raw token units. */
  amount: string;
}

export interface LiquidityParamsResponse {
  /** Uniswap V3 NonfungiblePositionManager contract address. */
  position_manager_address: string;
  /** Address of token0. */
  token0: string;
  /** Address of token1 (typically USDC). */
  token1: string;
  /** Pool fee tier. */
  fee: number;
  /** Lower tick boundary for the liquidity position. */
  tick_lower: number;
  /** Upper tick boundary for the liquidity position. */
  tick_upper: number;
  /** Desired amount of token0 to add in raw units. */
  amount0_desired: string;
  /** Desired amount of token1 (USDC) to add in raw units. */
  amount1_desired: string;
  /** Minimum amount of token0 (slippage protection). */
  amount0_min: string;
  /** Minimum amount of token1 (slippage protection). */
  amount1_min: string;
  /** Address to receive the LP NFT position. */
  recipient: string;
  /** Unix timestamp after which the transaction reverts. */
  deadline: number;
  /** Token approvals to submit on-chain before calling addLiquidity. */
  approvals: LiquidityApproval[];
}

export interface DeployTokenRequest {
  /** Token name. */
  name: string;
  /** Token ticker symbol (uppercase alphanumeric, 1–11 chars). */
  symbol: string;
  /** Decimal places (default 18). Most ERC-20 tokens use 18. */
  decimals?: number;
  /** Initial supply in raw token units. For 1M tokens with 18 decimals, pass "1000000000000000000000000". */
  initialSupply: string;
  /** Whether additional tokens can be minted after deploy (default false). Immutable after deployment. */
  mintable?: boolean;
  /** Maximum mintable supply in raw units. null or omit for no cap. Only meaningful if mintable is true. */
  maxSupply?: string | null;
}

export interface MintTokensRequest {
  /** Recipient Ethereum address. */
  to: string;
  /** Amount to mint in raw token units. */
  amount: string;
}

export interface CreatePoolRequest {
  /** Initial price in USDC per token as a decimal string (e.g. "0.001" for 0.1 cents per token). */
  pricePerToken: string;
  /** Uniswap V3 fee tier in hundredths of a basis point. Valid values are 500 (0.05%), 3000 (0.3%), 10000 (1%). Default 3000. */
  feeTier?: 500 | 3000 | 10000;
}

export interface ListTokensParams {
  /** Number of tokens per page (1–100, default 20). */
  limit?: number;
  /** Page number (1-based, default 1). */
  page?: number;
}

export interface GetTokenParams {
  /** Token ID. */
  id: string;
}

export interface MintTokensParams {
  /** Token ID. */
  id: string;
}

export interface GetTokenSupplyParams {
  /** Token ID. */
  id: string;
}

export interface CreatePoolParams {
  /** Token ID. */
  id: string;
}

export interface GetPoolParams {
  /** Token ID. */
  id: string;
}

export interface GetLiquidityParamsParams {
  /** Token ID. */
  id: string;
  /** Amount of tokens to add as liquidity in raw units. */
  tokenAmount: string;
  /** Amount of USDC to add as liquidity in raw units (USDC has 6 decimals, so $1 = "1000000"). */
  usdcAmount: string;
}

export interface DeployTokenResponse {
  token: TokenResponse;
}

export interface ListTokensResponse {
  tokens: TokenResponse[];
  meta: {
    page: number;
    per_page: number;
    total: number;
  };
}

export interface GetTokenResponse {
  token: TokenResponse;
}

// ── Client ─────────────────────────────────────────────────────────────────

export function createTokenClient(primFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const baseUrl = "https://token.prim.sh";
  return {
    async deployToken(req: DeployTokenRequest): Promise<DeployTokenResponse> {
      const url = `${baseUrl}/v1/tokens`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return res.json() as Promise<DeployTokenResponse>;
    },
    async listTokens(params: ListTokensParams): Promise<ListTokensResponse> {
      const qs = new URLSearchParams();
      if (params.limit !== undefined) qs.set("limit", String(params.limit));
      if (params.page !== undefined) qs.set("page", String(params.page));
      const query = qs.toString();
      const url = `${baseUrl}/v1/tokens${query ? `?${query}` : ""}`;
      const res = await primFetch(url);
      return res.json() as Promise<ListTokensResponse>;
    },
    async getToken(params: GetTokenParams): Promise<GetTokenResponse> {
      const url = `${baseUrl}/v1/tokens/${encodeURIComponent(params.id)}`;
      const res = await primFetch(url);
      return res.json() as Promise<GetTokenResponse>;
    },
    async mintTokens(params: MintTokensParams, req: MintTokensRequest): Promise<MintResponse> {
      const url = `${baseUrl}/v1/tokens/${encodeURIComponent(params.id)}/mint`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return res.json() as Promise<MintResponse>;
    },
    async getTokenSupply(params: GetTokenSupplyParams): Promise<SupplyResponse> {
      const url = `${baseUrl}/v1/tokens/${encodeURIComponent(params.id)}/supply`;
      const res = await primFetch(url);
      return res.json() as Promise<SupplyResponse>;
    },
    async createPool(params: CreatePoolParams, req: CreatePoolRequest): Promise<PoolResponse> {
      const url = `${baseUrl}/v1/tokens/${encodeURIComponent(params.id)}/pool`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return res.json() as Promise<PoolResponse>;
    },
    async getPool(params: GetPoolParams): Promise<PoolResponse> {
      const url = `${baseUrl}/v1/tokens/${encodeURIComponent(params.id)}/pool`;
      const res = await primFetch(url);
      return res.json() as Promise<PoolResponse>;
    },
    async getLiquidityParams(params: GetLiquidityParamsParams): Promise<LiquidityParamsResponse> {
      const qs = new URLSearchParams();
      if (params.tokenAmount !== undefined) qs.set("tokenAmount", String(params.tokenAmount));
      if (params.usdcAmount !== undefined) qs.set("usdcAmount", String(params.usdcAmount));
      const query = qs.toString();
      const url = `${baseUrl}/v1/tokens/${encodeURIComponent(params.id)}/pool/liquidity-params${query ? `?${query}` : ""}`;
      const res = await primFetch(url);
      return res.json() as Promise<LiquidityParamsResponse>;
    },
  };
}
