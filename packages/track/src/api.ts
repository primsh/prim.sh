// ─── Track ───────────────────────────────────────────────────────────────────

export interface TrackRequest {
  tracking_number: string;
  carrier?: string;
}

export interface TrackLocation {
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

export interface TrackEvent {
  status: string;
  status_detail: string;
  datetime: string;
  location?: TrackLocation;
}

export interface TrackResponse {
  tracking_number: string;
  carrier: string;
  status: string;
  status_detail: string;
  eta?: string;
  location?: TrackLocation;
  events: TrackEvent[];
}

// ─── Error ───────────────────────────────────────────────────────────────────

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}
