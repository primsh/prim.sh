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
const DEFAULT_FACILITATOR_URL =
  process.env.FACILITATOR_URL ?? "https://facilitator.payai.network";
const WALLET_ADDRESS_KEY = "walletAddress";
const WALLET_CHECK_TIMEOUT_MS = 2000;

/**
 * Creates a `checkAllowlist` callback that queries wallet.sh's internal API.
 * Fail-closed: on timeout or network error, denies access and logs a warning.
 *
 * @param walletInternalUrl - Base URL for wallet.sh internal API (e.g. "http://127.0.0.1:3001")
 */
export function createWalletAllowlistChecker(walletInternalUrl: string): (address: string) => Promise<boolean> {
  return async (address: string): Promise<boolean> => {
    const url = `${walletInternalUrl}/internal/allowlist/check?address=${encodeURIComponent(address)}`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), WALLET_CHECK_TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(url, { signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) {
        console.warn(`[allowlist] wallet.sh returned ${res.status} for ${address} — denying`);
        return false;
      }
      const body = (await res.json()) as { allowed: boolean };
      return body.allowed === true;
    } catch (err) {
      const reason = err instanceof Error && err.name === "AbortError" ? "timeout" : String(err);
      console.warn(`[allowlist] wallet.sh check failed (${reason}) for ${address} — denying`);
      return false;
    }
  };
}

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

function buildAllowlist(options: AgentStackMiddlewareOptions): Set<string> | null {
  const raw: string[] = [];

  if (options.allowlist && options.allowlist.length > 0) {
    raw.push(...options.allowlist);
  }

  const envVar = process.env.PRIM_ALLOWLIST;
  if (envVar && envVar.trim().length > 0) {
    raw.push(...envVar.split(",").map((s) => s.trim()).filter(Boolean));
  }

  if (raw.length === 0) return null;

  return new Set(raw.map((addr) => addr.toLowerCase()));
}

export function createAgentStackMiddleware(
  options: AgentStackMiddlewareOptions,
  routes: AgentStackRouteConfig,
): MiddlewareHandler {
  const network: Network = (options.network ?? DEFAULT_NETWORK) as Network;
  const facilitatorUrl = options.facilitatorUrl ?? DEFAULT_FACILITATOR_URL;
  const freeRoutes = new Set(options.freeRoutes ?? []);
  const allowlist = buildAllowlist(options);
  const accessUrl = options.accessUrl ?? process.env.PRIM_ACCESS_URL;

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

  async function denyWallet(c: Parameters<MiddlewareHandler>[0]): Promise<boolean> {
    if (!allowlist && !options.checkAllowlist) return false;
    const wallet = c.get(WALLET_ADDRESS_KEY) as string | undefined;
    if (!wallet) return false; // No payment header yet — let x402 return 402
    const lower = wallet.toLowerCase();
    if (allowlist?.has(lower)) return false; // Static allowlist fast path
    if (options.checkAllowlist) return !(await options.checkAllowlist(lower));
    // Static allowlist exists but wallet not found
    return true;
  }

  if (Object.keys(effectiveRoutes).length === 0) {
    return async (c: Parameters<MiddlewareHandler>[0], next: Parameters<MiddlewareHandler>[1]) => {
      extractWalletAddress(c);
      if (await denyWallet(c)) {
        return c.json({
          error: "wallet_not_allowed",
          message: accessUrl
            ? `This service is in private beta. Request access via ${accessUrl}`
            : "This service is in private beta",
          ...(accessUrl && { access_url: accessUrl }),
        }, 403);
      }
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
    if (await denyWallet(c)) {
      return c.json({
          error: "wallet_not_allowed",
          message: accessUrl
            ? `This service is in private beta. Request access via ${accessUrl}`
            : "This service is in private beta",
          ...(accessUrl && { access_url: accessUrl }),
        }, 403);
    }
    return payment(c, next);
  };
}

