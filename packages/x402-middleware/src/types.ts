// SPDX-License-Identifier: Apache-2.0
export interface RouteConfig {
  price: string;
  description?: string;
}

export type AgentStackRouteConfig = Record<string, string | RouteConfig>;

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
}

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string; retryAfter?: number };

export type { Network, PaymentPayload, PaymentRequired } from "@x402/core/types";
