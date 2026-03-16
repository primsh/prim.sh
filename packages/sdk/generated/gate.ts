// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Source: packages/gate/generated/openapi.yaml
// Regenerate: pnpm gen:sdk

import { unwrap } from "../src/shared.js";

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
  status: string;
  /** Checksummed wallet address that was funded. */
  wallet: string;
  /** Network the funds were sent on (e.g. "eip155:8453"). */
  network: string;
  /** Funding details. */
  funded: FundingDetail;
  /** Whether the wallet was auto-registered on wallet.sh. */
  wallet_registered: boolean;
  /** Whether infer.sh credit was seeded for instant responses. */
  credit_seeded: boolean;
}

// ── Client ─────────────────────────────────────────────────────────────────

export function createGateClient(
  primFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  baseUrl = "https://gate.prim.sh",
) {
  return {
    async redeem(req: RedeemRequest): Promise<RedeemResponse> {
      const url = `${baseUrl}/v1/redeem`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return unwrap<RedeemResponse>(res);
    },
  };
}
