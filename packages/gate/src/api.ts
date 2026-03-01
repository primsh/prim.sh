// ─── gate.sh API types ─────────────────────────────────────────────────

export interface RedeemRequest {
  /** Invite code (e.g. "PRIM-a1b2c3d4"). */
  code: string;
  /** EVM wallet address to allowlist and fund (0x... checksummed). */
  wallet: string;
}

export interface FundingDetail {
  /** USDC amount funded as decimal string (e.g. "5.00"). */
  usdc: string;
  /** ETH amount funded as decimal string (e.g. "0.001"). */
  eth: string;
  /** USDC transfer transaction hash. */
  usdc_tx: string;
  /** ETH transfer transaction hash. */
  eth_tx: string;
}

export interface RedeemResponse {
  /** Always "redeemed" on success. */
  status: "redeemed";
  /** Checksummed wallet address that was funded. */
  wallet: string;
  /** Funding details. */
  funded: FundingDetail;
}

// ─── Code management ─────────────────────────────────────────────────────────

export interface CreateCodesRequest {
  /** Generate N random codes (1–100). */
  count?: number;
  /** Add specific codes. */
  codes?: string[];
  /** Optional batch label (e.g. "beta-batch-1"). */
  label?: string;
}

export interface CreateCodesResponse {
  /** All created codes. */
  codes: string[];
  /** Count actually inserted (excludes dupes). */
  created: number;
}

export interface CodeDetail {
  code: string;
  status: "available" | "redeemed";
  created_at: string | null;
  label: string | null;
  wallet: string | null;
  redeemed_at: string | null;
}

export interface ListCodesResponse {
  codes: CodeDetail[];
  total: number;
}

// ─── Error ────────────────────────────────────────────────────────────────────

export interface ApiError {
  error: {
    /** Machine-readable error code. */
    code: string;
    /** Human-readable error message. */
    message: string;
  };
}

export const ERROR_CODES = [
  "invalid_request",
  "invalid_code",
  "code_redeemed",
  "not_configured",
  "not_found",
  "fund_error",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
