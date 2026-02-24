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

// ─── Cursor pagination ─────────────────────────────────────────────────────

export interface CursorPagination {
  cursor: string | null;
}

// ─── Wallet create ────────────────────────────────────────────────────────

export interface WalletCreateRequest {
  chain?: string;
}

export interface WalletCreateResponse {
  address: string;
  chain: string;
  balance: string;
  funded: boolean;
  claimToken: string;
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

export interface WalletListResponse extends CursorPagination {
  wallets: WalletListItem[];
}

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

// ─── Send ──────────────────────────────────────────────────────────────────

export interface SendRequest {
  to: string;
  amount: string;
  idempotencyKey: string;
}

export type TxStatus = "pending" | "confirmed" | "failed";

export interface SendResponse {
  txHash: string;
  from: string;
  to: string;
  amount: string;
  chain: string;
  status: TxStatus;
  confirmedAt: string;
}

// ─── Swap (deferred, stub) ─────────────────────────────────────────────────

export interface SwapRequest {
  from: { token: string; amount: string };
  to: { token: string };
  idempotencyKey: string;
}

// ─── History ────────────────────────────────────────────────────────────────

export type TransactionType = "send" | "receive";

export interface TransactionRecord {
  txHash: string;
  type: TransactionType;
  from: string;
  to: string;
  amount: string;
  chain: string;
  status: TxStatus;
  timestamp: string;
}

export interface HistoryResponse extends CursorPagination {
  transactions: TransactionRecord[];
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

export interface FundRequestListResponse extends CursorPagination {
  requests: FundRequestResponse[];
}

export interface FundRequestApproveResponse {
  id: string;
  status: "approved";
  txHash: string;
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
