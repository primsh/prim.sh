// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Source: packages/email/openapi.yaml
// Regenerate: pnpm gen:sdk

// ── Types ──────────────────────────────────────────────────────────────────

export interface CreateMailboxRequest {
  /** Desired username. Omit for random generation. */
  username?: string;
  /** Domain for the mailbox (must be registered). Omit for default domain. */
  domain?: string;
  /** TTL in milliseconds. Omit for permanent mailbox. */
  ttl_ms?: number;
}

export interface DeleteDomainResponse {
  /** Domain registration ID that was deleted. */
  id: string;
  /** Always true on success. */
  deleted: string;
  /** Warning message if domain had active mailboxes. */
  warning?: string;
}

export interface DeleteMailboxResponse {
  /** Mailbox ID that was deleted. */
  id: string;
  /** Always true on success. */
  deleted: string;
}

export interface DeleteWebhookResponse {
  /** Webhook ID that was deleted. */
  id: string;
  /** Always true on success. */
  deleted: string;
}

export interface DnsRecord {
  /** DNS record type (e.g. "MX", "TXT"). */
  type: string;
  /** DNS record name (hostname). */
  name: string;
  /** DNS record value. */
  content: string;
  /** MX priority. Only present for MX records. */
  priority?: number;
}

export interface DomainResponse {
  /** Domain registration ID. */
  id: string;
  /** Registered domain name. */
  domain: string;
  /** Verification status ("pending" | "verified"). */
  status: string;
  /** Ethereum address of the domain owner. */
  owner_wallet: string;
  /** ISO 8601 timestamp when the domain was registered. */
  created_at: string;
  /** ISO 8601 timestamp when the domain was verified. Null if unverified. */
  verified_at: string | null;
  /** DNS records that must be added to verify the domain. */
  required_records: DnsRecord[];
  /** DKIM DNS records. Only present after successful verification. */
  dkim_records?: DnsRecord[];
}

export interface EmailAddress {
  /** Display name. Null if not present. */
  name: string | null;
  /** Email address string. */
  email: string;
}

export interface EmailDetail {
  /** Message ID. */
  id: string;
  /** Sender address. */
  from: EmailAddress;
  /** Recipient addresses. */
  to: EmailAddress[];
  /** Email subject line. */
  subject: string;
  /** ISO 8601 timestamp when the message was received. */
  received_at: string;
  /** Message size in bytes. */
  size: number;
  /** Whether the message has attachments. */
  has_attachment: boolean;
  /** Short preview text (first ~100 chars of body). */
  preview: string;
  /** CC recipient addresses. */
  cc: EmailAddress[];
  /** Plain-text body. Null if not present. */
  text_body: string | null;
  /** HTML body. Null if not present. */
  html_body: string | null;
}

export interface EmailMessage {
  /** Message ID. */
  id: string;
  /** Sender address. */
  from: EmailAddress;
  /** Recipient addresses. */
  to: EmailAddress[];
  /** Email subject line. */
  subject: string;
  /** ISO 8601 timestamp when the message was received. */
  received_at: string;
  /** Message size in bytes. */
  size: number;
  /** Whether the message has attachments. */
  has_attachment: boolean;
  /** Short preview text (first ~100 chars of body). */
  preview: string;
}

export interface MailboxResponse {
  /** Mailbox ID (e.g. "mbx_abc123"). */
  id: string;
  /** Full email address (e.g. "abc123@mail.prim.sh"). */
  address: string;
  /** Username portion of the email address. */
  username: string;
  /** Domain portion of the email address. */
  domain: string;
  /** Current status: "active" | "expired" | "deleted". */
  status: string;
  /** ISO 8601 timestamp when the mailbox was created. */
  created_at: string;
  /** ISO 8601 timestamp when the mailbox expires. Null if permanent. */
  expires_at: string | null;
}

export interface RegisterDomainRequest {
  /** Domain name to register (e.g. "myproject.com"). */
  domain: string;
}

export interface RegisterWebhookRequest {
  /** HTTPS URL to receive webhook POST requests. */
  url: string;
  /** HMAC secret for X-Prim-Signature verification. */
  secret?: string;
  /** Events to subscribe to. Defaults to ["message.received"]. */
  events?: string[];
}

export interface RenewMailboxRequest {
  /** Extension duration in milliseconds. Omit to apply default TTL. */
  ttl_ms?: number;
}

export interface SendMessageRequest {
  /** Recipient email address. */
  to: string;
  /** Email subject line. */
  subject: string;
  /** Plain-text body. Either body or html is required. */
  body?: string;
  /** HTML body. Either body or html is required. */
  html?: string;
  /** CC recipient email address. */
  cc?: string;
  /** BCC recipient email address. */
  bcc?: string;
}

export interface SendMessageResponse {
  /** Message ID assigned by the mail server. */
  message_id: string;
  /** Always "sent" on success. */
  status: "sent";
}

export interface VerificationResult {
  /** DNS record type checked. */
  type: string;
  /** DNS record name checked. */
  name: string;
  /** Expected DNS record value. */
  expected: string;
  /** Actual DNS record value found. Null if not found. */
  found: string | null;
  /** Whether the record matched the expected value. */
  pass: boolean;
}

export interface VerifyDomainResponse {
  /** Domain registration ID. */
  id: string;
  /** Domain name. */
  domain: string;
  /** Updated verification status. */
  status: string;
  /** ISO 8601 timestamp when the domain was verified. Null if not yet verified. */
  verified_at: string | null;
  /** Per-record verification results. */
  verification_results?: VerificationResult[];
  /** DKIM records to add to DNS. Only present on successful verification. */
  dkim_records?: DnsRecord[];
}

export interface WebhookResponse {
  /** Webhook ID (e.g. "wh_abc123"). */
  id: string;
  /** Webhook endpoint URL. */
  url: string;
  /** Subscribed events. */
  events: string[];
  /** Webhook status. */
  status: string;
  /** ISO 8601 timestamp when the webhook was created. */
  created_at: string;
}

export interface ListMailboxesParams {
  /** 1-100, default 20 */
  limit?: number;
  /** Cursor from previous response */
  after?: string;
}

export interface GetMailboxParams {
  /** id parameter */
  id: string;
}

export interface DeleteMailboxParams {
  /** id parameter */
  id: string;
}

export interface RenewMailboxParams {
  /** id parameter */
  id: string;
}

export interface ListMessagesParams {
  /** id parameter */
  id: string;
  /** 1-100, default 20 */
  limit?: number;
  /** Position-based cursor for pagination */
  after?: number;
}

export interface GetMessageParams {
  /** id parameter */
  id: string;
  /** msgId parameter */
  msgId: string;
}

export interface SendMessageParams {
  /** id parameter */
  id: string;
}

export interface RegisterWebhookParams {
  /** id parameter */
  id: string;
}

export interface ListWebhooksParams {
  /** id parameter */
  id: string;
}

export interface DeleteWebhookParams {
  /** id parameter */
  id: string;
  /** whId parameter */
  whId: string;
}

export interface ListDomainsParams {
  /** 1-100, default 20 */
  limit?: number;
  /** Cursor from previous response */
  after?: string;
}

export interface GetDomainParams {
  /** id parameter */
  id: string;
}

export interface DeleteDomainParams {
  /** id parameter */
  id: string;
}

export interface VerifyDomainParams {
  /** id parameter */
  id: string;
}

export type ListMailboxesResponse = Record<string, unknown>;

export type ListMessagesResponse = Record<string, unknown>;

export type ListWebhooksResponse = Record<string, unknown>;

export type ListDomainsResponse = Record<string, unknown>;

// ── Client ─────────────────────────────────────────────────────────────────

export function createEmailClient(primFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const baseUrl = "https://email.prim.sh";
  return {
    async createMailbox(req: CreateMailboxRequest): Promise<MailboxResponse> {
      const url = `${baseUrl}/v1/mailboxes`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return res.json() as Promise<MailboxResponse>;
    },
    async listMailboxes(params: ListMailboxesParams): Promise<ListMailboxesResponse> {
      const qs = new URLSearchParams();
      if (params.limit !== undefined) qs.set("limit", String(params.limit));
      if (params.after !== undefined) qs.set("after", String(params.after));
      const query = qs.toString();
      const url = `${baseUrl}/v1/mailboxes${query ? `?${query}` : ""}`;
      const res = await primFetch(url);
      return res.json() as Promise<ListMailboxesResponse>;
    },
    async getMailbox(params: GetMailboxParams): Promise<MailboxResponse> {
      const url = `${baseUrl}/v1/mailboxes/${encodeURIComponent(params.id)}`;
      const res = await primFetch(url);
      return res.json() as Promise<MailboxResponse>;
    },
    async deleteMailbox(params: DeleteMailboxParams): Promise<DeleteMailboxResponse> {
      const url = `${baseUrl}/v1/mailboxes/${encodeURIComponent(params.id)}`;
      const res = await primFetch(url, {
        method: "DELETE",
      });
      return res.json() as Promise<DeleteMailboxResponse>;
    },
    async renewMailbox(params: RenewMailboxParams, req: RenewMailboxRequest): Promise<MailboxResponse> {
      const url = `${baseUrl}/v1/mailboxes/${encodeURIComponent(params.id)}/renew`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return res.json() as Promise<MailboxResponse>;
    },
    async listMessages(params: ListMessagesParams): Promise<ListMessagesResponse> {
      const qs = new URLSearchParams();
      if (params.limit !== undefined) qs.set("limit", String(params.limit));
      if (params.after !== undefined) qs.set("after", String(params.after));
      const query = qs.toString();
      const url = `${baseUrl}/v1/mailboxes/${encodeURIComponent(params.id)}/messages${query ? `?${query}` : ""}`;
      const res = await primFetch(url);
      return res.json() as Promise<ListMessagesResponse>;
    },
    async getMessage(params: GetMessageParams): Promise<EmailDetail> {
      const url = `${baseUrl}/v1/mailboxes/${encodeURIComponent(params.id)}/messages/${encodeURIComponent(params.msgId)}`;
      const res = await primFetch(url);
      return res.json() as Promise<EmailDetail>;
    },
    async sendMessage(params: SendMessageParams, req: SendMessageRequest): Promise<SendMessageResponse> {
      const url = `${baseUrl}/v1/mailboxes/${encodeURIComponent(params.id)}/send`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return res.json() as Promise<SendMessageResponse>;
    },
    async registerWebhook(params: RegisterWebhookParams, req: RegisterWebhookRequest): Promise<WebhookResponse> {
      const url = `${baseUrl}/v1/mailboxes/${encodeURIComponent(params.id)}/webhooks`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return res.json() as Promise<WebhookResponse>;
    },
    async listWebhooks(params: ListWebhooksParams): Promise<ListWebhooksResponse> {
      const url = `${baseUrl}/v1/mailboxes/${encodeURIComponent(params.id)}/webhooks`;
      const res = await primFetch(url);
      return res.json() as Promise<ListWebhooksResponse>;
    },
    async deleteWebhook(params: DeleteWebhookParams): Promise<DeleteWebhookResponse> {
      const url = `${baseUrl}/v1/mailboxes/${encodeURIComponent(params.id)}/webhooks/${encodeURIComponent(params.whId)}`;
      const res = await primFetch(url, {
        method: "DELETE",
      });
      return res.json() as Promise<DeleteWebhookResponse>;
    },
    async registerDomain(req: RegisterDomainRequest): Promise<DomainResponse> {
      const url = `${baseUrl}/v1/domains`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return res.json() as Promise<DomainResponse>;
    },
    async listDomains(params: ListDomainsParams): Promise<ListDomainsResponse> {
      const qs = new URLSearchParams();
      if (params.limit !== undefined) qs.set("limit", String(params.limit));
      if (params.after !== undefined) qs.set("after", String(params.after));
      const query = qs.toString();
      const url = `${baseUrl}/v1/domains${query ? `?${query}` : ""}`;
      const res = await primFetch(url);
      return res.json() as Promise<ListDomainsResponse>;
    },
    async getDomain(params: GetDomainParams): Promise<DomainResponse> {
      const url = `${baseUrl}/v1/domains/${encodeURIComponent(params.id)}`;
      const res = await primFetch(url);
      return res.json() as Promise<DomainResponse>;
    },
    async deleteDomain(params: DeleteDomainParams): Promise<DeleteDomainResponse> {
      const url = `${baseUrl}/v1/domains/${encodeURIComponent(params.id)}`;
      const res = await primFetch(url, {
        method: "DELETE",
      });
      return res.json() as Promise<DeleteDomainResponse>;
    },
    async verifyDomain(params: VerifyDomainParams): Promise<VerifyDomainResponse> {
      const url = `${baseUrl}/v1/domains/${encodeURIComponent(params.id)}/verify`;
      const res = await primFetch(url, {
        method: "POST",
      });
      return res.json() as Promise<VerifyDomainResponse>;
    },
  };
}
