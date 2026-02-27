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
  /** Deployed contract address. Null while deployStatus is "pending". */
  contractAddress: string | null;
  /** Ethereum address of the wallet that deployed the token. */
  ownerWallet: string;
  /** Token name. */
  name: string;
  /** Token symbol. */
  symbol: string;
  /** Decimal places. */
  decimals: number;
  /** Initial supply as a raw integer string. */
  initialSupply: string;
  /** Total minted supply as a raw integer string. */
  totalMinted: string;
  /** Whether additional tokens can be minted. */
  mintable: boolean;
  /** Maximum mintable supply as a raw integer string. Null = unlimited. */
  maxSupply: string | null;
  /** Deployment transaction hash. */
  txHash: string;
  /** Deployment status. Poll until "confirmed" before minting or creating a pool. */
  deployStatus: "pending" | "confirmed" | "failed";
  /** ISO 8601 timestamp when the token was created. */
  createdAt: string;
}

import type { PaginatedList } from "@primsh/x402-middleware";

/** @deprecated Use PaginatedList<TokenResponse> */
export type TokenListResponse = PaginatedList<TokenResponse>;

export interface MintRequest {
  /** Recipient address to mint tokens to. */
  to: string;
  /** Amount to mint as a raw integer string. */
  amount: string;
}

export interface MintResponse {
  /** Mint transaction hash. */
  txHash: string;
  /** Recipient address. */
  to: string;
  /** Amount minted as a raw integer string. */
  amount: string;
  /** Always "pending" — mint is submitted on-chain asynchronously. */
  status: "pending";
}

export interface SupplyResponse {
  /** Token ID. */
  tokenId: string;
  /** Deployed contract address. */
  contractAddress: string;
  /** Live on-chain total supply as a raw integer string. */
  totalSupply: string;
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
  poolAddress: string;
  /** First token address in the pool pair. */
  token0: string;
  /** Second token address in the pool pair. */
  token1: string;
  /** Fee tier (e.g. 3000 = 0.3%). */
  fee: number;
  /** Initial sqrtPriceX96 as a string. */
  sqrtPriceX96: string;
  /** Initial tick. */
  tick: number;
  /** Pool creation transaction hash. */
  txHash: string;
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
  positionManagerAddress: string;
  /** First token address. */
  token0: string;
  /** Second token address. */
  token1: string;
  /** Fee tier. */
  fee: number;
  /** Lower tick bound for the liquidity range. */
  tickLower: number;
  /** Upper tick bound for the liquidity range. */
  tickUpper: number;
  /** Desired amount of token0 to add as a raw integer string. */
  amount0Desired: string;
  /** Desired amount of token1 to add as a raw integer string. */
  amount1Desired: string;
  /** Minimum amount of token0 (slippage protection) as a raw integer string. */
  amount0Min: string;
  /** Minimum amount of token1 (slippage protection) as a raw integer string. */
  amount1Min: string;
  /** Address to receive the liquidity position NFT. */
  recipient: string;
  /** Transaction deadline as a Unix timestamp. */
  deadline: number;
  /** ERC-20 approvals to submit on-chain before calling addLiquidity. */
  approvals: LiquidityApproval[];
}
