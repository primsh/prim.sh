/**
 * token.sh API contract — request/response types and error envelope.
 */

// ─── Error envelope ───────────────────────────────────────────────────────

export interface ApiError {
  error: {
    code: string;
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
  name: string;
  symbol: string;
  decimals?: number;
  initialSupply: string;
  mintable?: boolean;
  maxSupply?: string | null;
}

export interface TokenResponse {
  id: string;
  contractAddress: string | null;
  ownerWallet: string;
  name: string;
  symbol: string;
  decimals: number;
  initialSupply: string;
  totalMinted: string;
  mintable: boolean;
  maxSupply: string | null;
  txHash: string;
  deployStatus: "pending" | "confirmed" | "failed";
  createdAt: string;
}

import type { PaginatedList } from "@primsh/x402-middleware";

/** @deprecated Use PaginatedList<TokenResponse> */
export type TokenListResponse = PaginatedList<TokenResponse>;

export interface MintRequest {
  to: string;
  amount: string;
}

export interface MintResponse {
  txHash: string;
  to: string;
  amount: string;
  status: "pending";
}

export interface SupplyResponse {
  tokenId: string;
  contractAddress: string;
  totalSupply: string;
}

// ─── Pool types ───────────────────────────────────────────────────────────

export interface CreatePoolRequest {
  pricePerToken: string;
  feeTier?: number;
}

export interface PoolResponse {
  poolAddress: string;
  token0: string;
  token1: string;
  fee: number;
  sqrtPriceX96: string;
  tick: number;
  txHash: string;
}

export interface LiquidityApproval {
  token: string;
  spender: string;
  amount: string;
}

export interface LiquidityParamsResponse {
  positionManagerAddress: string;
  token0: string;
  token1: string;
  fee: number;
  tickLower: number;
  tickUpper: number;
  amount0Desired: string;
  amount1Desired: string;
  amount0Min: string;
  amount1Min: string;
  recipient: string;
  deadline: number;
  approvals: LiquidityApproval[];
}
