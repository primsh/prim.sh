// THIS FILE IS GENERATED — DO NOT EDIT
// Source: specs/openapi/domain.yaml
// Regenerate: pnpm gen:sdk

// ── Types ──────────────────────────────────────────────────────────────────

export interface ZoneResponse {
  /** Zone ID (UUID). */
  id: string;
  /** Domain name for this zone. */
  domain: string;
  /** Cloudflare zone status. */
  status: "pending" | "active" | "moved";
  /** Cloudflare nameservers to configure at your registrar. */
  name_servers: string[];
  /** Ethereum address of the wallet that created this zone. */
  owner_wallet: string;
  /** ISO 8601 timestamp of zone creation. */
  created_at: string;
}

export interface RecordResponse {
  /** Record ID. */
  id: string;
  /** Zone this record belongs to. */
  zone_id: string;
  /** DNS record type. */
  type: "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "SRV" | "CAA" | "NS";
  /** DNS record name (relative to zone, "@" for root). */
  name: string;
  /** Record content (IP for A, hostname for CNAME/MX, text for TXT, etc.). */
  content: string;
  /** Time-to-live in seconds. 1 = automatic (Cloudflare default). */
  ttl: number;
  /** Whether traffic is proxied through Cloudflare. Only valid for A/AAAA/CNAME. */
  proxied: boolean;
  /** Priority for MX and SRV records. null for other types. */
  priority: number | null;
  created_at: string;
  updated_at: string;
}

export interface DomainSearchResult {
  /** Fully qualified domain name. */
  domain: string;
  /** Whether the domain is available for registration. */
  available: boolean;
  /** Pricing information. Present when available=true. */
  price?: {
    register: number;
    renew?: number;
    currency: string;
  };
  /** Whether this is a premium domain (higher price). */
  premium?: boolean;
}

export interface QuoteResponse {
  /** Quote identifier. Pass this to POST /v1/domains/register. */
  quote_id: string;
  /** Domain name being quoted. */
  domain: string;
  available: boolean;
  /** Registration period in years. */
  years: number;
  /** Base registrar cost in USD. */
  registrar_cost_usd: number;
  /** Total cost including fees, in USD. This is the x402 payment amount. */
  total_cost_usd: number;
  currency: string;
  /** When this quote expires. Must register before this time. */
  expires_at: string;
}

export interface RegisterResponse {
  domain: string;
  registered: boolean;
  /** Cloudflare zone ID created for this domain. null if zone creation failed. */
  zone_id: string | null;
  /** Nameservers to configure at your registrar. null if zone creation failed. */
  nameservers: unknown | null;
  /** Amount charged for this registration. */
  order_amount_usd: number;
  /** Whether nameservers were automatically configured at the registrar. */
  ns_configured: boolean;
  /** Token to retry zone/NS setup if it partially failed. Store this securely. */
  recovery_token: string | null;
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
  ns_configured: boolean;
}

export interface RegistrationStatusResponse {
  domain: string;
  purchased: boolean;
  /** Cloudflare zone ID. null if zone has not been created yet. */
  zone_id: string | null;
  /** Cloudflare zone activation status. null if no zone yet. */
  zone_status: "pending" | "active" | "moved" | null;
  /** Whether Cloudflare nameservers are set at the registrar. */
  ns_configured_at_registrar: boolean;
  /** Whether nameserver changes have propagated globally. */
  ns_propagated: boolean;
  /** Cloudflare nameservers that should be configured. */
  ns_expected: string[];
  /** Nameservers currently observed for the domain. */
  ns_actual: string[];
  /** Whether the Cloudflare zone is active (traffic routing through CF). */
  zone_active: boolean;
  /** true when zone is active and everything is configured. Domain is fully live. */
  all_ready: boolean;
  /** Human-readable guidance on what to do next. null when all_ready is true. */
  next_action: string | null;
}

export interface VerifyResponse {
  domain: string;
  nameservers: {
    expected: string[];
    actual: string[];
    propagated: boolean;
  };
  records: {
    type: "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "SRV" | "CAA" | "NS";
    name: string;
    expected: string;
    actual: string | null;
    propagated: boolean;
  }[];
  /** true when all NS and record checks pass. */
  all_propagated: boolean;
  zone_status: "pending" | "active" | "moved" | null;
}

export interface ActivateResponse {
  zone_id: string;
  status: "pending" | "active" | "moved";
  activation_requested: boolean;
}

export interface MailSetupResponse {
  /** DNS records that were created or updated. */
  records: {
    type: "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "SRV" | "CAA" | "NS";
    name: string;
    action: "created" | "updated";
  }[];
}

export interface BatchRecordsResponse {
  created: RecordResponse[];
  updated: RecordResponse[];
  deleted: {
    id: string;
  }[];
}

export interface QuoteDomainRequest {
  /** Fully qualified domain name to quote. */
  domain: string;
  /** Registration period in years (default 1). */
  years?: number;
}

export interface RegisterDomainRequest {
  /** Quote ID from POST /v1/domains/quote. Valid for 15 minutes. */
  quote_id: string;
}

export interface RecoverRegistrationRequest {
  /** Recovery token from the original RegisterResponse. */
  recovery_token: string;
}

export interface CreateZoneRequest {
  /** Domain name for the zone. */
  domain: string;
}

export interface SetupMailRequest {
  /** Mail server hostname (e.g. "mail.example.com"). */
  mail_server: string;
  /** Mail server IP address for the A record. */
  mail_server_ip: string;
  /** Optional DKIM public keys. */
  dkim?: {
    rsa?: {
      selector: string;
      public_key: string;
    };
    ed25519?: {
      selector: string;
      public_key: string;
    };
  };
}

export interface BatchRecordsRequest {
  create?: {
    type: "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "SRV" | "CAA" | "NS";
    name: string;
    content: string;
    ttl?: number;
    proxied?: boolean;
    priority?: number;
  }[];
  update?: {
    id: string;
    type?: "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "SRV" | "CAA" | "NS";
    name?: string;
    content?: string;
    ttl?: number;
    proxied?: boolean;
    priority?: number;
  }[];
  delete?: {
    id: string;
  }[];
}

export interface CreateRecordRequest {
  /** DNS record type. */
  type: "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "SRV" | "CAA" | "NS";
  /** Record name relative to zone root. Use "@" for root. */
  name: string;
  /** Record content (IP for A/AAAA, hostname for CNAME/MX, text for TXT). */
  content: string;
  /** TTL in seconds. 1 = automatic. */
  ttl?: number;
  /** Proxy through Cloudflare (A/AAAA/CNAME only). */
  proxied?: boolean;
  /** Priority for MX/SRV records. */
  priority?: number;
}

export interface UpdateRecordRequest {
  type?: "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "SRV" | "CAA" | "NS";
  name?: string;
  content?: string;
  ttl?: number;
  proxied?: boolean;
  priority?: number;
}

export interface SearchDomainsParams {
  /** Domain name to search (without TLD, e.g. "myagent"). */
  query: string;
  /** Comma-separated TLDs to check (e.g. "com,xyz,io"). Defaults to common TLDs. */
  tlds?: string;
}

export interface GetDomainStatusParams {
  /** Fully qualified domain name. */
  domain: string;
}

export interface ConfigureNsParams {
  /** Fully qualified domain name. */
  domain: string;
}

export interface ListZonesParams {
  /** Number of zones per page (1–100, default 20). */
  limit?: number;
  /** Page number (1-based, default 1). */
  page?: number;
}

export interface GetZoneParams {
  /** Zone ID. */
  id: string;
}

export interface DeleteZoneParams {
  /** Zone ID. */
  id: string;
}

export interface ActivateZoneParams {
  /** Zone ID. */
  zone_id: string;
}

export interface VerifyZoneParams {
  /** Zone ID. */
  zone_id: string;
}

export interface SetupMailParams {
  /** Zone ID. */
  zone_id: string;
}

export interface BatchRecordsParams {
  /** Zone ID. */
  zone_id: string;
}

export interface CreateRecordParams {
  /** Zone ID. */
  zone_id: string;
}

export interface ListRecordsParams {
  /** Zone ID. */
  zone_id: string;
}

export interface GetRecordParams {
  /** Zone ID. */
  zone_id: string;
  /** Record ID. */
  id: string;
}

export interface UpdateRecordParams {
  /** Zone ID. */
  zone_id: string;
  /** Record ID. */
  id: string;
}

export interface DeleteRecordParams {
  /** Zone ID. */
  zone_id: string;
  /** Record ID. */
  id: string;
}

export interface SearchDomainsResponse {
  results: DomainSearchResult[];
}

export interface CreateZoneResponse {
  zone: ZoneResponse;
}

export interface ListZonesResponse {
  zones: ZoneResponse[];
  meta: {
    page: number;
    per_page: number;
    total: number;
  };
}

export type DeleteZoneResponse = Record<string, unknown>;

export interface ListRecordsResponse {
  records: RecordResponse[];
}

export type DeleteRecordResponse = Record<string, unknown>;

// ── Client ─────────────────────────────────────────────────────────────────

export function createDomainClient(primFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const baseUrl = "https://domain.prim.sh";
  return {
    async searchDomains(params: SearchDomainsParams): Promise<SearchDomainsResponse> {
      const qs = new URLSearchParams();
      if (params.query !== undefined) qs.set("query", String(params.query));
      if (params.tlds !== undefined) qs.set("tlds", String(params.tlds));
      const query = qs.toString();
      const url = `${baseUrl}/v1/domains/search${query ? `?${query}` : ""}`;
      const res = await primFetch(url);
      return res.json() as Promise<SearchDomainsResponse>;
    },
    async quoteDomain(req: QuoteDomainRequest): Promise<QuoteResponse> {
      const url = `${baseUrl}/v1/domains/quote`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return res.json() as Promise<QuoteResponse>;
    },
    async registerDomain(req: RegisterDomainRequest): Promise<RegisterResponse> {
      const url = `${baseUrl}/v1/domains/register`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return res.json() as Promise<RegisterResponse>;
    },
    async recoverRegistration(req: RecoverRegistrationRequest): Promise<RecoverResponse> {
      const url = `${baseUrl}/v1/domains/recover`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return res.json() as Promise<RecoverResponse>;
    },
    async getDomainStatus(params: GetDomainStatusParams): Promise<RegistrationStatusResponse> {
      const url = `${baseUrl}/v1/domains/${encodeURIComponent(params.domain)}/status`;
      const res = await primFetch(url);
      return res.json() as Promise<RegistrationStatusResponse>;
    },
    async configureNs(params: ConfigureNsParams): Promise<ConfigureNsResponse> {
      const url = `${baseUrl}/v1/domains/${encodeURIComponent(params.domain)}/configure-ns`;
      const res = await primFetch(url, {
        method: "POST",
      });
      return res.json() as Promise<ConfigureNsResponse>;
    },
    async createZone(req: CreateZoneRequest): Promise<CreateZoneResponse> {
      const url = `${baseUrl}/v1/zones`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return res.json() as Promise<CreateZoneResponse>;
    },
    async listZones(params: ListZonesParams): Promise<ListZonesResponse> {
      const qs = new URLSearchParams();
      if (params.limit !== undefined) qs.set("limit", String(params.limit));
      if (params.page !== undefined) qs.set("page", String(params.page));
      const query = qs.toString();
      const url = `${baseUrl}/v1/zones${query ? `?${query}` : ""}`;
      const res = await primFetch(url);
      return res.json() as Promise<ListZonesResponse>;
    },
    async getZone(params: GetZoneParams): Promise<ZoneResponse> {
      const url = `${baseUrl}/v1/zones/${encodeURIComponent(params.id)}`;
      const res = await primFetch(url);
      return res.json() as Promise<ZoneResponse>;
    },
    async deleteZone(params: DeleteZoneParams): Promise<DeleteZoneResponse> {
      const url = `${baseUrl}/v1/zones/${encodeURIComponent(params.id)}`;
      const res = await primFetch(url, {
        method: "DELETE",
      });
      return res.json() as Promise<DeleteZoneResponse>;
    },
    async activateZone(params: ActivateZoneParams): Promise<ActivateResponse> {
      const url = `${baseUrl}/v1/zones/${encodeURIComponent(params.zone_id)}/activate`;
      const res = await primFetch(url, {
        method: "PUT",
      });
      return res.json() as Promise<ActivateResponse>;
    },
    async verifyZone(params: VerifyZoneParams): Promise<VerifyResponse> {
      const url = `${baseUrl}/v1/zones/${encodeURIComponent(params.zone_id)}/verify`;
      const res = await primFetch(url);
      return res.json() as Promise<VerifyResponse>;
    },
    async setupMail(params: SetupMailParams, req: SetupMailRequest): Promise<MailSetupResponse> {
      const url = `${baseUrl}/v1/zones/${encodeURIComponent(params.zone_id)}/mail-setup`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return res.json() as Promise<MailSetupResponse>;
    },
    async batchRecords(params: BatchRecordsParams, req: BatchRecordsRequest): Promise<BatchRecordsResponse> {
      const url = `${baseUrl}/v1/zones/${encodeURIComponent(params.zone_id)}/records/batch`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return res.json() as Promise<BatchRecordsResponse>;
    },
    async createRecord(params: CreateRecordParams, req: CreateRecordRequest): Promise<RecordResponse> {
      const url = `${baseUrl}/v1/zones/${encodeURIComponent(params.zone_id)}/records`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return res.json() as Promise<RecordResponse>;
    },
    async listRecords(params: ListRecordsParams): Promise<ListRecordsResponse> {
      const url = `${baseUrl}/v1/zones/${encodeURIComponent(params.zone_id)}/records`;
      const res = await primFetch(url);
      return res.json() as Promise<ListRecordsResponse>;
    },
    async getRecord(params: GetRecordParams): Promise<RecordResponse> {
      const url = `${baseUrl}/v1/zones/${encodeURIComponent(params.zone_id)}/records/${encodeURIComponent(params.id)}`;
      const res = await primFetch(url);
      return res.json() as Promise<RecordResponse>;
    },
    async updateRecord(params: UpdateRecordParams, req: UpdateRecordRequest): Promise<RecordResponse> {
      const url = `${baseUrl}/v1/zones/${encodeURIComponent(params.zone_id)}/records/${encodeURIComponent(params.id)}`;
      const res = await primFetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return res.json() as Promise<RecordResponse>;
    },
    async deleteRecord(params: DeleteRecordParams): Promise<DeleteRecordResponse> {
      const url = `${baseUrl}/v1/zones/${encodeURIComponent(params.zone_id)}/records/${encodeURIComponent(params.id)}`;
      const res = await primFetch(url, {
        method: "DELETE",
      });
      return res.json() as Promise<DeleteRecordResponse>;
    },
  };
}
