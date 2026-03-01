// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Source: packages/faucet/openapi.yaml
// Regenerate: pnpm gen:sdk

// ── Types ──────────────────────────────────────────────────────────────────

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

export interface RefillResult {
  claimed: number;
  failed: number;
  estimated_eth: string;
  tx_hashes: string[];
}

export interface TreasuryStatus {
  address: string;
  eth_balance: string;
  needs_refill: boolean;
}

export interface GetFaucetStatusParams {
  /** EVM wallet address (required) */
  address?: string;
}

// ── Client ─────────────────────────────────────────────────────────────────

export function createFaucetClient(primFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const baseUrl = "https://faucet.prim.sh";
  return {
    async dripUsdc(req: DripRequest): Promise<DripResponse> {
      const url = `${baseUrl}/v1/faucet/usdc`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return res.json() as Promise<DripResponse>;
    },
    async dripEth(req: DripRequest): Promise<DripResponse> {
      const url = `${baseUrl}/v1/faucet/eth`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return res.json() as Promise<DripResponse>;
    },
    async getFaucetStatus(params: GetFaucetStatusParams): Promise<FaucetStatusResponse> {
      const qs = new URLSearchParams();
      if (params.address !== undefined) qs.set("address", String(params.address));
      const query = qs.toString();
      const url = `${baseUrl}/v1/faucet/status${query ? `?${query}` : ""}`;
      const res = await primFetch(url);
      return res.json() as Promise<FaucetStatusResponse>;
    },
    async getTreasuryStatus(): Promise<TreasuryStatus> {
      const url = `${baseUrl}/v1/faucet/treasury`;
      const res = await primFetch(url);
      return res.json() as Promise<TreasuryStatus>;
    },
    async refillTreasury(): Promise<RefillResult> {
      const url = `${baseUrl}/v1/faucet/refill`;
      const res = await primFetch(url, {
        method: "POST",
      });
      return res.json() as Promise<RefillResult>;
    },
  };
}
