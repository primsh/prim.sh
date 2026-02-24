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
}

export type { Network, PaymentPayload, PaymentRequired } from "@x402/core/types";

