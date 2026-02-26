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
}

export type { Network, PaymentPayload, PaymentRequired } from "@x402/core/types";

