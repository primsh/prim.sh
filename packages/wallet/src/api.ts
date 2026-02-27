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
    code: string;
    message: string;
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
  cursor: string | null;
}

// ─── Wallet register ──────────────────────────────────────────────────────

export interface WalletRegisterRequest {
  address: string;
  signature: string;
  timestamp: string;
  chain?: string;
  label?: string;
}

export interface WalletRegisterResponse {
  address: string;
  chain: string;
  label: string | null;
  registeredAt: string;
  createdAt: string;
}

// ─── Wallet list & detail ──────────────────────────────────────────────────

export interface WalletListItem {
  address: string;
  chain: string;
  balance: string;
  funded: boolean;
  paused: boolean;
  createdAt: string;
}

/** @deprecated Use PaginatedList<WalletListItem> */
export type WalletListResponse = PaginatedList<WalletListItem>;

export interface SpendingPolicy {
  maxPerTx: string | null;
  maxPerDay: string | null;
  dailySpent: string;
  dailyResetAt: string;
}

export interface WalletDetailResponse {
  address: string;
  chain: string;
  balance: string;
  funded: boolean;
  paused: boolean;
  createdBy: string;
  policy: SpendingPolicy | null;
  createdAt: string;
}

// ─── Wallet deactivate ─────────────────────────────────────────────────────

export interface WalletDeactivateResponse {
  address: string;
  deactivated: boolean;
  deactivatedAt: string;
}

// ─── Fund request ──────────────────────────────────────────────────────────

export interface FundRequestCreateRequest {
  amount: string;
  reason: string;
}

export type FundRequestStatus = "pending" | "approved" | "denied";

export interface FundRequestResponse {
  id: string;
  walletAddress: string;
  amount: string;
  reason: string;
  status: FundRequestStatus;
  createdAt: string;
}

/** @deprecated Use PaginatedList<FundRequestResponse> */
export type FundRequestListResponse = PaginatedList<FundRequestResponse>;

export interface FundRequestApproveResponse {
  id: string;
  status: "approved";
  fundingAddress: string;
  amount: string;
  chain: string;
  approvedAt: string;
}

export interface FundRequestDenyRequest {
  reason?: string;
}

export interface FundRequestDenyResponse {
  id: string;
  status: "denied";
  reason: string | null;
  deniedAt: string;
}

// ─── Policy ────────────────────────────────────────────────────────────────

export interface PolicyResponse {
  walletAddress: string;
  maxPerTx: string | null;
  maxPerDay: string | null;
  allowedPrimitives: string[] | null;
  dailySpent: string;
  dailyResetAt: string;
}

export interface PolicyUpdateRequest {
  maxPerTx?: string | null;
  maxPerDay?: string | null;
  allowedPrimitives?: string[] | null;
}

// ─── Pause / Resume ────────────────────────────────────────────────────────

export type PauseScope = "all" | "send" | "swap";

export interface PauseRequest {
  scope?: PauseScope;
}

export interface PauseResponse {
  walletAddress: string;
  paused: boolean;
  scope: PauseScope;
  pausedAt: string;
}

export interface ResumeRequest {
  scope?: PauseScope;
}

export interface ResumeResponse {
  walletAddress: string;
  paused: boolean;
  scope: PauseScope;
  resumedAt: string;
}
