// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Source: packages/track/openapi.yaml
// Regenerate: pnpm gen:sdk

// ── Types ──────────────────────────────────────────────────────────────────

export interface TrackEvent {
  /** Event status summary (e.g. "In Transit"). */
  status: string;
  /** Detailed status description. */
  status_detail: string;
  /** ISO 8601 timestamp of the event. */
  datetime: string;
  /** Location where the event occurred. */
  location?: TrackLocation;
}

export interface TrackLocation {
  /** City name. */
  city?: string;
  /** State or province. */
  state?: string;
  /** Postal code. */
  zip?: string;
  /** Two-letter ISO 3166-1 country code. */
  country?: string;
}

export interface TrackRequest {
  /** Shipment tracking number. */
  tracking_number: string;
  /** Carrier slug (e.g. "usps", "ups", "fedex"). Omit to auto-detect. */
  carrier?: string;
}

export interface TrackResponse {
  /** Tracking number echoed back. */
  tracking_number: string;
  /** Detected or specified carrier slug. */
  carrier: string;
  /** Current status summary (e.g. "Delivered"). */
  status: string;
  /** Detailed current status description. */
  status_detail: string;
  /** Estimated delivery date (ISO 8601). Only present if available. */
  eta?: string;
  /** Current package location. Only present if available. */
  location?: TrackLocation;
  /** Chronological list of tracking events (newest first). */
  events: TrackEvent[];
}

// ── Client ─────────────────────────────────────────────────────────────────

export function createTrackClient(
  primFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  baseUrl = "https://track.prim.sh",
) {
  return {
    async trackPackage(req: TrackRequest): Promise<TrackResponse> {
      const url = `${baseUrl}/v1/track`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        let code = "unknown";
        try {
          const body = await res.json() as { error?: { code: string; message: string } };
          if (body.error) { msg = body.error.message; code = body.error.code; }
        } catch {}
        throw new Error(`${msg} (${code})`);
      }
      return res.json() as Promise<TrackResponse>;
    },
  };
}
