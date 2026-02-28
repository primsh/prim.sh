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
  "fund_error",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
