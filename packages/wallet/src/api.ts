/**
 * wallet.sh API contract — request/response types and error envelope.
 * No runtime validation; Zod schemas in W-2+.
 */

// ─── Error envelope ───────────────────────────────────────────────────────

export interface ApiErrorDetail {
  [key: string]: string | number | boolean | null | undefined;
}

export interface ApiError {
  error: {
    /** Machine-readable error code. */
    code: string;
    /** Human-readable error message. */
    message: string;
    /** Additional structured context for the error. */
    details?: ApiErrorDetail;
  };
}

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

import type { PaginatedList } from "@primsh/x402-middleware";

// ─── Cursor pagination ─────────────────────────────────────────────────────

export interface CursorPagination {
  /** Opaque cursor for the next page. Null if this is the last page. */
  cursor: string | null;
}

// ─── Wallet register ──────────────────────────────────────────────────────

export interface RegisterWalletRequest {
  /** Ethereum address to register (0x... 42 chars, checksummed). */
  address: string;
  /** EIP-191 signature over "Register <address> with prim.sh at <timestamp>". */
  signature: string;
  /** ISO 8601 UTC timestamp used in the signed message. Must be within 5 minutes of server time. */
  timestamp: string;
  /** Chain identifier. Default "base". */
  chain?: string;
  /** Human-readable label for this wallet. */
  label?: string;
}

export interface RegisterWalletResponse {
  /** Registered Ethereum address. */
  address: string;
  /** Chain identifier. */
  chain: string;
  /** Label if provided, null otherwise. */
  label: string | null;
  /** ISO 8601 timestamp when the wallet was registered. */
  registered_at: string;
  /** ISO 8601 timestamp when the record was created. */
  created_at: string;
}

// ─── Wallet list & detail ──────────────────────────────────────────────────

export interface WalletListItem {
  /** Ethereum address. */
  address: string;
  /** Chain identifier. */
  chain: string;
  /** USDC balance as a decimal string (e.g. "5.25"). */
  balance: string;
  /** Whether the wallet has ever been funded. */
  funded: boolean;
  /** Whether the wallet is currently paused. */
  paused: boolean;
  /** ISO 8601 timestamp when the wallet was created. */
  created_at: string;
}

/** @deprecated Use PaginatedList<WalletListItem> */
export type WalletListResponse = PaginatedList<WalletListItem>;

export interface SpendingPolicy {
  /** Max USDC per transaction as decimal string. Null = no limit. */
  max_per_tx: string | null;
  /** Max USDC per day as decimal string. Null = no limit. */
  max_per_day: string | null;
  /** USDC spent today as a decimal string. */
  daily_spent: string;
  /** ISO 8601 timestamp when the daily counter resets. */
  daily_reset_at: string;
}

export interface WalletDetailResponse {
  /** Ethereum address. */
  address: string;
  /** Chain identifier. */
  chain: string;
  /** USDC balance as a decimal string. */
  balance: string;
  /** Whether the wallet has ever been funded. */
  funded: boolean;
  /** Whether the wallet is currently paused. */
  paused: boolean;
  /** Address that registered this wallet (or self). */
  created_by: string;
  /** Spending policy, null if none configured. */
  policy: SpendingPolicy | null;
  /** ISO 8601 timestamp when the wallet was created. */
  created_at: string;
}

// ─── Wallet deactivate ─────────────────────────────────────────────────────

export interface DeactivateWalletResponse {
  /** Deactivated Ethereum address. */
  address: string;
  /** Always true on success. */
  deactivated: boolean;
  /** ISO 8601 timestamp of deactivation. */
  deactivated_at: string;
}

// ─── Fund request ──────────────────────────────────────────────────────────

export interface CreateFundRequestRequest {
  /** Requested USDC amount as a decimal string (e.g. "10.00"). */
  amount: string;
  /** Human-readable reason for the funding request. */
  reason: string;
}

export type FundRequestStatus = "pending" | "approved" | "denied";

export interface FundRequestResponse {
  /** Fund request ID (e.g. "fr_abc123"). */
  id: string;
  /** Wallet address the request is for. */
  wallet_address: string;
  /** Requested USDC amount as a decimal string. */
  amount: string;
  /** Reason provided by the requester. */
  reason: string;
  /** Current status of the fund request. */
  status: FundRequestStatus;
  /** ISO 8601 timestamp when the request was created. */
  created_at: string;
}

/** @deprecated Use PaginatedList<FundRequestResponse> */
export type FundRequestListResponse = PaginatedList<FundRequestResponse>;

export interface ApproveFundRequestResponse {
  /** Fund request ID. */
  id: string;
  /** Always "approved" on success. */
  status: "approved";
  /** Send USDC to this address to fulfill the request. */
  funding_address: string;
  /** Approved USDC amount as a decimal string. */
  amount: string;
  /** Chain identifier for the funding transaction. */
  chain: string;
  /** ISO 8601 timestamp when the request was approved. */
  approved_at: string;
}

export interface DenyFundRequestRequest {
  /** Reason for denial. */
  reason?: string;
}

export interface DenyFundRequestResponse {
  /** Fund request ID. */
  id: string;
  /** Always "denied" on success. */
  status: "denied";
  /** Denial reason if provided, null otherwise. */
  reason: string | null;
  /** ISO 8601 timestamp when the request was denied. */
  denied_at: string;
}

// ─── Policy ────────────────────────────────────────────────────────────────

export interface PolicyResponse {
  /** Wallet address this policy applies to. */
  wallet_address: string;
  /** Max USDC per transaction, null = no limit. */
  max_per_tx: string | null;
  /** Max USDC per day, null = no limit. */
  max_per_day: string | null;
  /** Allowed primitive hostnames (e.g. ["store.prim.sh"]), null = all allowed. */
  allowed_primitives: string[] | null;
  /** USDC spent today as a decimal string. */
  daily_spent: string;
  /** ISO 8601 timestamp when the daily counter resets. */
  daily_reset_at: string;
}

export interface PolicyUpdateRequest {
  /** Max USDC per transaction. Pass null to remove the limit. */
  maxPerTx?: string | null;
  /** Max USDC per day. Pass null to remove the limit. */
  maxPerDay?: string | null;
  /** Allowed primitive hostnames. Pass null to allow all. */
  allowedPrimitives?: string[] | null;
}

// ─── Pause / Resume ────────────────────────────────────────────────────────

export type PauseScope = "all" | "send" | "swap";

export interface PauseRequest {
  /** Scope to pause. "all" | "send" | "swap". Default "all". */
  scope?: PauseScope;
}

export interface PauseResponse {
  /** Wallet address that was paused. */
  wallet_address: string;
  /** Always true on success. */
  paused: boolean;
  /** Scope that was paused. */
  scope: PauseScope;
  /** ISO 8601 timestamp when the wallet was paused. */
  paused_at: string;
}

export interface ResumeRequest {
  /** Scope to resume. "all" | "send" | "swap". Default "all". */
  scope?: PauseScope;
}

export interface ResumeResponse {
  /** Wallet address that was resumed. */
  wallet_address: string;
  /** Always false on success (wallet is unpaused). */
  paused: boolean;
  /** Scope that was resumed. */
  scope: PauseScope;
  /** ISO 8601 timestamp when the wallet was resumed. */
  resumed_at: string;
}
