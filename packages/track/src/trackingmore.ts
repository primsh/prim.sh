import { ProviderError } from "./provider.ts";
import type { TrackProvider, TrackProviderData, TrackProviderLocation } from "./provider.ts";

const TRACKINGMORE_BASE_URL = "https://api.trackingmore.com";

// ─── TrackingMore response types ──────────────────────────────────────────────

interface TrackingMoreEvent {
  checkpoint_date?: string;
  tracking_detail?: string;
  checkpoint_delivery_status?: string;
  location?: string;
}

interface TrackingMoreOriginInfo {
  trackinfo?: TrackingMoreEvent[];
}

interface TrackingMoreData {
  tracking_number: string;
  courier_code: string;
  delivery_status: string;
  substatus?: string;
  latest_event?: string;
  latest_checkpoint_time?: string;
  scheduled_delivery_date?: string;
  origin_info?: TrackingMoreOriginInfo;
  destination_info?: TrackingMoreOriginInfo;
}

interface TrackingMoreResponse {
  meta: { code: number; message: string };
  data: TrackingMoreData;
}

interface TrackingMoreGetResponse {
  meta: { code: number; message: string };
  data: TrackingMoreData[];
}

// ─── Status mapping ───────────────────────────────────────────────────────────

// TrackingMore → prim normalized status
const STATUS_MAP: Record<string, string> = {
  pending: "PRE_TRANSIT",
  inforeceived: "PRE_TRANSIT",
  transit: "TRANSIT",
  pickup: "TRANSIT",
  delivered: "DELIVERED",
  undelivered: "RETURNED",
  exception: "FAILURE",
  expired: "FAILURE",
  notfound: "UNKNOWN",
};

function mapStatus(raw: string): string {
  return STATUS_MAP[raw] ?? "UNKNOWN";
}

// ─── Location parsing ─────────────────────────────────────────────────────────

// TrackingMore returns location as a single string e.g. "Memphis, TN, US"
function parseLocation(loc?: string): TrackProviderLocation | undefined {
  if (!loc?.trim()) return undefined;
  const parts = loc.split(",").map((p) => p.trim());
  if (parts.length === 3) return { city: parts[0], state: parts[1], country: parts[2] };
  if (parts.length === 2) return { city: parts[0], country: parts[1] };
  if (parts.length === 1) return { country: parts[0] };
  return undefined;
}

// ─── TrackingMoreClient ───────────────────────────────────────────────────────

export class TrackingMoreClient implements TrackProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async track(trackingNumber: string, carrier: string): Promise<TrackProviderData> {
    const resp = await fetch(`${TRACKINGMORE_BASE_URL}/v4/trackings/create`, {
      method: "POST",
      headers: {
        "Tracking-Api-Key": this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tracking_number: trackingNumber,
        courier_code: carrier,
      }),
    });

    if (resp.status === 429) {
      const retryAfter = Number(resp.headers.get("Retry-After") ?? "60");
      throw new ProviderError("TrackingMore rate limit exceeded", "rate_limited", retryAfter);
    }

    let d: TrackingMoreData;

    if (!resp.ok) {
      // "Tracking No. already exists" → fall back to GET to retrieve the cached result
      let shouldFallbackToGet = false;
      try {
        const errBody = (await resp.json()) as { meta?: { message?: string; code?: number } };
        const msg = errBody.meta?.message ?? "";
        if (/already exists/i.test(msg)) {
          shouldFallbackToGet = true;
        } else {
          throw new ProviderError(msg || `TrackingMore API error: ${resp.status}`, "provider_error");
        }
      } catch (inner) {
        if (inner instanceof ProviderError) throw inner;
        throw new ProviderError(`TrackingMore API error: ${resp.status}`, "provider_error");
      }

      if (shouldFallbackToGet) {
        d = await this.getExisting(trackingNumber, carrier);
      } else {
        throw new ProviderError(`TrackingMore API error: ${resp.status}`, "provider_error");
      }
    } else {
      const body = (await resp.json()) as TrackingMoreResponse;
      if (body.meta.code !== 200) {
        throw new ProviderError(body.meta.message ?? "TrackingMore error", "provider_error");
      }
      d = body.data;
    }

    if (d.delivery_status === "notfound") {
      throw new ProviderError(
        `Tracking number ${trackingNumber} not found for carrier ${carrier}`,
        "not_found",
      );
    }

    // Merge origin + destination trackinfo, dedupe by checkpoint_date, sort newest-first
    const allEvents: TrackingMoreEvent[] = [
      ...(d.origin_info?.trackinfo ?? []),
      ...(d.destination_info?.trackinfo ?? []),
    ];

    const seen = new Set<string>();
    const events = allEvents
      .filter((e) => {
        const key = `${e.checkpoint_date}-${e.tracking_detail}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => {
        const ta = a.checkpoint_date ? new Date(a.checkpoint_date).getTime() : 0;
        const tb = b.checkpoint_date ? new Date(b.checkpoint_date).getTime() : 0;
        return tb - ta; // newest first
      })
      .map((e) => ({
        status: mapStatus(e.checkpoint_delivery_status ?? ""),
        status_detail: e.tracking_detail ?? "",
        datetime: e.checkpoint_date ?? "",
        location: parseLocation(e.location),
      }));

    // Current location from most recent event with a location
    const currentLocation = events.find((e) => e.location)?.location;

    return {
      tracking_number: d.tracking_number,
      carrier: d.courier_code,
      status: mapStatus(d.delivery_status),
      status_detail: d.latest_event ?? "",
      eta: d.scheduled_delivery_date || undefined,
      location: currentLocation,
      events,
    };
  }

  private async getExisting(trackingNumber: string, carrier: string): Promise<TrackingMoreData> {
    const url = new URL(`${TRACKINGMORE_BASE_URL}/v4/trackings/get`);
    url.searchParams.set("tracking_numbers", trackingNumber);
    url.searchParams.set("courier_code", carrier);

    const resp = await fetch(url.toString(), {
      headers: { "Tracking-Api-Key": this.apiKey },
    });

    if (!resp.ok) {
      throw new ProviderError(`TrackingMore GET error: ${resp.status}`, "provider_error");
    }

    const body = (await resp.json()) as TrackingMoreGetResponse;
    if (body.meta.code !== 200 || !body.data?.length) {
      throw new ProviderError("TrackingMore: tracking not found after create", "provider_error");
    }

    return body.data[0] as TrackingMoreData;
  }
}
