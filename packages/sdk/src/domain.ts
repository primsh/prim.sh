// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Source: packages/domain/openapi.yaml
// Regenerate: pnpm gen:sdk

// ── Types ──────────────────────────────────────────────────────────────────

export interface ActivateResponse {
  /** Cloudflare zone ID. */
  zone_id: string;
  /** Updated zone status. */
  status: string;
  /** Always true — activation was requested from Cloudflare. */
  activation_requested: string;
}

export interface BatchCreateEntry {
  /** DNS record type. */
  type: string;
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
  deleted: Record<string, unknown>;
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
  type?: string;
  /** Updated record name. */
  name?: string;
}

export interface CreateRecordRequest {
  /** DNS record type. */
  type: string;
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

export interface CreateZoneRequest {
  /** Domain name to create a zone for (e.g. "example.com"). */
  domain: string;
}

export interface CreateZoneResponse {
  /** The created zone. */
  zone: ZoneResponse;
}

export interface DomainSearchPrice {
  /** Registration cost in USD. */
  register: number;
  /** Renewal cost in USD. Not returned by checkRegisterAvailability; omitted means unknown. */
  renew?: number;
  /** Currency code (e.g. "USD"). */
  currency: string;
}

export interface DomainSearchResponse {
  /** Search results for each queried domain. */
  results: DomainSearchResult[];
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

export interface MailSetupRecordResult {
  /** DNS record type. */
  type: string;
  /** DNS record name. */
  name: string;
  /** Whether the record was created or updated. */
  action: "created" | "updated";
}

export interface MailSetupRequest {
  /** Mail server hostname (e.g. "mail.prim.sh"). */
  mail_server: string;
  /** Mail server IPv4 address (used for SPF record). */
  mail_server_ip: string;
  /** DKIM keys to configure. Provide rsa and/or ed25519. */
  dkim?: Record<string, unknown>;
}

export interface MailSetupResponse {
  /** DNS records created or updated by the mail setup. */
  records: MailSetupRecordResult[];
}

export interface NsVerifyResult {
  /** Expected Cloudflare nameservers. */
  expected: string[];
  /** Nameservers found in DNS. */
  actual: string[];
  /** Whether nameservers have propagated. */
  propagated: boolean;
}

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
  available: string;
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

export interface RecordResponse {
  /** DNS record ID. */
  id: string;
  /** Zone ID this record belongs to. */
  zone_id: string;
  /** DNS record type. */
  type: string;
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

export interface RecordVerifyResult {
  /** DNS record type. */
  type: string;
  /** DNS record name. */
  name: string;
  /** Expected DNS record value. */
  expected: string;
  /** Actual DNS record value found. Null if not found. */
  actual: string | null;
  /** Whether the record has propagated. */
  propagated: boolean;
}

export interface RegistrationStatusResponse {
  /** Domain name. */
  domain: string;
  /** Always true — only returned for registered domains. */
  purchased: string;
  /** Cloudflare zone ID. Null if zone not yet created. */
  zone_id: string | null;
  /** Current zone status. Null if zone not yet created. */
  zone_status: string | null;
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

export interface UpdateRecordRequest {
  /** DNS record type. */
  type?: string;
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
  zone_status: string | null;
}

export interface ZoneResponse {
  /** Cloudflare zone ID. */
  id: string;
  /** Domain name (e.g. "example.com"). */
  domain: string;
  /** Zone status: "pending" | "active" | "moved". */
  status: string;
  /** Cloudflare nameservers to delegate to. */
  name_servers: string[];
  /** Ethereum address of the zone owner. */
  owner_wallet: string;
  /** ISO 8601 timestamp when the zone was created. */
  created_at: string;
}

export interface SearchDomainsParams {
  /** Domain name or keyword to search */
  query?: string;
  /** Comma-separated TLDs (e.g. com,xyz,io) */
  tlds?: string;
}

export interface GetDomainStatusParams {
  /** domain parameter */
  domain: string;
}

export interface ListZonesParams {
  /** 1-100, default 20 */
  limit?: number;
  /** Cursor from previous response */
  after?: string;
}

export interface GetZoneParams {
  /** id parameter */
  id: string;
}

export interface DeleteZoneParams {
  /** id parameter */
  id: string;
}

export interface ActivateZoneParams {
  /** zone_id parameter */
  zone_id: string;
}

export interface VerifyZoneParams {
  /** zone_id parameter */
  zone_id: string;
}

export interface SetupMailParams {
  /** zone_id parameter */
  zone_id: string;
}

export interface BatchRecordsParams {
  /** zone_id parameter */
  zone_id: string;
}

export interface CreateRecordParams {
  /** zone_id parameter */
  zone_id: string;
}

export interface ListRecordsParams {
  /** zone_id parameter */
  zone_id: string;
}

export interface GetRecordParams {
  /** zone_id parameter */
  zone_id: string;
  /** id parameter */
  id: string;
}

export interface UpdateRecordParams {
  /** zone_id parameter */
  zone_id: string;
  /** id parameter */
  id: string;
}

export interface DeleteRecordParams {
  /** zone_id parameter */
  zone_id: string;
  /** id parameter */
  id: string;
}

export type ListZonesResponse = Record<string, unknown>;

export type DeleteZoneResponse = Record<string, unknown>;

export type ListRecordsResponse = Record<string, unknown>;

export type DeleteRecordResponse = Record<string, unknown>;

// ── Client ─────────────────────────────────────────────────────────────────

export function createDomainClient(
  primFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  baseUrl = "https://domain.prim.sh",
) {
  return {
    async searchDomains(params: SearchDomainsParams): Promise<DomainSearchResponse> {
      const qs = new URLSearchParams();
      if (params.query !== undefined) qs.set("query", String(params.query));
      if (params.tlds !== undefined) qs.set("tlds", String(params.tlds));
      const query = qs.toString();
      const url = `${baseUrl}/v1/domains/search${query ? `?${query}` : ""}`;
      const res = await primFetch(url);
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        let code = "unknown";
        try {
          const body = await res.json() as { error?: { code: string; message: string } };
          if (body.error) { msg = body.error.message; code = body.error.code; }
        } catch {}
        throw new Error(`${msg} (${code})`);
      }
      return res.json() as Promise<DomainSearchResponse>;
    },
    async quoteDomain(req: QuoteRequest): Promise<QuoteResponse> {
      const url = `${baseUrl}/v1/domains/quote`;
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
      return res.json() as Promise<QuoteResponse>;
    },
    async getDomainStatus(params: GetDomainStatusParams): Promise<RegistrationStatusResponse> {
      const url = `${baseUrl}/v1/domains/${encodeURIComponent(params.domain)}/status`;
      const res = await primFetch(url);
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        let code = "unknown";
        try {
          const body = await res.json() as { error?: { code: string; message: string } };
          if (body.error) { msg = body.error.message; code = body.error.code; }
        } catch {}
        throw new Error(`${msg} (${code})`);
      }
      return res.json() as Promise<RegistrationStatusResponse>;
    },
    async createZone(req: CreateZoneRequest): Promise<CreateZoneResponse> {
      const url = `${baseUrl}/v1/zones`;
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
      return res.json() as Promise<CreateZoneResponse>;
    },
    async listZones(params: ListZonesParams): Promise<ListZonesResponse> {
      const qs = new URLSearchParams();
      if (params.limit !== undefined) qs.set("limit", String(params.limit));
      if (params.after !== undefined) qs.set("after", String(params.after));
      const query = qs.toString();
      const url = `${baseUrl}/v1/zones${query ? `?${query}` : ""}`;
      const res = await primFetch(url);
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        let code = "unknown";
        try {
          const body = await res.json() as { error?: { code: string; message: string } };
          if (body.error) { msg = body.error.message; code = body.error.code; }
        } catch {}
        throw new Error(`${msg} (${code})`);
      }
      return res.json() as Promise<ListZonesResponse>;
    },
    async getZone(params: GetZoneParams): Promise<ZoneResponse> {
      const url = `${baseUrl}/v1/zones/${encodeURIComponent(params.id)}`;
      const res = await primFetch(url);
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        let code = "unknown";
        try {
          const body = await res.json() as { error?: { code: string; message: string } };
          if (body.error) { msg = body.error.message; code = body.error.code; }
        } catch {}
        throw new Error(`${msg} (${code})`);
      }
      return res.json() as Promise<ZoneResponse>;
    },
    async deleteZone(params: DeleteZoneParams): Promise<DeleteZoneResponse> {
      const url = `${baseUrl}/v1/zones/${encodeURIComponent(params.id)}`;
      const res = await primFetch(url, {
        method: "DELETE",
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
      return res.json() as Promise<DeleteZoneResponse>;
    },
    async activateZone(params: ActivateZoneParams): Promise<ActivateResponse> {
      const url = `${baseUrl}/v1/zones/${encodeURIComponent(params.zone_id)}/activate`;
      const res = await primFetch(url, {
        method: "PUT",
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
      return res.json() as Promise<ActivateResponse>;
    },
    async verifyZone(params: VerifyZoneParams): Promise<VerifyResponse> {
      const url = `${baseUrl}/v1/zones/${encodeURIComponent(params.zone_id)}/verify`;
      const res = await primFetch(url);
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        let code = "unknown";
        try {
          const body = await res.json() as { error?: { code: string; message: string } };
          if (body.error) { msg = body.error.message; code = body.error.code; }
        } catch {}
        throw new Error(`${msg} (${code})`);
      }
      return res.json() as Promise<VerifyResponse>;
    },
    async setupMail(params: SetupMailParams, req: MailSetupRequest): Promise<MailSetupResponse> {
      const url = `${baseUrl}/v1/zones/${encodeURIComponent(params.zone_id)}/mail-setup`;
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
      return res.json() as Promise<MailSetupResponse>;
    },
    async batchRecords(params: BatchRecordsParams, req: BatchRecordsRequest): Promise<BatchRecordsResponse> {
      const url = `${baseUrl}/v1/zones/${encodeURIComponent(params.zone_id)}/records/batch`;
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
      return res.json() as Promise<BatchRecordsResponse>;
    },
    async createRecord(params: CreateRecordParams, req: CreateRecordRequest): Promise<RecordResponse> {
      const url = `${baseUrl}/v1/zones/${encodeURIComponent(params.zone_id)}/records`;
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
      return res.json() as Promise<RecordResponse>;
    },
    async listRecords(params: ListRecordsParams): Promise<ListRecordsResponse> {
      const url = `${baseUrl}/v1/zones/${encodeURIComponent(params.zone_id)}/records`;
      const res = await primFetch(url);
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        let code = "unknown";
        try {
          const body = await res.json() as { error?: { code: string; message: string } };
          if (body.error) { msg = body.error.message; code = body.error.code; }
        } catch {}
        throw new Error(`${msg} (${code})`);
      }
      return res.json() as Promise<ListRecordsResponse>;
    },
    async getRecord(params: GetRecordParams): Promise<RecordResponse> {
      const url = `${baseUrl}/v1/zones/${encodeURIComponent(params.zone_id)}/records/${encodeURIComponent(params.id)}`;
      const res = await primFetch(url);
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        let code = "unknown";
        try {
          const body = await res.json() as { error?: { code: string; message: string } };
          if (body.error) { msg = body.error.message; code = body.error.code; }
        } catch {}
        throw new Error(`${msg} (${code})`);
      }
      return res.json() as Promise<RecordResponse>;
    },
    async updateRecord(params: UpdateRecordParams, req: UpdateRecordRequest): Promise<RecordResponse> {
      const url = `${baseUrl}/v1/zones/${encodeURIComponent(params.zone_id)}/records/${encodeURIComponent(params.id)}`;
      const res = await primFetch(url, {
        method: "PUT",
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
      return res.json() as Promise<RecordResponse>;
    },
    async deleteRecord(params: DeleteRecordParams): Promise<DeleteRecordResponse> {
      const url = `${baseUrl}/v1/zones/${encodeURIComponent(params.zone_id)}/records/${encodeURIComponent(params.id)}`;
      const res = await primFetch(url, {
        method: "DELETE",
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
      return res.json() as Promise<DeleteRecordResponse>;
    },
  };
}
