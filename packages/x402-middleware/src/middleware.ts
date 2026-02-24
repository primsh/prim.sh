import type { MiddlewareHandler } from "hono";
import { paymentMiddlewareFromConfig } from "@x402/hono";
import { HTTPFacilitatorClient, decodePaymentSignatureHeader } from "@x402/core/http";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import type {
  AgentStackMiddlewareOptions,
  AgentStackRouteConfig,
  RouteConfig,
} from "./types.ts";

const DEFAULT_NETWORK = "eip155:8453";
const DEFAULT_FACILITATOR_URL = "https://x402.org/facilitator";
const WALLET_ADDRESS_KEY = "walletAddress";

interface NormalizedRouteConfig {
  accepts: {
    scheme: "exact";
    network: string;
    payTo: string;
    price: string;
  };
  description?: string;
}

function normalizeRouteConfigEntry(
  pattern: string,
  value: string | RouteConfig,
  options: { payTo: string; network: string },
): [string, NormalizedRouteConfig] {
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
  const network = options.network ?? DEFAULT_NETWORK;
  const facilitatorUrl = options.facilitatorUrl ?? DEFAULT_FACILITATOR_URL;
  const freeRoutes = new Set(options.freeRoutes ?? []);

  const effectiveRoutes: Record<string, NormalizedRouteConfig> = {};

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

  const identity: MiddlewareHandler = async (c, next) => {
    const header =
      c.req.header("PAYMENT-SIGNATURE") ??
      c.req.header("payment-signature") ??
      c.req.header("X-PAYMENT") ??
      c.req.header("x-payment");

    if (header) {
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

    await next();
  };

  if (Object.keys(effectiveRoutes).length === 0) {
    return identity;
  }

  const payment = paymentMiddlewareFromConfig(
    effectiveRoutes as never,
    new HTTPFacilitatorClient({ url: facilitatorUrl }) as never,
    [{ network, server: new ExactEvmScheme() }] as never,
  );

  return async (c, next) => {
    await identity(c, async () => {
      await payment(c, next);
    });
  };
}

