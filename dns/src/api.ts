/**
 * dns.sh API contract — request/response types and error envelope.
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
  "insufficient_deposit",
  "cloudflare_error",
  "rate_limited",
  "not_implemented",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

// ─── Zones ────────────────────────────────────────────────────────────────

export interface Zone {
  id: string;
  name: string;
  status: string;
  name_servers: string[];
  created_at: string;
}

export interface ZoneCreateRequest {
  name: string;
  jump_start?: boolean;
  type?: "full" | "partial";
}

export interface ZoneCreateResponse {
  zone: Zone;
}

export interface ZoneListMeta {
  page: number;
  per_page: number;
  total: number;
}

export interface ZoneListResponse {
  zones: Zone[];
  meta: ZoneListMeta;
}

// ─── DNS records ──────────────────────────────────────────────────────────

export type RecordType =
  | "A"
  | "AAAA"
  | "CNAME"
  | "TXT"
  | "MX"
  | "NS"
  | "SRV"
  | "PTR"
  | "SPF"
  | "CAA";

export interface DnsRecord {
  id: string;
  zone_id: string;
  type: RecordType;
  name: string;
  content: string;
  ttl: number;
  proxied: boolean;
  created_at: string;
  updated_at: string;
}

export interface RecordUpsertRequest {
  type: RecordType;
  name: string;
  content: string;
  ttl?: number;
  proxied?: boolean;
}

export interface RecordUpsertResponse {
  record: DnsRecord;
  action: "created" | "updated";
}

export interface RecordDeleteResponse {
  id: string;
  status: "deleted";
}

