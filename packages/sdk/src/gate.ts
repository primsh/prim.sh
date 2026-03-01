// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Source: packages/gate/openapi.yaml
// Regenerate: pnpm gen:sdk

// ── Types ──────────────────────────────────────────────────────────────────

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

export interface RedeemRequest {
  /** Invite code (e.g. "PRIM-a1b2c3d4"). */
  code: string;
  /** EVM wallet address to allowlist and fund (0x... checksummed). */
  wallet: string;
}

export interface RedeemResponse {
  /** Always "redeemed" on success. */
  status: "redeemed";
  /** Checksummed wallet address that was funded. */
  wallet: string;
  /** Funding details. */
  funded: FundingDetail;
}

// ── Client ─────────────────────────────────────────────────────────────────

export function createGateClient(
  primFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  baseUrl = "https://gate.prim.sh",
) {
  return {
    async redeemInvite(req: RedeemRequest): Promise<RedeemResponse> {
      const url = `${baseUrl}/v1/redeem`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        let code = "unknown";
        try {
          const body = await res.json() as { error?: { code: string; message: string } };
          if (body.error) { msg = body.error.message; code = body.error.code; }
        } catch {}
        throw new Error(`${msg} (${code})`);
      }
      return res.json() as Promise<RedeemResponse>;
    },
  };
}
