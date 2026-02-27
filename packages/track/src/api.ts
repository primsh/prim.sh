// ─── Track ───────────────────────────────────────────────────────────────────

export interface TrackRequest {
  /** Shipment tracking number. */
  tracking_number: string;
  /** Carrier slug (e.g. "usps", "ups", "fedex"). Omit to auto-detect. */
  carrier?: string;
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

// ─── Error ───────────────────────────────────────────────────────────────────

export interface ApiError {
  error: {
    /** Machine-readable error code. */
    code: string;
    /** Human-readable error message. */
    message: string;
  };
}

export const ERROR_CODES = [
  "invalid_request",
  "not_found",
  "rate_limited",
  "provider_error",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
