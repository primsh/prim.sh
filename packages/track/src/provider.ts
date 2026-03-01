// SPDX-License-Identifier: Apache-2.0
// ─── Provider result types ────────────────────────────────────────────────────

export interface TrackProviderLocation {
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

export interface TrackProviderEvent {
  status: string;
  status_detail: string;
  datetime: string;
  location?: TrackProviderLocation;
}

export interface TrackProviderData {
  tracking_number: string;
  carrier: string;
  status: string;
  status_detail: string;
  eta?: string;
  location?: TrackProviderLocation;
  events: TrackProviderEvent[];
}

// ─── Provider interface ───────────────────────────────────────────────────────

export interface TrackProvider {
  track(trackingNumber: string, carrier: string): Promise<TrackProviderData>;
}

// ─── Error ────────────────────────────────────────────────────────────────────

export class ProviderError extends Error {
  code: "not_found" | "invalid_request" | "provider_error" | "rate_limited";
  retryAfter?: number;

  constructor(
    message: string,
    code: "not_found" | "invalid_request" | "provider_error" | "rate_limited" = "provider_error",
    retryAfter?: number,
  ) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.retryAfter = retryAfter;
  }
}
