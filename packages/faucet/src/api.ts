/**
 * faucet.sh API contract — request/response types and error envelope.
 */

// ─── Error envelope ───────────────────────────────────────────────────────

export interface ApiError {
  error: {
    /** Machine-readable error code. */
    code: string;
    /** Human-readable error message. */
    message: string;
    /** Seconds until rate limit resets. Only present on 429 responses. */
    retryAfter?: number;
  };
}

export const ERROR_CODES = [
  "invalid_request",
  "wallet_not_allowed",
  "mainnet_rejected",
  "rate_limited",
  "faucet_error",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

// ─── Drip types ───────────────────────────────────────────────────────────

export interface DripRequest {
  /** EVM wallet address to drip to (0x... 42 chars). */
  address: string;
}

export interface DripResponse {
  /** Transaction hash on Base Sepolia. May be "pending" if Circle returns 204. */
  tx_hash: string;
  /** Amount dispensed as a decimal string (e.g. "10.00" for USDC, "0.01" for ETH). */
  amount: string;
  /** Currency dispensed: "USDC" or "ETH". */
  currency: string;
  /** CAIP-2 chain identifier (e.g. "eip155:84532"). */
  chain: string;
  /** Backend that dispensed the tokens. "circle" | "treasury". Only present on USDC drips. */
  source?: string;
}

// ─── Status types ─────────────────────────────────────────────────────────

export interface FaucetAvailability {
  /** Whether the faucet can be called right now for this address. */
  available: boolean;
  /** Milliseconds until rate limit resets. 0 if available. */
  retry_after_ms: number;
}

export interface FaucetStatusResponse {
  /** The queried wallet address (checksummed). */
  address: string;
  /** USDC faucet availability (2-hour cooldown). */
  usdc: FaucetAvailability;
  /** ETH faucet availability (1-hour cooldown). */
  eth: FaucetAvailability;
}
