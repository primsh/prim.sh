// SPDX-License-Identifier: Apache-2.0
/**
 * token.sh API contract — Zod schemas, inferred types, and error envelope.
 */

import { z } from "zod";

// ─── Error envelope ───────────────────────────────────────────────────────

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string().describe("Machine-readable error code."),
    message: z.string().describe("Human-readable error message."),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

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

// ─── Token types ─────────────────────────────────────────────────────────

export const CreateTokenRequestSchema = z.object({
  name: z.string().describe("Token name (e.g. \"AgentCoin\")."),
  symbol: z.string().describe("Token symbol (e.g. \"AGT\")."),
  decimals: z.number().optional().describe("Decimal places. Default 18."),
  initialSupply: z
    .string()
    .describe(
      "Initial supply as a raw integer string (e.g. \"1000000000000000000\" = 1 token at 18 decimals).",
    ),
  mintable: z
    .boolean()
    .optional()
    .describe("Whether additional tokens can be minted after deployment. Default false."),
  maxSupply: z
    .string()
    .nullable()
    .optional()
    .describe(
      "Maximum mintable supply as a raw integer string. Null = unlimited. Only applies if mintable is true.",
    ),
});
export type CreateTokenRequest = z.infer<typeof CreateTokenRequestSchema>;

export const GetTokenResponseSchema = z.object({
  id: z.string().describe("Token ID (e.g. \"tok_abc123\")."),
  contract_address: z
    .string()
    .nullable()
    .describe("Deployed contract address. Null while deploy_status is \"pending\"."),
  owner_wallet: z.string().describe("Ethereum address of the wallet that deployed the token."),
  name: z.string().describe("Token name."),
  symbol: z.string().describe("Token symbol."),
  decimals: z.number().describe("Decimal places."),
  initial_supply: z.string().describe("Initial supply as a raw integer string."),
  total_minted: z.string().describe("Total minted supply as a raw integer string."),
  mintable: z.boolean().describe("Whether additional tokens can be minted."),
  max_supply: z
    .string()
    .nullable()
    .describe("Maximum mintable supply as a raw integer string. Null = unlimited."),
  tx_hash: z.string().describe("Deployment transaction hash."),
  deploy_status: z
    .enum(["pending", "confirmed", "failed"])
    .describe(
      "Deployment status. Poll until \"confirmed\" before minting or creating a pool.",
    ),
  created_at: z.string().describe("ISO 8601 timestamp when the token was created."),
});
export type GetTokenResponse = z.infer<typeof GetTokenResponseSchema>;

export const MintRequestSchema = z.object({
  to: z.string().describe("Recipient address to mint tokens to."),
  amount: z.string().describe("Amount to mint as a raw integer string."),
});
export type MintRequest = z.infer<typeof MintRequestSchema>;

export const MintResponseSchema = z.object({
  tx_hash: z.string().describe("Mint transaction hash."),
  to: z.string().describe("Recipient address."),
  amount: z.string().describe("Amount minted as a raw integer string."),
  status: z
    .literal("pending")
    .describe("Always \"pending\" — mint is submitted on-chain asynchronously."),
});
export type MintResponse = z.infer<typeof MintResponseSchema>;

export const GetSupplyResponseSchema = z.object({
  token_id: z.string().describe("Token ID."),
  contract_address: z.string().describe("Deployed contract address."),
  total_supply: z.string().describe("Live on-chain total supply as a raw integer string."),
});
export type GetSupplyResponse = z.infer<typeof GetSupplyResponseSchema>;

// ─── Pool types ───────────────────────────────────────────────────────────

export const CreatePoolRequestSchema = z.object({
  pricePerToken: z
    .string()
    .describe("Initial price per token in USDC as a decimal string (e.g. \"0.001\")."),
  feeTier: z
    .number()
    .optional()
    .describe("Uniswap V3 fee tier. 500 | 3000 | 10000, default 3000."),
});
export type CreatePoolRequest = z.infer<typeof CreatePoolRequestSchema>;

export const GetPoolResponseSchema = z.object({
  pool_address: z.string().describe("Uniswap V3 pool contract address."),
  token0: z.string().describe("First token address in the pool pair."),
  token1: z.string().describe("Second token address in the pool pair."),
  fee: z.number().describe("Fee tier (e.g. 3000 = 0.3%)."),
  sqrt_price_x96: z.string().describe("Initial sqrtPriceX96 as a string."),
  tick: z.number().describe("Initial tick."),
  tx_hash: z.string().describe("Pool creation transaction hash."),
});
export type GetPoolResponse = z.infer<typeof GetPoolResponseSchema>;

export const LiquidityApprovalSchema = z.object({
  token: z.string().describe("Token contract address to approve."),
  spender: z.string().describe("Spender address (position manager)."),
  amount: z.string().describe("Amount to approve as a raw integer string."),
});
export type LiquidityApproval = z.infer<typeof LiquidityApprovalSchema>;

export const GetLiquidityParamsResponseSchema = z.object({
  position_manager_address: z
    .string()
    .describe("Uniswap V3 NonfungiblePositionManager contract address."),
  token0: z.string().describe("First token address."),
  token1: z.string().describe("Second token address."),
  fee: z.number().describe("Fee tier."),
  tick_lower: z.number().describe("Lower tick bound for the liquidity range."),
  tick_upper: z.number().describe("Upper tick bound for the liquidity range."),
  amount0_desired: z
    .string()
    .describe("Desired amount of token0 to add as a raw integer string."),
  amount1_desired: z
    .string()
    .describe("Desired amount of token1 to add as a raw integer string."),
  amount0_min: z
    .string()
    .describe("Minimum amount of token0 (slippage protection) as a raw integer string."),
  amount1_min: z
    .string()
    .describe("Minimum amount of token1 (slippage protection) as a raw integer string."),
  recipient: z.string().describe("Address to receive the liquidity position NFT."),
  deadline: z.number().describe("Transaction deadline as a Unix timestamp."),
  approvals: z
    .array(LiquidityApprovalSchema)
    .describe("ERC-20 approvals to submit on-chain before calling addLiquidity."),
});
export type GetLiquidityParamsResponse = z.infer<typeof GetLiquidityParamsResponseSchema>;
