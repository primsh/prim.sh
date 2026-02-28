import type { TrackRequest, TrackResponse } from "./api.ts";
import { ProviderError } from "./provider.ts";
import type { TrackProvider } from "./provider.ts";
import { TrackingMoreClient } from "./trackingmore.ts";

// Re-export for convenience
export { ProviderError } from "./provider.ts";

type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string; retryAfter?: number };

// ─── Carrier normalization ────────────────────────────────────────────────────

// TrackingMore courier codes: https://www.trackingmore.com/courier-list.html
// DHL Express = "dhl", DHL eCommerce = "dhl-ecommerce" (different from Shippo slugs)
const CARRIER_ALIASES: Record<string, string> = {
  ups: "ups",
  "united parcel": "ups",
  "united parcel service": "ups",
  usps: "usps",
  "united states postal": "usps",
  "united states postal service": "usps",
  fedex: "fedex",
  "federal express": "fedex",
  dhl: "dhl",
  "dhl express": "dhl",
  dhl_express: "dhl",
  "dhl ecommerce": "dhl-ecommerce",
  dhl_ecommerce: "dhl-ecommerce",
  "dhl-ecommerce": "dhl-ecommerce",
  amazon: "amazon",
  ontrac: "ontrac",
  lasership: "lasership",
};

export function normalizeCarrier(carrier: string): string {
  const key = carrier.toLowerCase().replace(/_/g, " ").trim();
  return CARRIER_ALIASES[key] ?? carrier.toLowerCase().replace(/\s+/g, "_");
}

// ─── Singleton client ─────────────────────────────────────────────────────────

let _client: TrackingMoreClient | undefined;
let _clientKey: string | undefined;

export function resetClient(): void {
  _client = undefined;
  _clientKey = undefined;
}

function getClient(): TrackingMoreClient {
  const key = process.env.TRACKINGMORE_API_KEY;
  if (!key) throw new ProviderError("TRACKINGMORE_API_KEY is not configured", "provider_error");
  if (!_client || _clientKey !== key) {
    _client = new TrackingMoreClient(key);
    _clientKey = key;
  }
  return _client;
}

// ─── Error mapping ────────────────────────────────────────────────────────────

function handleProviderError(err: unknown): ServiceResult<never> {
  if (err instanceof ProviderError) {
    if (err.code === "not_found")
      return { ok: false, status: 404, code: "not_found", message: err.message };
    if (err.code === "invalid_request")
      return { ok: false, status: 400, code: "invalid_request", message: err.message };
    if (err.code === "rate_limited") {
      return {
        ok: false,
        status: 429,
        code: "rate_limited",
        message: err.message,
        retryAfter: err.retryAfter,
      };
    }
    return { ok: false, status: 502, code: "provider_error", message: err.message };
  }
  throw err;
}

// ─── trackPackage ─────────────────────────────────────────────────────────────

export async function trackPackage(
  request: TrackRequest,
  provider?: TrackProvider,
): Promise<ServiceResult<TrackResponse>> {
  if (!request.tracking_number?.trim()) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "tracking_number is required",
    };
  }

  const carrier = normalizeCarrier(request.carrier?.trim() || "usps");

  try {
    const p = provider ?? getClient();
    const data = await p.track(request.tracking_number.trim(), carrier);
    return {
      ok: true,
      data: {
        tracking_number: data.tracking_number,
        carrier: data.carrier,
        status: data.status,
        status_detail: data.status_detail,
        eta: data.eta,
        location: data.location,
        events: data.events,
      },
    };
  } catch (err) {
    return handleProviderError(err);
  }
}
