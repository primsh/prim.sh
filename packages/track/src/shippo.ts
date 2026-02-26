import { ProviderError } from "./provider.ts";
import type { TrackProvider, TrackProviderData, TrackProviderLocation } from "./provider.ts";

const SHIPPO_BASE_URL = "https://api.goshippo.com";

// ─── Shippo response types ────────────────────────────────────────────────────

interface ShippoLocation {
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

interface ShippoTrackingEvent {
  status: string;
  status_details: string;
  status_date: string;
  location?: ShippoLocation;
}

interface ShippoTrackingStatus {
  status: string;
  status_details: string;
  status_date: string;
  location?: ShippoLocation;
}

interface ShippoTrackResponse {
  carrier: string;
  tracking_number: string;
  eta?: string;
  tracking_status?: ShippoTrackingStatus;
  tracking_history?: ShippoTrackingEvent[];
}

// ─── ShippoClient ─────────────────────────────────────────────────────────────

export class ShippoClient implements TrackProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private mapLocation(loc?: ShippoLocation): TrackProviderLocation | undefined {
    if (!loc) return undefined;
    if (!loc.city && !loc.state && !loc.zip && !loc.country) return undefined;
    return {
      city: loc.city || undefined,
      state: loc.state || undefined,
      zip: loc.zip || undefined,
      country: loc.country || undefined,
    };
  }

  async track(trackingNumber: string, carrier: string): Promise<TrackProviderData> {
    const url = `${SHIPPO_BASE_URL}/tracks/${encodeURIComponent(carrier)}/${encodeURIComponent(trackingNumber)}`;

    const resp = await fetch(url, {
      headers: {
        Authorization: `ShippoToken ${this.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (resp.status === 404) {
      throw new ProviderError(
        `Tracking number ${trackingNumber} not found for carrier ${carrier}`,
        "not_found",
      );
    }

    if (resp.status === 429) {
      const retryAfter = Number(resp.headers.get("Retry-After") ?? "60");
      throw new ProviderError("Shippo rate limit exceeded", "rate_limited", retryAfter);
    }

    if (!resp.ok) {
      let message = `Shippo API error: ${resp.status}`;
      try {
        const data = (await resp.json()) as { detail?: string; message?: string };
        message = data.detail ?? data.message ?? message;
      } catch {
        /* ignore parse errors */
      }
      throw new ProviderError(message, "provider_error");
    }

    const data = (await resp.json()) as ShippoTrackResponse;

    const status = data.tracking_status?.status ?? "UNKNOWN";
    const statusDetail = data.tracking_status?.status_details ?? "";
    const location = this.mapLocation(data.tracking_status?.location);

    // History newest-first (Shippo returns oldest-first)
    const history = (data.tracking_history ?? []).slice().reverse();

    const events = history.map((e) => ({
      status: e.status,
      status_detail: e.status_details,
      datetime: e.status_date,
      location: this.mapLocation(e.location),
    }));

    return {
      tracking_number: data.tracking_number,
      carrier: data.carrier,
      status,
      status_detail: statusDetail,
      eta: data.eta || undefined,
      location,
      events,
    };
  }
}
