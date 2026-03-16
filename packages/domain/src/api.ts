// SPDX-License-Identifier: Apache-2.0
/**
 * domain.sh API contract — Zod schemas, inferred types, and error envelope.
 */

import { z } from "zod";

// ─── Error envelope ───────────────────────────────────────────────────────

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string().describe("Machine-readable error code."),
    message: z.string().describe("Human-readable error message."),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

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

export const GetZoneResponseSchema = z.object({
  id: z.string().describe("Cloudflare zone ID."),
  domain: z.string().describe('Domain name (e.g. "example.com").'),
  status: z
    .enum(["pending", "active", "moved"])
    .describe('Zone status: "pending" | "active" | "moved".'),
  name_servers: z.array(z.string()).describe("Cloudflare nameservers to delegate to."),
  owner_wallet: z.string().describe("Ethereum address of the zone owner."),
  created_at: z.string().describe("ISO 8601 timestamp when the zone was created."),
});
export type GetZoneResponse = z.infer<typeof GetZoneResponseSchema>;

export const CreateZoneRequestSchema = z.object({
  domain: z.string().describe('Domain name to create a zone for (e.g. "example.com").'),
});
export type CreateZoneRequest = z.infer<typeof CreateZoneRequestSchema>;

export const CreateZoneResponseSchema = z.object({
  zone: GetZoneResponseSchema.describe("The created zone."),
});
export type CreateZoneResponse = z.infer<typeof CreateZoneResponseSchema>;

// ─── Record types ────────────────────────────────────────────────────────

export type RecordType = "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "SRV" | "CAA" | "NS";

const RecordTypeSchema = z.enum(["A", "AAAA", "CNAME", "MX", "TXT", "SRV", "CAA", "NS"]);

export const GetRecordResponseSchema = z.object({
  id: z.string().describe("DNS record ID."),
  zone_id: z.string().describe("Zone ID this record belongs to."),
  type: RecordTypeSchema.describe("DNS record type."),
  name: z.string().describe("DNS record name (hostname, relative to zone)."),
  content: z.string().describe("DNS record value."),
  ttl: z.number().describe("TTL in seconds."),
  proxied: z.boolean().describe("Whether Cloudflare proxying is enabled."),
  priority: z
    .number()
    .nullable()
    .describe("Priority for MX and SRV records. Null for other types."),
  created_at: z.string().describe("ISO 8601 timestamp when the record was created."),
  updated_at: z.string().describe("ISO 8601 timestamp when the record was last updated."),
});
export type GetRecordResponse = z.infer<typeof GetRecordResponseSchema>;

export const CreateRecordRequestSchema = z.object({
  type: RecordTypeSchema.describe("DNS record type."),
  name: z.string().describe("DNS record name (hostname)."),
  content: z.string().describe("DNS record value."),
  ttl: z.number().optional().describe("TTL in seconds. Default 1 (auto)."),
  proxied: z.boolean().optional().describe("Enable Cloudflare proxying. Default false."),
  priority: z.number().optional().describe("Priority for MX and SRV records."),
});
export type CreateRecordRequest = z.infer<typeof CreateRecordRequestSchema>;

export const UpdateRecordRequestSchema = z.object({
  type: RecordTypeSchema.optional().describe("DNS record type."),
  name: z.string().optional().describe("DNS record name."),
  content: z.string().optional().describe("DNS record value."),
  ttl: z.number().optional().describe("TTL in seconds."),
  proxied: z.boolean().optional().describe("Enable Cloudflare proxying."),
  priority: z.number().optional().describe("Priority for MX and SRV records."),
});
export type UpdateRecordRequest = z.infer<typeof UpdateRecordRequestSchema>;

// ─── Domain search types ──────────────────────────────────────────────────

export const DomainSearchPriceSchema = z.object({
  register: z.number().describe("Registration cost in USD."),
  renew: z
    .number()
    .optional()
    .describe(
      "Renewal cost in USD. Not returned by checkRegisterAvailability; omitted means unknown.",
    ),
  currency: z.string().describe('Currency code (e.g. "USD").'),
});
export type DomainSearchPrice = z.infer<typeof DomainSearchPriceSchema>;

export const DomainSearchResultSchema = z.object({
  domain: z.string().describe("Domain name queried."),
  available: z.boolean().describe("Whether the domain is available for registration."),
  price: DomainSearchPriceSchema.optional().describe(
    "Pricing info. Only present if available is true.",
  ),
  premium: z.boolean().optional().describe("Whether this is a premium domain with higher pricing."),
});
export type DomainSearchResult = z.infer<typeof DomainSearchResultSchema>;

export const SearchDomainResponseSchema = z.object({
  results: z.array(DomainSearchResultSchema).describe("Search results for each queried domain."),
});
export type SearchDomainResponse = z.infer<typeof SearchDomainResponseSchema>;

// ─── Batch record types ────────────────────────────────────────────────────

export const BatchCreateEntrySchema = z.object({
  type: RecordTypeSchema.describe("DNS record type."),
  name: z.string().describe("DNS record name."),
  content: z.string().describe("DNS record value."),
  ttl: z.number().optional().describe("TTL in seconds. Default 1 (auto)."),
  proxied: z.boolean().optional().describe("Enable Cloudflare proxying. Default false."),
  priority: z.number().optional().describe("Priority for MX and SRV records."),
});
export type BatchCreateEntry = z.infer<typeof BatchCreateEntrySchema>;

export const BatchUpdateEntrySchema = z.object({
  id: z.string().describe("ID of the record to update."),
  content: z.string().optional().describe("New DNS record value."),
  ttl: z.number().optional().describe("New TTL in seconds."),
  proxied: z.boolean().optional().describe("Updated proxying flag."),
  priority: z.number().optional().describe("Updated priority."),
  type: RecordTypeSchema.optional().describe("Updated record type."),
  name: z.string().optional().describe("Updated record name."),
});
export type BatchUpdateEntry = z.infer<typeof BatchUpdateEntrySchema>;

export const BatchDeleteEntrySchema = z.object({
  id: z.string().describe("ID of the record to delete."),
});
export type BatchDeleteEntry = z.infer<typeof BatchDeleteEntrySchema>;

export const BatchRecordsRequestSchema = z.object({
  create: z.array(BatchCreateEntrySchema).optional().describe("Records to create."),
  update: z.array(BatchUpdateEntrySchema).optional().describe("Records to update."),
  delete: z.array(BatchDeleteEntrySchema).optional().describe("Records to delete."),
});
export type BatchRecordsRequest = z.infer<typeof BatchRecordsRequestSchema>;

export const BatchRecordsResponseSchema = z.object({
  created: z.array(GetRecordResponseSchema).describe("Successfully created records."),
  updated: z.array(GetRecordResponseSchema).describe("Successfully updated records."),
  deleted: z.array(z.object({ id: z.string() })).describe("IDs of deleted records."),
});
export type BatchRecordsResponse = z.infer<typeof BatchRecordsResponseSchema>;

// ─── Quote / Register / Recover types ────────────────────────────────────

export const QuoteRequestSchema = z.object({
  domain: z.string().describe('Domain name to quote (e.g. "example.com").'),
  years: z.number().optional().describe("Number of years to register. Default 1."),
});
export type QuoteRequest = z.infer<typeof QuoteRequestSchema>;

export const QuoteResponseSchema = z.object({
  quote_id: z.string().describe("Quote ID to use when calling POST /v1/domains/register."),
  domain: z.string().describe("Domain name quoted."),
  available: z
    .literal(true)
    .describe("Always true — quote is only returned for available domains."),
  years: z.number().describe("Number of years in the quote."),
  registrar_cost_usd: z.number().describe("Registrar cost in USD (internal cost)."),
  total_cost_usd: z.number().describe("Total cost in USD charged to the caller."),
  currency: z.string().describe('Currency code (e.g. "USD").'),
  expires_at: z
    .string()
    .describe(
      "ISO 8601 timestamp when the quote expires. Use within the window to avoid quote_expired.",
    ),
});
export type QuoteResponse = z.infer<typeof QuoteResponseSchema>;

export const RegisterRequestSchema = z.object({
  quote_id: z.string().describe("Quote ID from POST /v1/domains/quote."),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const RegisterResponseSchema = z.object({
  domain: z.string().describe("Registered domain name."),
  registered: z.literal(true).describe("Always true on success."),
  zone_id: z.string().nullable().describe("Cloudflare zone ID. Null if zone creation failed."),
  nameservers: z
    .array(z.string())
    .nullable()
    .describe("Cloudflare nameservers to delegate to. Null if zone creation failed."),
  order_amount_usd: z.number().describe("Order amount charged in USD."),
  ns_configured: z.boolean().describe("Whether nameservers were configured at the registrar."),
  recovery_token: z
    .string()
    .nullable()
    .describe(
      "Recovery token to restore zone access. Store securely. Null if zone creation failed.",
    ),
});
export type RegisterResponse = z.infer<typeof RegisterResponseSchema>;

export const RecoverRequestSchema = z.object({
  recovery_token: z.string().describe("Recovery token from the original registration response."),
});
export type RecoverRequest = z.infer<typeof RecoverRequestSchema>;

export const RecoverResponseSchema = z.object({
  domain: z.string().describe("Domain name recovered."),
  zone_id: z.string().describe("Recovered Cloudflare zone ID."),
  nameservers: z.array(z.string()).describe("Cloudflare nameservers."),
  ns_configured: z.boolean().describe("Whether nameservers are configured at the registrar."),
});
export type RecoverResponse = z.infer<typeof RecoverResponseSchema>;

export const ConfigureNameserversResponseSchema = z.object({
  domain: z.string().describe("Domain name."),
  nameservers: z.array(z.string()).describe("Cloudflare nameservers configured."),
  ns_configured: z.literal(true).describe("Always true on success."),
});
export type ConfigureNameserversResponse = z.infer<typeof ConfigureNameserversResponseSchema>;

// ─── Verify types ──────────────────────────────────────────────────────────

export const NsVerifyResultSchema = z.object({
  expected: z.array(z.string()).describe("Expected Cloudflare nameservers."),
  actual: z.array(z.string()).describe("Nameservers found in DNS."),
  propagated: z.boolean().describe("Whether nameservers have propagated."),
});
export type NsVerifyResult = z.infer<typeof NsVerifyResultSchema>;

export const RecordVerifyResultSchema = z.object({
  type: RecordTypeSchema.describe("DNS record type."),
  name: z.string().describe("DNS record name."),
  expected: z.string().describe("Expected DNS record value."),
  actual: z.string().nullable().describe("Actual DNS record value found. Null if not found."),
  propagated: z.boolean().describe("Whether the record has propagated."),
});
export type RecordVerifyResult = z.infer<typeof RecordVerifyResultSchema>;

export const VerifyDomainResponseSchema = z.object({
  domain: z.string().describe("Domain name."),
  nameservers: NsVerifyResultSchema.describe("Nameserver propagation result."),
  records: z.array(RecordVerifyResultSchema).describe("Per-record propagation results."),
  all_propagated: z.boolean().describe("Whether all records and nameservers have propagated."),
  zone_status: z
    .enum(["pending", "active", "moved"])
    .nullable()
    .describe("Current Cloudflare zone status. Null if zone not found."),
});
export type VerifyDomainResponse = z.infer<typeof VerifyDomainResponseSchema>;

// ─── Registration status types ─────────────────────────────────────────────

export const GetRegistrationStatusResponseSchema = z.object({
  domain: z.string().describe("Domain name."),
  purchased: z.literal(true).describe("Always true — only returned for registered domains."),
  zone_id: z.string().nullable().describe("Cloudflare zone ID. Null if zone not yet created."),
  zone_status: z
    .enum(["pending", "active", "moved"])
    .nullable()
    .describe("Current zone status. Null if zone not yet created."),
  ns_configured_at_registrar: z
    .boolean()
    .describe("Whether nameservers are configured at the registrar."),
  ns_propagated: z.boolean().describe("Whether nameservers have propagated in DNS."),
  ns_expected: z.array(z.string()).describe("Expected Cloudflare nameservers."),
  ns_actual: z.array(z.string()).describe("Nameservers currently found in DNS."),
  zone_active: z.boolean().describe("Whether the Cloudflare zone is active."),
  all_ready: z.boolean().describe("Whether the domain is fully set up and ready."),
  next_action: z
    .string()
    .nullable()
    .describe("Human-readable next action required. Null if all_ready is true."),
});
export type GetRegistrationStatusResponse = z.infer<typeof GetRegistrationStatusResponseSchema>;

export const ActivateDomainResponseSchema = z.object({
  zone_id: z.string().describe("Cloudflare zone ID."),
  status: z.enum(["pending", "active", "moved"]).describe("Updated zone status."),
  activation_requested: z
    .literal(true)
    .describe("Always true — activation was requested from Cloudflare."),
});
export type ActivateDomainResponse = z.infer<typeof ActivateDomainResponseSchema>;

// ─── Mail setup types ──────────────────────────────────────────────────────

export const DkimKeySchema = z.object({
  selector: z.string().describe('DKIM selector (e.g. "rsa2048").'),
  public_key: z.string().describe("DKIM public key string."),
});
export type DkimKey = z.infer<typeof DkimKeySchema>;

export const SetupMailRequestSchema = z.object({
  mail_server: z.string().describe('Mail server hostname (e.g. "mail.prim.sh").'),
  mail_server_ip: z.string().describe("Mail server IPv4 address (used for SPF record)."),
  dkim: z
    .object({
      rsa: DkimKeySchema.optional().describe("RSA DKIM key."),
      ed25519: DkimKeySchema.optional().describe("Ed25519 DKIM key."),
    })
    .optional()
    .describe("DKIM keys to configure. Provide rsa and/or ed25519."),
});
export type SetupMailRequest = z.infer<typeof SetupMailRequestSchema>;

export const MailSetupRecordResultSchema = z.object({
  type: RecordTypeSchema.describe("DNS record type."),
  name: z.string().describe("DNS record name."),
  action: z.enum(["created", "updated"]).describe("Whether the record was created or updated."),
});
export type MailSetupRecordResult = z.infer<typeof MailSetupRecordResultSchema>;

export const SetupMailResponseSchema = z.object({
  records: z
    .array(MailSetupRecordResultSchema)
    .describe("DNS records created or updated by the mail setup."),
});
export type SetupMailResponse = z.infer<typeof SetupMailResponseSchema>;
