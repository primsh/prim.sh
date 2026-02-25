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
  "quote_expired",
  "registrar_error",
  "registration_failed",
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

// ─── Quote / Register / Recover types ────────────────────────────────────

export interface QuoteRequest {
  domain: string;
  years?: number;
}

export interface QuoteResponse {
  quote_id: string;
  domain: string;
  available: true;
  years: number;
  registrar_cost_usd: number;
  total_cost_usd: number;
  currency: string;
  expires_at: string; // ISO 8601
}

export interface RegisterRequest {
  quote_id: string;
}

export interface RegisterResponse {
  domain: string;
  registered: true;
  zone_id: string | null;
  nameservers: string[] | null;
  order_amount_usd: number;
  ns_configured: boolean;
  recovery_token: string | null;
}

export interface RecoverRequest {
  recovery_token: string;
}

export interface RecoverResponse {
  domain: string;
  zone_id: string;
  nameservers: string[];
  ns_configured: boolean;
}

export interface ConfigureNsResponse {
  domain: string;
  nameservers: string[];
  ns_configured: true;
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
  zone_status: ZoneStatus | null;
}

// ─── Registration status types ─────────────────────────────────────────────

export interface RegistrationStatusResponse {
  domain: string;
  purchased: true;
  zone_id: string | null;
  zone_status: ZoneStatus | null;
  ns_configured_at_registrar: boolean;
  ns_propagated: boolean;
  ns_expected: string[];
  ns_actual: string[];
  zone_active: boolean;
  all_ready: boolean;
  next_action: string | null;
}

export interface ActivateResponse {
  zone_id: string;
  status: ZoneStatus;
  activation_requested: true;
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
