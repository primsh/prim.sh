// SPDX-License-Identifier: Apache-2.0
/**
 * domain.sh API contract — request/response types and error envelope.
 */

// ─── Error envelope ───────────────────────────────────────────────────────

export interface ApiError {
  error: {
    /** Machine-readable error code. */
    code: string;
    /** Human-readable error message. */
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
  /** Cloudflare zone ID. */
  id: string;
  /** Domain name (e.g. "example.com"). */
  domain: string;
  /** Zone status: "pending" | "active" | "moved". */
  status: ZoneStatus;
  /** Cloudflare nameservers to delegate to. */
  name_servers: string[];
  /** Ethereum address of the zone owner. */
  owner_wallet: string;
  /** ISO 8601 timestamp when the zone was created. */
  created_at: string;
}

export interface CreateZoneRequest {
  /** Domain name to create a zone for (e.g. "example.com"). */
  domain: string;
}

export interface CreateZoneResponse {
  /** The created zone. */
  zone: ZoneResponse;
}

// ─── Record types ────────────────────────────────────────────────────────

export type RecordType = "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "SRV" | "CAA" | "NS";

export interface RecordResponse {
  /** DNS record ID. */
  id: string;
  /** Zone ID this record belongs to. */
  zone_id: string;
  /** DNS record type. */
  type: RecordType;
  /** DNS record name (hostname, relative to zone). */
  name: string;
  /** DNS record value. */
  content: string;
  /** TTL in seconds. */
  ttl: number;
  /** Whether Cloudflare proxying is enabled. */
  proxied: boolean;
  /** Priority for MX and SRV records. Null for other types. */
  priority: number | null;
  /** ISO 8601 timestamp when the record was created. */
  created_at: string;
  /** ISO 8601 timestamp when the record was last updated. */
  updated_at: string;
}

export interface CreateRecordRequest {
  /** DNS record type. */
  type: RecordType;
  /** DNS record name (hostname). */
  name: string;
  /** DNS record value. */
  content: string;
  /** TTL in seconds. Default 1 (auto). */
  ttl?: number;
  /** Enable Cloudflare proxying. Default false. */
  proxied?: boolean;
  /** Priority for MX and SRV records. */
  priority?: number;
}

export interface UpdateRecordRequest {
  /** DNS record type. */
  type?: RecordType;
  /** DNS record name. */
  name?: string;
  /** DNS record value. */
  content?: string;
  /** TTL in seconds. */
  ttl?: number;
  /** Enable Cloudflare proxying. */
  proxied?: boolean;
  /** Priority for MX and SRV records. */
  priority?: number;
}

// ─── Domain search types ──────────────────────────────────────────────────

export interface DomainSearchPrice {
  /** Registration cost in USD. */
  register: number;
  /** Renewal cost in USD. Not returned by checkRegisterAvailability; omitted means unknown. */
  renew?: number;
  /** Currency code (e.g. "USD"). */
  currency: string;
}

export interface DomainSearchResult {
  /** Domain name queried. */
  domain: string;
  /** Whether the domain is available for registration. */
  available: boolean;
  /** Pricing info. Only present if available is true. */
  price?: DomainSearchPrice;
  /** Whether this is a premium domain with higher pricing. */
  premium?: boolean;
}

export interface DomainSearchResponse {
  /** Search results for each queried domain. */
  results: DomainSearchResult[];
}

// ─── Batch record types ────────────────────────────────────────────────────

export interface BatchCreateEntry {
  /** DNS record type. */
  type: RecordType;
  /** DNS record name. */
  name: string;
  /** DNS record value. */
  content: string;
  /** TTL in seconds. Default 1 (auto). */
  ttl?: number;
  /** Enable Cloudflare proxying. Default false. */
  proxied?: boolean;
  /** Priority for MX and SRV records. */
  priority?: number;
}

export interface BatchUpdateEntry {
  /** ID of the record to update. */
  id: string;
  /** New DNS record value. */
  content?: string;
  /** New TTL in seconds. */
  ttl?: number;
  /** Updated proxying flag. */
  proxied?: boolean;
  /** Updated priority. */
  priority?: number;
  /** Updated record type. */
  type?: RecordType;
  /** Updated record name. */
  name?: string;
}

export interface BatchDeleteEntry {
  /** ID of the record to delete. */
  id: string;
}

export interface BatchRecordsRequest {
  /** Records to create. */
  create?: BatchCreateEntry[];
  /** Records to update. */
  update?: BatchUpdateEntry[];
  /** Records to delete. */
  delete?: BatchDeleteEntry[];
}

export interface BatchRecordsResponse {
  /** Successfully created records. */
  created: RecordResponse[];
  /** Successfully updated records. */
  updated: RecordResponse[];
  /** IDs of deleted records. */
  deleted: { id: string }[];
}

// ─── Quote / Register / Recover types ────────────────────────────────────

export interface QuoteRequest {
  /** Domain name to quote (e.g. "example.com"). */
  domain: string;
  /** Number of years to register. Default 1. */
  years?: number;
}

export interface QuoteResponse {
  /** Quote ID to use when calling POST /v1/domains/register. */
  quote_id: string;
  /** Domain name quoted. */
  domain: string;
  /** Always true — quote is only returned for available domains. */
  available: true;
  /** Number of years in the quote. */
  years: number;
  /** Registrar cost in USD (internal cost). */
  registrar_cost_usd: number;
  /** Total cost in USD charged to the caller. */
  total_cost_usd: number;
  /** Currency code (e.g. "USD"). */
  currency: string;
  /** ISO 8601 timestamp when the quote expires. Use within the window to avoid quote_expired. */
  expires_at: string;
}

export interface RegisterRequest {
  /** Quote ID from POST /v1/domains/quote. */
  quote_id: string;
}

export interface RegisterResponse {
  /** Registered domain name. */
  domain: string;
  /** Always true on success. */
  registered: true;
  /** Cloudflare zone ID. Null if zone creation failed. */
  zone_id: string | null;
  /** Cloudflare nameservers to delegate to. Null if zone creation failed. */
  nameservers: string[] | null;
  /** Order amount charged in USD. */
  order_amount_usd: number;
  /** Whether nameservers were configured at the registrar. */
  ns_configured: boolean;
  /** Recovery token to restore zone access. Store securely. Null if zone creation failed. */
  recovery_token: string | null;
}

export interface RecoverRequest {
  /** Recovery token from the original registration response. */
  recovery_token: string;
}

export interface RecoverResponse {
  /** Domain name recovered. */
  domain: string;
  /** Recovered Cloudflare zone ID. */
  zone_id: string;
  /** Cloudflare nameservers. */
  nameservers: string[];
  /** Whether nameservers are configured at the registrar. */
  ns_configured: boolean;
}

export interface ConfigureNsResponse {
  /** Domain name. */
  domain: string;
  /** Cloudflare nameservers configured. */
  nameservers: string[];
  /** Always true on success. */
  ns_configured: true;
}

// ─── Verify types ──────────────────────────────────────────────────────────

export interface NsVerifyResult {
  /** Expected Cloudflare nameservers. */
  expected: string[];
  /** Nameservers found in DNS. */
  actual: string[];
  /** Whether nameservers have propagated. */
  propagated: boolean;
}

export interface RecordVerifyResult {
  /** DNS record type. */
  type: RecordType;
  /** DNS record name. */
  name: string;
  /** Expected DNS record value. */
  expected: string;
  /** Actual DNS record value found. Null if not found. */
  actual: string | null;
  /** Whether the record has propagated. */
  propagated: boolean;
}

export interface VerifyResponse {
  /** Domain name. */
  domain: string;
  /** Nameserver propagation result. */
  nameservers: NsVerifyResult;
  /** Per-record propagation results. */
  records: RecordVerifyResult[];
  /** Whether all records and nameservers have propagated. */
  all_propagated: boolean;
  /** Current Cloudflare zone status. Null if zone not found. */
  zone_status: ZoneStatus | null;
}

// ─── Registration status types ─────────────────────────────────────────────

export interface RegistrationStatusResponse {
  /** Domain name. */
  domain: string;
  /** Always true — only returned for registered domains. */
  purchased: true;
  /** Cloudflare zone ID. Null if zone not yet created. */
  zone_id: string | null;
  /** Current zone status. Null if zone not yet created. */
  zone_status: ZoneStatus | null;
  /** Whether nameservers are configured at the registrar. */
  ns_configured_at_registrar: boolean;
  /** Whether nameservers have propagated in DNS. */
  ns_propagated: boolean;
  /** Expected Cloudflare nameservers. */
  ns_expected: string[];
  /** Nameservers currently found in DNS. */
  ns_actual: string[];
  /** Whether the Cloudflare zone is active. */
  zone_active: boolean;
  /** Whether the domain is fully set up and ready. */
  all_ready: boolean;
  /** Human-readable next action required. Null if all_ready is true. */
  next_action: string | null;
}

export interface ActivateResponse {
  /** Cloudflare zone ID. */
  zone_id: string;
  /** Updated zone status. */
  status: ZoneStatus;
  /** Always true — activation was requested from Cloudflare. */
  activation_requested: true;
}

// ─── Mail setup types ──────────────────────────────────────────────────────

export interface DkimKey {
  /** DKIM selector (e.g. "rsa2048"). */
  selector: string;
  /** DKIM public key string. */
  public_key: string;
}

export interface MailSetupRequest {
  /** Mail server hostname (e.g. "mail.prim.sh"). */
  mail_server: string;
  /** Mail server IPv4 address (used for SPF record). */
  mail_server_ip: string;
  /** DKIM keys to configure. Provide rsa and/or ed25519. */
  dkim?: {
    /** RSA DKIM key. */
    rsa?: DkimKey;
    /** Ed25519 DKIM key. */
    ed25519?: DkimKey;
  };
}

export interface MailSetupRecordResult {
  /** DNS record type. */
  type: RecordType;
  /** DNS record name. */
  name: string;
  /** Whether the record was created or updated. */
  action: "created" | "updated";
}

export interface MailSetupResponse {
  /** DNS records created or updated by the mail setup. */
  records: MailSetupRecordResult[];
}
