/**
 * domain.sh API contract — request/response types and error envelope.
 */

// ─── Error envelope ───────────────────────────────────────────────────────

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

export const ERROR_CODES = [
  "not_found",
  "forbidden",
  "invalid_request",
  "cloudflare_error",
  "rate_limited",
  "domain_taken",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

// ─── Zone types ──────────────────────────────────────────────────────────

export type ZoneStatus = "pending" | "active" | "moved";

export interface ZoneResponse {
  id: string;
  domain: string;
  status: ZoneStatus;
  name_servers: string[];
  owner_wallet: string;
  created_at: string;
}

export interface CreateZoneRequest {
  domain: string;
}

export interface CreateZoneResponse {
  zone: ZoneResponse;
}

export interface ZoneListResponse {
  zones: ZoneResponse[];
  meta: {
    page: number;
    per_page: number;
    total: number;
  };
}

// ─── Record types ────────────────────────────────────────────────────────

export type RecordType = "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "SRV" | "CAA" | "NS";

export interface RecordResponse {
  id: string;
  zone_id: string;
  type: RecordType;
  name: string;
  content: string;
  ttl: number;
  proxied: boolean;
  priority: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateRecordRequest {
  type: RecordType;
  name: string;
  content: string;
  ttl?: number;
  proxied?: boolean;
  priority?: number;
}

export interface UpdateRecordRequest {
  type?: RecordType;
  name?: string;
  content?: string;
  ttl?: number;
  proxied?: boolean;
  priority?: number;
}

export interface RecordListResponse {
  records: RecordResponse[];
}

// ─── Domain search types ──────────────────────────────────────────────────

export interface DomainSearchPrice {
  register: number;
  renew: number;
  currency: string;
}

export interface DomainSearchResult {
  domain: string;
  available: boolean;
  price?: DomainSearchPrice;
  premium?: boolean;
}

export interface DomainSearchResponse {
  results: DomainSearchResult[];
}
