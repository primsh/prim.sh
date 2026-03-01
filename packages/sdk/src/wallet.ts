// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Source: packages/wallet/openapi.yaml
// Regenerate: pnpm gen:sdk

import { unwrap } from "./shared.js";

// ── Types ──────────────────────────────────────────────────────────────────

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

export interface CreateFundRequestRequest {
  /** Requested USDC amount as a decimal string (e.g. "10.00"). */
  amount: string;
  /** Human-readable reason for the funding request. */
  reason: string;
}

export interface DeactivateWalletResponse {
  /** Deactivated Ethereum address. */
  address: string;
  /** Always true on success. */
  deactivated: boolean;
  /** ISO 8601 timestamp of deactivation. */
  deactivated_at: string;
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
  status: string;
  /** ISO 8601 timestamp when the request was created. */
  created_at: string;
}

export interface PauseRequest {
  /** Scope to pause. "all" | "send" | "swap". Default "all". */
  scope?: string;
}

export interface PauseResponse {
  /** Wallet address that was paused. */
  wallet_address: string;
  /** Always true on success. */
  paused: boolean;
  /** Scope that was paused. */
  scope: string;
  /** ISO 8601 timestamp when the wallet was paused. */
  paused_at: string;
}

export interface PolicyResponse {
  /** Wallet address this policy applies to. */
  wallet_address: string;
  /** Max USDC per transaction, null = no limit. */
  max_per_tx: string | null;
  /** Max USDC per day, null = no limit. */
  max_per_day: string | null;
  /** Allowed primitive hostnames (e.g. ["store.prim.sh"]), null = all allowed. */
  allowed_primitives: unknown | null;
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
  allowedPrimitives?: unknown | null;
}

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

export interface ResumeRequest {
  /** Scope to resume. "all" | "send" | "swap". Default "all". */
  scope?: string;
}

export interface ResumeResponse {
  /** Wallet address that was resumed. */
  wallet_address: string;
  /** Always false on success (wallet is unpaused). */
  paused: boolean;
  /** Scope that was resumed. */
  scope: string;
  /** ISO 8601 timestamp when the wallet was resumed. */
  resumed_at: string;
}

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

export interface ListWalletsParams {
  /** 1-100, default 20 */
  limit?: number;
  /** Cursor from previous response */
  after?: string;
}

export interface GetWalletParams {
  /** address parameter */
  address: string;
}

export interface DeactivateWalletParams {
  /** address parameter */
  address: string;
}

export interface CreateFundRequestParams {
  /** address parameter */
  address: string;
}

export interface ListFundRequestsParams {
  /** address parameter */
  address: string;
  /** 1-100, default 20 */
  limit?: number;
  /** Cursor from previous response */
  after?: string;
}

export interface ApproveFundRequestParams {
  /** id parameter */
  id: string;
}

export interface DenyFundRequestParams {
  /** id parameter */
  id: string;
}

export interface GetPolicyParams {
  /** address parameter */
  address: string;
}

export interface UpdatePolicyParams {
  /** address parameter */
  address: string;
}

export interface PauseWalletParams {
  /** address parameter */
  address: string;
}

export interface ResumeWalletParams {
  /** address parameter */
  address: string;
}

export type ListWalletsResponse = Record<string, unknown>;

export type ListFundRequestsResponse = Record<string, unknown>;

// ── Client ─────────────────────────────────────────────────────────────────

export function createWalletClient(
  primFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  baseUrl = "https://wallet.prim.sh",
) {
  return {
    async registerWallet(req: RegisterWalletRequest): Promise<RegisterWalletResponse> {
      const url = `${baseUrl}/v1/wallets`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return unwrap<RegisterWalletResponse>(res);
    },
    async listWallets(params: ListWalletsParams): Promise<ListWalletsResponse> {
      const qs = new URLSearchParams();
      if (params.limit !== undefined) qs.set("limit", String(params.limit));
      if (params.after !== undefined) qs.set("after", String(params.after));
      const query = qs.toString();
      const url = `${baseUrl}/v1/wallets${query ? `?${query}` : ""}`;
      const res = await primFetch(url);
      return unwrap<ListWalletsResponse>(res);
    },
    async getWallet(params: GetWalletParams): Promise<WalletDetailResponse> {
      const url = `${baseUrl}/v1/wallets/${encodeURIComponent(params.address)}`;
      const res = await primFetch(url);
      return unwrap<WalletDetailResponse>(res);
    },
    async deactivateWallet(params: DeactivateWalletParams): Promise<DeactivateWalletResponse> {
      const url = `${baseUrl}/v1/wallets/${encodeURIComponent(params.address)}`;
      const res = await primFetch(url, {
        method: "DELETE",
      });
      return unwrap<DeactivateWalletResponse>(res);
    },
    async createFundRequest(params: CreateFundRequestParams, req: CreateFundRequestRequest): Promise<FundRequestResponse> {
      const url = `${baseUrl}/v1/wallets/${encodeURIComponent(params.address)}/fund-request`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return unwrap<FundRequestResponse>(res);
    },
    async listFundRequests(params: ListFundRequestsParams): Promise<ListFundRequestsResponse> {
      const qs = new URLSearchParams();
      if (params.limit !== undefined) qs.set("limit", String(params.limit));
      if (params.after !== undefined) qs.set("after", String(params.after));
      const query = qs.toString();
      const url = `${baseUrl}/v1/wallets/${encodeURIComponent(params.address)}/fund-requests${query ? `?${query}` : ""}`;
      const res = await primFetch(url);
      return unwrap<ListFundRequestsResponse>(res);
    },
    async approveFundRequest(params: ApproveFundRequestParams): Promise<ApproveFundRequestResponse> {
      const url = `${baseUrl}/v1/fund-requests/${encodeURIComponent(params.id)}/approve`;
      const res = await primFetch(url, {
        method: "POST",
      });
      return unwrap<ApproveFundRequestResponse>(res);
    },
    async denyFundRequest(params: DenyFundRequestParams, req: DenyFundRequestRequest): Promise<DenyFundRequestResponse> {
      const url = `${baseUrl}/v1/fund-requests/${encodeURIComponent(params.id)}/deny`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return unwrap<DenyFundRequestResponse>(res);
    },
    async getPolicy(params: GetPolicyParams): Promise<PolicyResponse> {
      const url = `${baseUrl}/v1/wallets/${encodeURIComponent(params.address)}/policy`;
      const res = await primFetch(url);
      return unwrap<PolicyResponse>(res);
    },
    async updatePolicy(params: UpdatePolicyParams, req: PolicyUpdateRequest): Promise<PolicyResponse> {
      const url = `${baseUrl}/v1/wallets/${encodeURIComponent(params.address)}/policy`;
      const res = await primFetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return unwrap<PolicyResponse>(res);
    },
    async pauseWallet(params: PauseWalletParams, req: PauseRequest): Promise<PauseResponse> {
      const url = `${baseUrl}/v1/wallets/${encodeURIComponent(params.address)}/pause`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return unwrap<PauseResponse>(res);
    },
    async resumeWallet(params: ResumeWalletParams, req: ResumeRequest): Promise<ResumeResponse> {
      const url = `${baseUrl}/v1/wallets/${encodeURIComponent(params.address)}/resume`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return unwrap<ResumeResponse>(res);
    },
  };
}
