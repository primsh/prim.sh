// SPDX-License-Identifier: Apache-2.0
import type { Context } from "hono";

export interface RouteConfig {
  price: string | CostEstimator;
  calculator?: CostCalculator;
  floor?: string;
  description?: string;
}

export type AgentStackRouteConfig = Record<string, string | RouteConfig>;

// ─── Metered billing types ───────────────────────────────────────────────────

/** Estimates the cost of a request before processing. Returns a decimal USDC string. */
export type CostEstimator = (c: Context) => Promise<string>;

/** Calculates the actual cost after the response. Returns a decimal USDC string. */
export type CostCalculator = (c: Context, response: Response) => Promise<string>;

/** Configuration for the credit ledger system. */
export interface MeteredConfig {
  dbPath: string;
  /** Maximum negative balance allowed per wallet (decimal USDC, default "0.05"). */
  negativeCap?: string;
  /** Days of inactivity before positive credits expire (default 30). */
  creditExpiryDays?: number;
}

export interface AgentStackMiddlewareOptions {
  payTo: string;
  network?: string;
  facilitatorUrl?: string;
  freeRoutes?: string[];
  allowlist?: string[];
  /** Async function to check if a wallet is allowed. Called after static allowlist check. */
  checkAllowlist?: (address: string) => Promise<boolean>;
  /** URL where blocked agents can request access (included in 403 response) */
  accessUrl?: string;
  /** Per-wallet rate limiting. Pass `true` for defaults (60 req/min) or a config object. */
  rateLimit?: boolean | { max?: number; windowMs?: number };
  /**
   * Routes that accept a session JWT (Authorization: Bearer) as alternative to x402.
   * If a valid JWT is present, walletAddress is set and x402 is skipped.
   * If no JWT, falls through to x402 payment flow.
   */
  identityRoutes?: string[];
  /** Credit ledger for metered billing. When present, credit is checked before x402. */
  creditLedger?: import("./credit.js").CreditLedger;
}

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string; retryAfter?: number };

export type { Network, PaymentPayload, PaymentRequired } from "@x402/core/types";
