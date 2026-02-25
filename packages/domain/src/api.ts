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
  renew?: number; // not returned by checkRegisterAvailability; omitted means unknown
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

// ─── Batch record types ────────────────────────────────────────────────────

export interface BatchCreateEntry {
  type: RecordType;
  name: string;
  content: string;
  ttl?: number;
  proxied?: boolean;
  priority?: number;
}

export interface BatchUpdateEntry {
  id: string;
  content?: string;
  ttl?: number;
  proxied?: boolean;
  priority?: number;
  type?: RecordType;
  name?: string;
}

export interface BatchDeleteEntry {
  id: string;
}

export interface BatchRecordsRequest {
  create?: BatchCreateEntry[];
  update?: BatchUpdateEntry[];
  delete?: BatchDeleteEntry[];
}

export interface BatchRecordsResponse {
  created: RecordResponse[];
  updated: RecordResponse[];
  deleted: { id: string }[];
}

// ─── Verify types ──────────────────────────────────────────────────────────

export interface NsVerifyResult {
  expected: string[];
  actual: string[];
  propagated: boolean;
}

export interface RecordVerifyResult {
  type: RecordType;
  name: string;
  expected: string;
  actual: string | null;
  propagated: boolean;
}

export interface VerifyResponse {
  domain: string;
  nameservers: NsVerifyResult;
  records: RecordVerifyResult[];
  all_propagated: boolean;
}

// ─── Mail setup types ──────────────────────────────────────────────────────

export interface DkimKey {
  selector: string;
  public_key: string;
}

export interface MailSetupRequest {
  mail_server: string;
  mail_server_ip: string;
  dkim?: {
    rsa?: DkimKey;
    ed25519?: DkimKey;
  };
}

export interface MailSetupRecordResult {
  type: RecordType;
  name: string;
  action: "created" | "updated";
}

export interface MailSetupResponse {
  records: MailSetupRecordResult[];
}
