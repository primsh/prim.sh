// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Source: packages/token/openapi.yaml
// Regenerate: pnpm gen:sdk

// ── Types ──────────────────────────────────────────────────────────────────

export interface CreatePoolRequest {
  /** Initial price per token in USDC as a decimal string (e.g. "0.001"). */
  pricePerToken: string;
  /** Uniswap V3 fee tier. 500 | 3000 | 10000, default 3000. */
  feeTier?: number;
}

export interface CreateTokenRequest {
  /** Token name (e.g. "AgentCoin"). */
  name: string;
  /** Token symbol (e.g. "AGT"). */
  symbol: string;
  /** Decimal places. Default 18. */
  decimals?: number;
  /** Initial supply as a raw integer string (e.g. "1000000000000000000" = 1 token at 18 decimals). */
  initialSupply: string;
  /** Whether additional tokens can be minted after deployment. Default false. */
  mintable?: boolean;
  /** Maximum mintable supply as a raw integer string. Null = unlimited. Only applies if mintable is true. */
  maxSupply?: string | null;
}

export interface LiquidityApproval {
  /** Token contract address to approve. */
  token: string;
  /** Spender address (position manager). */
  spender: string;
  /** Amount to approve as a raw integer string. */
  amount: string;
}

export interface LiquidityParamsResponse {
  /** Uniswap V3 NonfungiblePositionManager contract address. */
  position_manager_address: string;
  /** First token address. */
  token0: string;
  /** Second token address. */
  token1: string;
  /** Fee tier. */
  fee: number;
  /** Lower tick bound for the liquidity range. */
  tick_lower: number;
  /** Upper tick bound for the liquidity range. */
  tick_upper: number;
  /** Desired amount of token0 to add as a raw integer string. */
  amount0_desired: string;
  /** Desired amount of token1 to add as a raw integer string. */
  amount1_desired: string;
  /** Minimum amount of token0 (slippage protection) as a raw integer string. */
  amount0_min: string;
  /** Minimum amount of token1 (slippage protection) as a raw integer string. */
  amount1_min: string;
  /** Address to receive the liquidity position NFT. */
  recipient: string;
  /** Transaction deadline as a Unix timestamp. */
  deadline: number;
  /** ERC-20 approvals to submit on-chain before calling addLiquidity. */
  approvals: LiquidityApproval[];
}

export interface MintRequest {
  /** Recipient address to mint tokens to. */
  to: string;
  /** Amount to mint as a raw integer string. */
  amount: string;
}

export interface MintResponse {
  /** Mint transaction hash. */
  tx_hash: string;
  /** Recipient address. */
  to: string;
  /** Amount minted as a raw integer string. */
  amount: string;
  /** Always "pending" — mint is submitted on-chain asynchronously. */
  status: "pending";
}

export interface PoolResponse {
  /** Uniswap V3 pool contract address. */
  pool_address: string;
  /** First token address in the pool pair. */
  token0: string;
  /** Second token address in the pool pair. */
  token1: string;
  /** Fee tier (e.g. 3000 = 0.3%). */
  fee: number;
  /** Initial sqrtPriceX96 as a string. */
  sqrt_price_x96: string;
  /** Initial tick. */
  tick: number;
  /** Pool creation transaction hash. */
  tx_hash: string;
}

export interface SupplyResponse {
  /** Token ID. */
  token_id: string;
  /** Deployed contract address. */
  contract_address: string;
  /** Live on-chain total supply as a raw integer string. */
  total_supply: string;
}

export interface TokenResponse {
  /** Token ID (e.g. "tok_abc123"). */
  id: string;
  /** Deployed contract address. Null while deploy_status is "pending". */
  contract_address: string | null;
  /** Ethereum address of the wallet that deployed the token. */
  owner_wallet: string;
  /** Token name. */
  name: string;
  /** Token symbol. */
  symbol: string;
  /** Decimal places. */
  decimals: number;
  /** Initial supply as a raw integer string. */
  initial_supply: string;
  /** Total minted supply as a raw integer string. */
  total_minted: string;
  /** Whether additional tokens can be minted. */
  mintable: boolean;
  /** Maximum mintable supply as a raw integer string. Null = unlimited. */
  max_supply: string | null;
  /** Deployment transaction hash. */
  tx_hash: string;
  /** Deployment status. Poll until "confirmed" before minting or creating a pool. */
  deploy_status: "pending" | "confirmed" | "failed";
  /** ISO 8601 timestamp when the token was created. */
  created_at: string;
}

export interface GetTokenParams {
  /** id parameter */
  id: string;
}

export interface MintTokensParams {
  /** id parameter */
  id: string;
}

export interface GetTokenSupplyParams {
  /** id parameter */
  id: string;
}

export interface CreatePoolParams {
  /** id parameter */
  id: string;
}

export interface GetPoolParams {
  /** id parameter */
  id: string;
}

export interface GetLiquidityParamsParams {
  /** id parameter */
  id: string;
  /** Raw token amount to add as liquidity */
  tokenAmount?: string;
  /** Raw USDC amount to pair (6 decimals) */
  usdcAmount?: string;
}

export type ListTokensResponse = Record<string, unknown>;

// ── Client ─────────────────────────────────────────────────────────────────

export function createTokenClient(
  primFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  baseUrl = "https://token.prim.sh",
) {
  return {
    async deployToken(req: CreateTokenRequest): Promise<TokenResponse> {
      const url = `${baseUrl}/v1/tokens`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        let code = "unknown";
        try {
          const body = await res.json() as { error?: { code: string; message: string } };
          if (body.error) { msg = body.error.message; code = body.error.code; }
        } catch {}
        throw new Error(`${msg} (${code})`);
      }
      return res.json() as Promise<TokenResponse>;
    },
    async listTokens(): Promise<ListTokensResponse> {
      const url = `${baseUrl}/v1/tokens`;
      const res = await primFetch(url);
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        let code = "unknown";
        try {
          const body = await res.json() as { error?: { code: string; message: string } };
          if (body.error) { msg = body.error.message; code = body.error.code; }
        } catch {}
        throw new Error(`${msg} (${code})`);
      }
      return res.json() as Promise<ListTokensResponse>;
    },
    async getToken(params: GetTokenParams): Promise<TokenResponse> {
      const url = `${baseUrl}/v1/tokens/${encodeURIComponent(params.id)}`;
      const res = await primFetch(url);
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        let code = "unknown";
        try {
          const body = await res.json() as { error?: { code: string; message: string } };
          if (body.error) { msg = body.error.message; code = body.error.code; }
        } catch {}
        throw new Error(`${msg} (${code})`);
      }
      return res.json() as Promise<TokenResponse>;
    },
    async mintTokens(params: MintTokensParams, req: MintRequest): Promise<MintResponse> {
      const url = `${baseUrl}/v1/tokens/${encodeURIComponent(params.id)}/mint`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        let code = "unknown";
        try {
          const body = await res.json() as { error?: { code: string; message: string } };
          if (body.error) { msg = body.error.message; code = body.error.code; }
        } catch {}
        throw new Error(`${msg} (${code})`);
      }
      return res.json() as Promise<MintResponse>;
    },
    async getTokenSupply(params: GetTokenSupplyParams): Promise<SupplyResponse> {
      const url = `${baseUrl}/v1/tokens/${encodeURIComponent(params.id)}/supply`;
      const res = await primFetch(url);
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        let code = "unknown";
        try {
          const body = await res.json() as { error?: { code: string; message: string } };
          if (body.error) { msg = body.error.message; code = body.error.code; }
        } catch {}
        throw new Error(`${msg} (${code})`);
      }
      return res.json() as Promise<SupplyResponse>;
    },
    async createPool(params: CreatePoolParams, req: CreatePoolRequest): Promise<PoolResponse> {
      const url = `${baseUrl}/v1/tokens/${encodeURIComponent(params.id)}/pool`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        let code = "unknown";
        try {
          const body = await res.json() as { error?: { code: string; message: string } };
          if (body.error) { msg = body.error.message; code = body.error.code; }
        } catch {}
        throw new Error(`${msg} (${code})`);
      }
      return res.json() as Promise<PoolResponse>;
    },
    async getPool(params: GetPoolParams): Promise<PoolResponse> {
      const url = `${baseUrl}/v1/tokens/${encodeURIComponent(params.id)}/pool`;
      const res = await primFetch(url);
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        let code = "unknown";
        try {
          const body = await res.json() as { error?: { code: string; message: string } };
          if (body.error) { msg = body.error.message; code = body.error.code; }
        } catch {}
        throw new Error(`${msg} (${code})`);
      }
      return res.json() as Promise<PoolResponse>;
    },
    async getLiquidityParams(params: GetLiquidityParamsParams): Promise<LiquidityParamsResponse> {
      const qs = new URLSearchParams();
      if (params.tokenAmount !== undefined) qs.set("tokenAmount", String(params.tokenAmount));
      if (params.usdcAmount !== undefined) qs.set("usdcAmount", String(params.usdcAmount));
      const query = qs.toString();
      const url = `${baseUrl}/v1/tokens/${encodeURIComponent(params.id)}/pool/liquidity-params${query ? `?${query}` : ""}`;
      const res = await primFetch(url);
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        let code = "unknown";
        try {
          const body = await res.json() as { error?: { code: string; message: string } };
          if (body.error) { msg = body.error.message; code = body.error.code; }
        } catch {}
        throw new Error(`${msg} (${code})`);
      }
      return res.json() as Promise<LiquidityParamsResponse>;
    },
  };
}
