// SPDX-License-Identifier: Apache-2.0
/**
 * wallet.sh API contract — Zod schemas, inferred types, and error envelope.
 */

import { z } from "zod";

// ─── Error envelope ───────────────────────────────────────────────────────

export const ApiErrorDetailSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);
export type ApiErrorDetail = z.infer<typeof ApiErrorDetailSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string().describe("Machine-readable error code."),
    message: z.string().describe("Human-readable error message."),
    details: ApiErrorDetailSchema.optional().describe("Additional structured context for the error."),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const ERROR_CODES = [
  "not_found",
  "forbidden",
  "insufficient_balance",
  "wallet_paused",
  "policy_violation",
  "duplicate_request",
  "invalid_request",
  "not_implemented",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

// ─── Cursor pagination ─────────────────────────────────────────────────────

export const CursorPaginationSchema = z.object({
  cursor: z.string().nullable().describe("Opaque cursor for the next page. Null if this is the last page."),
});
export type CursorPagination = z.infer<typeof CursorPaginationSchema>;

// ─── Wallet register ──────────────────────────────────────────────────────

export const RegisterWalletRequestSchema = z.object({
  address: z.string().describe("Ethereum address to register (0x... 42 chars, checksummed)."),
  signature: z.string().describe('EIP-191 signature over "Register <address> with prim.sh at <timestamp>".'),
  timestamp: z.string().describe("ISO 8601 UTC timestamp used in the signed message. Must be within 5 minutes of server time."),
  chain: z.string().optional().describe('Chain identifier. Default "base".'),
  label: z.string().optional().describe("Human-readable label for this wallet."),
});
export type RegisterWalletRequest = z.infer<typeof RegisterWalletRequestSchema>;

export const RegisterWalletResponseSchema = z.object({
  address: z.string().describe("Registered Ethereum address."),
  chain: z.string().describe("Chain identifier."),
  label: z.string().nullable().describe("Label if provided, null otherwise."),
  registered_at: z.string().describe("ISO 8601 timestamp when the wallet was registered."),
  created_at: z.string().describe("ISO 8601 timestamp when the record was created."),
});
export type RegisterWalletResponse = z.infer<typeof RegisterWalletResponseSchema>;

// ─── Wallet list & detail ──────────────────────────────────────────────────

export const WalletListItemSchema = z.object({
  address: z.string().describe("Ethereum address."),
  chain: z.string().describe("Chain identifier."),
  balance: z.string().describe('USDC balance as a decimal string (e.g. "5.25").'),
  eth_balance: z.string().describe('ETH balance as a decimal string (e.g. "0.000100").'),
  funded: z.boolean().describe("Whether the wallet has ever been funded."),
  paused: z.boolean().describe("Whether the wallet is currently paused."),
  created_at: z.string().describe("ISO 8601 timestamp when the wallet was created."),
});
export type WalletListItem = z.infer<typeof WalletListItemSchema>;

export const SpendingPolicySchema = z.object({
  max_per_tx: z.string().nullable().describe("Max USDC per transaction as decimal string. Null = no limit."),
  max_per_day: z.string().nullable().describe("Max USDC per day as decimal string. Null = no limit."),
  daily_spent: z.string().describe("USDC spent today as a decimal string."),
  daily_reset_at: z.string().describe("ISO 8601 timestamp when the daily counter resets."),
});
export type SpendingPolicy = z.infer<typeof SpendingPolicySchema>;

export const GetWalletResponseSchema = z.object({
  address: z.string().describe("Ethereum address."),
  chain: z.string().describe("Chain identifier."),
  balance: z.string().describe("USDC balance as a decimal string."),
  eth_balance: z.string().describe('ETH balance as a decimal string (e.g. "0.000100").'),
  funded: z.boolean().describe("Whether the wallet has ever been funded."),
  paused: z.boolean().describe("Whether the wallet is currently paused."),
  created_by: z.string().describe("Address that registered this wallet (or self)."),
  policy: SpendingPolicySchema.nullable().describe("Spending policy, null if none configured."),
  created_at: z.string().describe("ISO 8601 timestamp when the wallet was created."),
});
export type GetWalletResponse = z.infer<typeof GetWalletResponseSchema>;

// ─── Wallet deactivate ─────────────────────────────────────────────────────

export const DeactivateWalletResponseSchema = z.object({
  address: z.string().describe("Deactivated Ethereum address."),
  deactivated: z.boolean().describe("Always true on success."),
  deactivated_at: z.string().describe("ISO 8601 timestamp of deactivation."),
});
export type DeactivateWalletResponse = z.infer<typeof DeactivateWalletResponseSchema>;

// ─── Fund request ──────────────────────────────────────────────────────────

export const CreateFundRequestRequestSchema = z.object({
  amount: z.string().describe('Requested USDC amount as a decimal string (e.g. "10.00").'),
  reason: z.string().describe("Human-readable reason for the funding request."),
});
export type CreateFundRequestRequest = z.infer<typeof CreateFundRequestRequestSchema>;

export type FundRequestStatus = "pending" | "approved" | "denied";

export const GetFundRequestResponseSchema = z.object({
  id: z.string().describe('Fund request ID (e.g. "fr_abc123").'),
  wallet_address: z.string().describe("Wallet address the request is for."),
  amount: z.string().describe("Requested USDC amount as a decimal string."),
  reason: z.string().describe("Reason provided by the requester."),
  status: z.enum(["pending", "approved", "denied"]).describe("Current status of the fund request."),
  created_at: z.string().describe("ISO 8601 timestamp when the request was created."),
});
export type GetFundRequestResponse = z.infer<typeof GetFundRequestResponseSchema>;

export const ApproveFundRequestResponseSchema = z.object({
  id: z.string().describe("Fund request ID."),
  status: z.literal("approved").describe('Always "approved" on success.'),
  funding_address: z.string().describe("Send USDC to this address to fulfill the request."),
  amount: z.string().describe("Approved USDC amount as a decimal string."),
  chain: z.string().describe("Chain identifier for the funding transaction."),
  approved_at: z.string().describe("ISO 8601 timestamp when the request was approved."),
});
export type ApproveFundRequestResponse = z.infer<typeof ApproveFundRequestResponseSchema>;

export const DenyFundRequestRequestSchema = z.object({
  reason: z.string().optional().describe("Reason for denial."),
});
export type DenyFundRequestRequest = z.infer<typeof DenyFundRequestRequestSchema>;

export const DenyFundRequestResponseSchema = z.object({
  id: z.string().describe("Fund request ID."),
  status: z.literal("denied").describe('Always "denied" on success.'),
  reason: z.string().nullable().describe("Denial reason if provided, null otherwise."),
  denied_at: z.string().describe("ISO 8601 timestamp when the request was denied."),
});
export type DenyFundRequestResponse = z.infer<typeof DenyFundRequestResponseSchema>;

// ─── Policy ────────────────────────────────────────────────────────────────

export const GetPolicyResponseSchema = z.object({
  wallet_address: z.string().describe("Wallet address this policy applies to."),
  max_per_tx: z.string().nullable().describe("Max USDC per transaction, null = no limit."),
  max_per_day: z.string().nullable().describe("Max USDC per day, null = no limit."),
  allowed_primitives: z.array(z.string()).nullable().describe('Allowed primitive hostnames (e.g. ["store.prim.sh"]), null = all allowed.'),
  daily_spent: z.string().describe("USDC spent today as a decimal string."),
  daily_reset_at: z.string().describe("ISO 8601 timestamp when the daily counter resets."),
});
export type GetPolicyResponse = z.infer<typeof GetPolicyResponseSchema>;

export const UpdatePolicyRequestSchema = z.object({
  maxPerTx: z.string().nullable().optional().describe("Max USDC per transaction. Pass null to remove the limit."),
  maxPerDay: z.string().nullable().optional().describe("Max USDC per day. Pass null to remove the limit."),
  allowedPrimitives: z.array(z.string()).nullable().optional().describe("Allowed primitive hostnames. Pass null to allow all."),
});
export type UpdatePolicyRequest = z.infer<typeof UpdatePolicyRequestSchema>;

// ─── Pause / Resume ────────────────────────────────────────────────────────

export type PauseScope = "all" | "send" | "swap";

export const PauseWalletRequestSchema = z.object({
  scope: z.enum(["all", "send", "swap"]).optional().describe('Scope to pause. "all" | "send" | "swap". Default "all".'),
});
export type PauseWalletRequest = z.infer<typeof PauseWalletRequestSchema>;

export const PauseWalletResponseSchema = z.object({
  wallet_address: z.string().describe("Wallet address that was paused."),
  paused: z.boolean().describe("Always true on success."),
  scope: z.enum(["all", "send", "swap"]).describe("Scope that was paused."),
  paused_at: z.string().describe("ISO 8601 timestamp when the wallet was paused."),
});
export type PauseWalletResponse = z.infer<typeof PauseWalletResponseSchema>;

export const ResumeWalletRequestSchema = z.object({
  scope: z.enum(["all", "send", "swap"]).optional().describe('Scope to resume. "all" | "send" | "swap". Default "all".'),
});
export type ResumeWalletRequest = z.infer<typeof ResumeWalletRequestSchema>;

export const ResumeWalletResponseSchema = z.object({
  wallet_address: z.string().describe("Wallet address that was resumed."),
  paused: z.boolean().describe("Always false on success (wallet is unpaused)."),
  scope: z.enum(["all", "send", "swap"]).describe("Scope that was resumed."),
  resumed_at: z.string().describe("ISO 8601 timestamp when the wallet was resumed."),
});
export type ResumeWalletResponse = z.infer<typeof ResumeWalletResponseSchema>;
