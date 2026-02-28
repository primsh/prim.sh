// THIS FILE IS GENERATED — DO NOT EDIT
// Source: specs/openapi/wallet.yaml
// Regenerate: pnpm gen:sdk

// ── Types ──────────────────────────────────────────────────────────────────

export interface SpendingPolicy {
  /** Maximum USDC per transaction (e.g. "1.00"), or null for no limit */
  max_per_tx: string | null;
  /** Maximum USDC per day (e.g. "10.00"), or null for no limit */
  max_per_day: string | null;
  /** USDC spent today so far */
  daily_spent: string;
  /** ISO 8601 timestamp when the daily counter resets */
  daily_reset_at: string;
}

export interface WalletListItem {
  /** Ethereum wallet address */
  address: string;
  /** Chain identifier (e.g. "base", "base-sepolia") */
  chain: string;
  /** Current USDC balance as a decimal string */
  balance: string;
  /** Whether the wallet has ever been funded */
  funded: boolean;
  /** Whether the wallet is currently paused */
  paused: boolean;
  /** ISO 8601 timestamp when the wallet was registered */
  created_at: string;
}

export interface WalletDetail {
  /** Ethereum wallet address */
  address: string;
  /** Chain identifier */
  chain: string;
  /** Current USDC balance as a decimal string */
  balance: string;
  /** Whether the wallet has ever been funded */
  funded: boolean;
  /** Whether the wallet is currently paused */
  paused: boolean;
  /** Address of the wallet that registered this wallet (or self if self-registered) */
  created_by: string;
  /** Active spending policy, or null if none set */
  policy: SpendingPolicy | null;
  /** ISO 8601 timestamp when the wallet was registered */
  created_at: string;
}

export interface FundRequest {
  /** Unique fund request ID */
  id: string;
  /** Wallet address the request is for */
  wallet_address: string;
  /** Requested USDC amount as a decimal string */
  amount: string;
  /** Human-readable reason for the funding request */
  reason: string;
  /** Current status of the fund request */
  status: "pending" | "approved" | "denied";
  /** ISO 8601 timestamp when the request was created */
  created_at: string;
}

export interface PolicyResponse {
  /** Wallet address the policy applies to */
  wallet_address: string;
  /** Maximum USDC per transaction, or null for no limit */
  max_per_tx: string | null;
  /** Maximum USDC per day, or null for no limit */
  max_per_day: string | null;
  /** Allowed primitive hostnames (e.g. ["store.prim.sh"]), or null for all primitives */
  allowed_primitives: unknown | null;
  /** USDC spent today so far */
  daily_spent: string;
  /** ISO 8601 timestamp when the daily counter resets */
  daily_reset_at: string;
}

export interface RegisterWalletRequest {
  /** Ethereum wallet address to register */
  address: string;
  /** EIP-191 signature over the registration message */
  signature: string;
  /** ISO 8601 UTC timestamp used in the signed message (must be within 5 min of now) */
  timestamp: string;
  /** Chain identifier. Defaults to "base". */
  chain?: string;
  /** Optional human-readable label for this wallet */
  label?: string;
}

export interface CreateFundRequestRequest {
  /** Requested USDC amount as a decimal string (e.g. "10.00") */
  amount: string;
  /** Human-readable reason for the funding request */
  reason: string;
}

export interface DenyFundRequestRequest {
  /** Optional reason for denying the request */
  reason?: string;
}

export interface UpdatePolicyRequest {
  /** Maximum USDC per transaction. Pass null to remove the limit. */
  maxPerTx?: string | null;
  /** Maximum USDC per day. Pass null to remove the limit. */
  maxPerDay?: string | null;
  /** Allowed primitive hostnames. Pass null to allow all. */
  allowedPrimitives?: unknown | null;
}

export interface PauseWalletRequest {
  /** Which operations to pause */
  scope?: "all" | "send" | "swap";
}

export interface ResumeWalletRequest {
  /** Which operations to resume */
  scope?: "all" | "send" | "swap";
}

export interface ListWalletsParams {
  /** Number of wallets to return (1–100, default 20) */
  limit?: number;
  /** Cursor from a previous response for pagination */
  after?: string;
}

export interface ListFundRequestsParams {
  /** Number of requests to return (1–100, default 20) */
  limit?: number;
  /** Cursor from a previous response for pagination */
  after?: string;
}

export interface RegisterWalletResponse {
  address: string;
  chain: string;
  label: string | null;
  registered_at: string;
  created_at: string;
}

export interface ListWalletsResponse {
  wallets: WalletListItem[];
  /** Opaque cursor for the next page, or null if this is the last page */
  cursor: string | null;
}

export interface DeactivateWalletResponse {
  address: string;
  deactivated: boolean;
  deactivated_at: string;
}

export interface ListFundRequestsResponse {
  requests: FundRequest[];
  /** Opaque cursor for the next page, or null if this is the last page */
  cursor: string | null;
}

export interface ApproveFundRequestResponse {
  id: string;
  status: "approved";
  /** Address to send USDC to in order to fulfill the request */
  funding_address: string;
  /** Approved USDC amount */
  amount: string;
  chain: string;
  approved_at: string;
}

export interface DenyFundRequestResponse {
  id: string;
  status: "denied";
  /** Denial reason if provided, otherwise null */
  reason: string | null;
  denied_at: string;
}

export interface PauseWalletResponse {
  wallet_address: string;
  paused: boolean;
  scope: "all" | "send" | "swap";
  paused_at: string;
}

export interface ResumeWalletResponse {
  wallet_address: string;
  paused: boolean;
  scope: "all" | "send" | "swap";
  resumed_at: string;
}

// ── Client ─────────────────────────────────────────────────────────────────

export function createWalletClient(primFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const baseUrl = "https://wallet.prim.sh";
  return {
    async registerWallet(req: RegisterWalletRequest): Promise<RegisterWalletResponse> {
      const url = `${baseUrl}/v1/wallets`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return res.json() as Promise<RegisterWalletResponse>;
    },
    async listWallets(params: ListWalletsParams): Promise<ListWalletsResponse> {
      const qs = new URLSearchParams();
      if (params.limit !== undefined) qs.set("limit", String(params.limit));
      if (params.after !== undefined) qs.set("after", String(params.after));
      const query = qs.toString();
      const url = `${baseUrl}/v1/wallets${query ? `?${query}` : ""}`;
      const res = await primFetch(url);
      return res.json() as Promise<ListWalletsResponse>;
    },
    async getWallet(): Promise<WalletDetail> {
      const url = `${baseUrl}/v1/wallets/{address}`;
      const res = await primFetch(url);
      return res.json() as Promise<WalletDetail>;
    },
    async deactivateWallet(): Promise<DeactivateWalletResponse> {
      const url = `${baseUrl}/v1/wallets/{address}`;
      const res = await primFetch(url, {
        method: "DELETE",
      });
      return res.json() as Promise<DeactivateWalletResponse>;
    },
    async createFundRequest(req: CreateFundRequestRequest): Promise<FundRequest> {
      const url = `${baseUrl}/v1/wallets/{address}/fund-request`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return res.json() as Promise<FundRequest>;
    },
    async listFundRequests(params: ListFundRequestsParams): Promise<ListFundRequestsResponse> {
      const qs = new URLSearchParams();
      if (params.limit !== undefined) qs.set("limit", String(params.limit));
      if (params.after !== undefined) qs.set("after", String(params.after));
      const query = qs.toString();
      const url = `${baseUrl}/v1/wallets/{address}/fund-requests${query ? `?${query}` : ""}`;
      const res = await primFetch(url);
      return res.json() as Promise<ListFundRequestsResponse>;
    },
    async approveFundRequest(): Promise<ApproveFundRequestResponse> {
      const url = `${baseUrl}/v1/fund-requests/{id}/approve`;
      const res = await primFetch(url, {
        method: "POST",
      });
      return res.json() as Promise<ApproveFundRequestResponse>;
    },
    async denyFundRequest(req: DenyFundRequestRequest): Promise<DenyFundRequestResponse> {
      const url = `${baseUrl}/v1/fund-requests/{id}/deny`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return res.json() as Promise<DenyFundRequestResponse>;
    },
    async getPolicy(): Promise<PolicyResponse> {
      const url = `${baseUrl}/v1/wallets/{address}/policy`;
      const res = await primFetch(url);
      return res.json() as Promise<PolicyResponse>;
    },
    async updatePolicy(req: UpdatePolicyRequest): Promise<PolicyResponse> {
      const url = `${baseUrl}/v1/wallets/{address}/policy`;
      const res = await primFetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return res.json() as Promise<PolicyResponse>;
    },
    async pauseWallet(req: PauseWalletRequest): Promise<PauseWalletResponse> {
      const url = `${baseUrl}/v1/wallets/{address}/pause`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return res.json() as Promise<PauseWalletResponse>;
    },
    async resumeWallet(req: ResumeWalletRequest): Promise<ResumeWalletResponse> {
      const url = `${baseUrl}/v1/wallets/{address}/resume`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return res.json() as Promise<ResumeWalletResponse>;
    },
  };
}
