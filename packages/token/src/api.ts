/**
 * token.sh API contract — request/response types and error envelope.
 */

// ─── Error envelope ───────────────────────────────────────────────────────

export interface ApiError {
  error: {
    /** Machine-readable error code. */
    code: string;
    /** Human-readable error message. */
    message: string;
  };
}

export const ERROR_CODES = [
  "not_found",
  "forbidden",
  "invalid_request",
  "not_mintable",
  "exceeds_max_supply",
  "pool_exists",
  "rpc_error",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

// ─── Service result ──────────────────────────────────────────────────────

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string };

// ─── Token types ─────────────────────────────────────────────────────────

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

export interface SupplyResponse {
  /** Token ID. */
  token_id: string;
  /** Deployed contract address. */
  contract_address: string;
  /** Live on-chain total supply as a raw integer string. */
  total_supply: string;
}

// ─── Pool types ───────────────────────────────────────────────────────────

export interface CreatePoolRequest {
  /** Initial price per token in USDC as a decimal string (e.g. "0.001"). */
  pricePerToken: string;
  /** Uniswap V3 fee tier. 500 | 3000 | 10000, default 3000. */
  feeTier?: number;
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
