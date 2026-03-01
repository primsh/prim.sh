// SPDX-License-Identifier: Apache-2.0
/**
 * email.sh API contract — request/response types and error envelope.
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
  "stalwart_error",
  "conflict",
  "username_taken",
  "jmap_error",
  "expired",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

// ─── Mailbox types ──────────────────────────────────────────────────────

export type MailboxStatus = "active" | "expired" | "deleted";

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
  status: MailboxStatus;
  /** ISO 8601 timestamp when the mailbox was created. */
  created_at: string;
  /** ISO 8601 timestamp when the mailbox expires. Null if permanent. */
  expires_at: string | null;
}

export interface CreateMailboxRequest {
  /** Desired username. Omit for random generation. */
  username?: string;
  /** Domain for the mailbox (must be registered). Omit for default domain. */
  domain?: string;
  /** TTL in milliseconds. Omit for permanent mailbox. */
  ttl_ms?: number;
}

export interface RenewMailboxRequest {
  /** Extension duration in milliseconds. Omit to apply default TTL. */
  ttl_ms?: number;
}

export interface DeleteMailboxResponse {
  /** Mailbox ID that was deleted. */
  id: string;
  /** Always true on success. */
  deleted: true;
}

// ─── Email types (R-5) ─────────────────────────────────────────────────

export interface EmailAddress {
  /** Display name. Null if not present. */
  name: string | null;
  /** Email address string. */
  email: string;
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

export interface EmailDetail extends EmailMessage {
  /** CC recipient addresses. */
  cc: EmailAddress[];
  /** Plain-text body. Null if not present. */
  text_body: string | null;
  /** HTML body. Null if not present. */
  html_body: string | null;
}

// ─── Send types (R-6) ─────────────────────────────────────────────────

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

// ─── Webhook types (R-7) ──────────────────────────────────────────────

export interface RegisterWebhookRequest {
  /** HTTPS URL to receive webhook POST requests. */
  url: string;
  /** HMAC secret for X-Prim-Signature verification. */
  secret?: string;
  /** Events to subscribe to. Defaults to ["message.received"]. */
  events?: string[];
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

export interface DeleteWebhookResponse {
  /** Webhook ID that was deleted. */
  id: string;
  /** Always true on success. */
  deleted: true;
}

export interface WebhookPayload {
  /** Event type (e.g. "message.received"). */
  event: string;
  /** Mailbox ID that received the message. */
  mailbox_id: string;
  /** Message ID. */
  message_id: string;
  /** Sender address. */
  from: { name: string | null; email: string };
  /** Recipient addresses. */
  to: { name: string | null; email: string }[];
  /** Email subject line. */
  subject: string;
  /** Short preview of the message body. */
  preview: string;
  /** ISO 8601 timestamp when the message was received. */
  received_at: string;
  /** Message size in bytes. */
  size: number;
  /** Whether the message has attachments. */
  has_attachment: boolean;
  /** ISO 8601 timestamp when the webhook was dispatched. */
  timestamp: string;
}

// ─── Domain types (R-9) ──────────────────────────────────────────────

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

export interface RegisterDomainRequest {
  /** Domain name to register (e.g. "myproject.com"). */
  domain: string;
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

export interface DeleteDomainResponse {
  /** Domain registration ID that was deleted. */
  id: string;
  /** Always true on success. */
  deleted: true;
  /** Warning message if domain had active mailboxes. */
  warning?: string;
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

// ─── JMAP context (used by R-5/R-6) ────────────────────────────────────

export type { JmapContext } from "./context.ts";
export type { JmapSession } from "./jmap.ts";
