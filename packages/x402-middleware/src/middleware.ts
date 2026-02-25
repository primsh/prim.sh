import type { MiddlewareHandler } from "hono";
import { paymentMiddlewareFromConfig } from "@x402/hono";
import { HTTPFacilitatorClient, decodePaymentSignatureHeader } from "@x402/core/http";
import type { FacilitatorClient, RouteConfig } from "@x402/core/server";
import type { SchemeRegistration } from "@x402/hono";
import type { Network } from "@x402/core/types";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import type {
  AgentStackMiddlewareOptions,
  AgentStackRouteConfig,
  RouteConfig as AgentStackRouteConfigEntry,
} from "./types.ts";

const DEFAULT_NETWORK: Network = "eip155:8453";
const DEFAULT_FACILITATOR_URL = "https://x402.org/facilitator";
const WALLET_ADDRESS_KEY = "walletAddress";

function normalizeRouteConfigEntry(
  pattern: string,
  value: string | AgentStackRouteConfigEntry,
  options: { payTo: string; network: Network },
): [string, RouteConfig] {
  const price = typeof value === "string" ? value : value.price;

  if (!price) {
    throw new Error(`Missing price for route "${pattern}"`);
  }

  const description = typeof value === "string" ? undefined : value.description;

  return [
    pattern,
    {
      accepts: {
        scheme: "exact",
        network: options.network,
        payTo: options.payTo,
        price,
      },
      description,
    },
  ];
}

export function createAgentStackMiddleware(
  options: AgentStackMiddlewareOptions,
  routes: AgentStackRouteConfig,
): MiddlewareHandler {
  const network: Network = (options.network ?? DEFAULT_NETWORK) as Network;
  const facilitatorUrl = options.facilitatorUrl ?? DEFAULT_FACILITATOR_URL;
  const freeRoutes = new Set(options.freeRoutes ?? []);

  const effectiveRoutes: Record<string, RouteConfig> = {};

  for (const [pattern, value] of Object.entries(routes)) {
    if (freeRoutes.has(pattern)) {
      continue;
    }

    const [routeKey, config] = normalizeRouteConfigEntry(pattern, value, {
      payTo: options.payTo,
      network,
    });

    effectiveRoutes[routeKey] = config;
  }

  function extractWalletAddress(c: Parameters<MiddlewareHandler>[0]) {
    const header =
      c.req.header("payment-signature") ?? c.req.header("x-payment");

    if (!header) return;

    try {
      const decoded = decodePaymentSignatureHeader(header) as {
        payload?: { authorization?: { from?: string } };
        authorization?: { from?: string };
        from?: string;
      };

      const from =
        decoded.payload?.authorization?.from ??
        decoded.authorization?.from ??
        decoded.from;

      if (typeof from === "string") {
        c.set(WALLET_ADDRESS_KEY, from);
      }
    } catch {
      // Malformed payment header — ignore and proceed without walletAddress
    }
  }

  if (Object.keys(effectiveRoutes).length === 0) {
    return async (c: Parameters<MiddlewareHandler>[0], next: Parameters<MiddlewareHandler>[1]) => {
      extractWalletAddress(c);
      await next();
    };
  }

  const facilitatorClient: FacilitatorClient = new HTTPFacilitatorClient({
    url: facilitatorUrl,
  });
  const schemes: SchemeRegistration[] = [
    { network, server: new ExactEvmScheme() },
  ];
  const payment = paymentMiddlewareFromConfig(
    effectiveRoutes,
    facilitatorClient,
    schemes,
  );

  return async (c, next) => {
    extractWalletAddress(c);
    return payment(c, next);
  };
}

