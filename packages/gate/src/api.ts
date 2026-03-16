// SPDX-License-Identifier: Apache-2.0
// ─── gate.sh API types ─────────────────────────────────────────────────

import { z } from "zod";

export const RedeemRequestSchema = z.object({
  code: z.string().describe("Invite code (e.g. \"PRIM-a1b2c3d4\")."),
  wallet: z
    .string()
    .describe("EVM wallet address to allowlist and fund (0x... checksummed)."),
});
export type RedeemRequest = z.infer<typeof RedeemRequestSchema>;

export const FundingDetailSchema = z.object({
  usdc: z.string().describe("USDC amount funded as decimal string (e.g. \"5.00\")."),
  eth: z.string().describe("ETH amount funded as decimal string (e.g. \"0.001\")."),
  usdc_tx: z.string().describe("USDC transfer transaction hash."),
  eth_tx: z.string().describe("ETH transfer transaction hash."),
});
export type FundingDetail = z.infer<typeof FundingDetailSchema>;

export const RedeemResponseSchema = z.object({
  status: z.literal("redeemed").describe("Always \"redeemed\" on success."),
  wallet: z.string().describe("Checksummed wallet address that was funded."),
  network: z.string().describe("Network the funds were sent on (e.g. \"eip155:8453\")."),
  funded: FundingDetailSchema.describe("Funding details."),
  wallet_registered: z
    .boolean()
    .describe("Whether the wallet was auto-registered on wallet.sh."),
  credit_seeded: z
    .boolean()
    .describe("Whether infer.sh credit was seeded for instant responses."),
});
export type RedeemResponse = z.infer<typeof RedeemResponseSchema>;

// ─── Code management ─────────────────────────────────────────────────────────

export const CreateCodesRequestSchema = z.object({
  count: z.number().optional().describe("Generate N random codes (1–100)."),
  codes: z.array(z.string()).optional().describe("Add specific codes."),
  label: z.string().optional().describe("Optional batch label (e.g. \"beta-batch-1\")."),
});
export type CreateCodesRequest = z.infer<typeof CreateCodesRequestSchema>;

export const CreateCodesResponseSchema = z.object({
  codes: z.array(z.string()).describe("All created codes."),
  created: z.number().describe("Count actually inserted (excludes dupes)."),
});
export type CreateCodesResponse = z.infer<typeof CreateCodesResponseSchema>;

export const CodeDetailSchema = z.object({
  code: z.string(),
  status: z.enum(["available", "redeemed"]),
  created_at: z.string().nullable(),
  label: z.string().nullable(),
  wallet: z.string().nullable(),
  redeemed_at: z.string().nullable(),
});
export type CodeDetail = z.infer<typeof CodeDetailSchema>;

export const ListCodesResponseSchema = z.object({
  codes: z.array(CodeDetailSchema),
  total: z.number(),
});
export type ListCodesResponse = z.infer<typeof ListCodesResponseSchema>;

// ─── Error ────────────────────────────────────────────────────────────────────

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string().describe("Machine-readable error code."),
    message: z.string().describe("Human-readable error message."),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const ERROR_CODES = [
  "invalid_request",
  "invalid_code",
  "code_redeemed",
  "not_configured",
  "not_found",
  "fund_error",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
