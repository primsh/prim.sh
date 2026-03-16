// SPDX-License-Identifier: Apache-2.0
/**
 * faucet.sh API contract — Zod schemas, inferred types, and error envelope.
 */

import { z } from "zod";

// ─── Error envelope ───────────────────────────────────────────────────────

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string().describe("Machine-readable error code."),
    message: z.string().describe("Human-readable error message."),
    retryAfter: z.number().optional().describe("Seconds until rate limit resets. Only present on 429 responses."),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const ERROR_CODES = [
  "invalid_request",
  "wallet_not_allowed",
  "mainnet_rejected",
  "rate_limited",
  "faucet_error",
  "treasury_low",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

// ─── Drip types ───────────────────────────────────────────────────────────

export const DripRequestSchema = z.object({
  address: z.string().describe("EVM wallet address to drip to (0x... 42 chars)."),
});
export type DripRequest = z.infer<typeof DripRequestSchema>;

export const DripResponseSchema = z.object({
  tx_hash: z.string().describe("Transaction hash on Base Sepolia."),
  amount: z.string().describe('Amount dispensed as a decimal string (e.g. "10.00" for USDC, "0.01" for ETH).'),
  currency: z.string().describe('Currency dispensed: "USDC" or "ETH".'),
  chain: z.string().describe('CAIP-2 chain identifier (e.g. "eip155:84532").'),
  source: z.string().optional().describe('Backend that dispensed the tokens. "cdp" | "treasury".'),
});
export type DripResponse = z.infer<typeof DripResponseSchema>;

// ─── Treasury types ──────────────────────────────────────────────────────

export const TreasuryStatusSchema = z.object({
  address: z.string(),
  eth_balance: z.string(),
  usdc_balance: z.string(),
  needs_refill: z.boolean(),
});
export type TreasuryStatus = z.infer<typeof TreasuryStatusSchema>;

export const RefillResultSchema = z.object({
  claimed: z.number(),
  failed: z.number(),
  estimated_eth: z.string(),
  usdc_claimed: z.number(),
  usdc_failed: z.number(),
  estimated_usdc: z.string(),
  tx_hashes: z.array(z.string()),
});
export type RefillResult = z.infer<typeof RefillResultSchema>;

// ─── Status types ─────────────────────────────────────────────────────────

export const FaucetAvailabilitySchema = z.object({
  available: z.boolean().describe("Whether the faucet can be called right now for this address."),
  retry_after_ms: z.number().describe("Milliseconds until rate limit resets. 0 if available."),
});
export type FaucetAvailability = z.infer<typeof FaucetAvailabilitySchema>;

export const GetFaucetStatusResponseSchema = z.object({
  address: z.string().describe("The queried wallet address (checksummed)."),
  usdc: FaucetAvailabilitySchema.describe("USDC faucet availability (2-hour cooldown)."),
  eth: FaucetAvailabilitySchema.describe("ETH faucet availability (1-hour cooldown)."),
});
export type GetFaucetStatusResponse = z.infer<typeof GetFaucetStatusResponseSchema>;
