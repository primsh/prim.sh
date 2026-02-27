/**
 * email.sh API contract — request/response types and error envelope.
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
  "stalwart_error",
  "conflict",
  "username_taken",
  "jmap_error",
  "expired",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

// ─── Service result ─────────────────────────────────────────────────────

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string };

// ─── Mailbox types ──────────────────────────────────────────────────────

export type MailboxStatus = "active" | "expired" | "deleted";

export interface MailboxResponse {
  id: string;
  address: string;
  username: string;
  domain: string;
  status: MailboxStatus;
  created_at: string;
  expires_at: string | null;
}

export interface CreateMailboxRequest {
  username?: string;
  domain?: string;
  ttl_ms?: number;
}

export interface RenewMailboxRequest {
  ttl_ms?: number;
}

import type { PaginatedList } from "@primsh/x402-middleware";

/** @deprecated Use PaginatedList<MailboxResponse> */
export type MailboxListResponse = PaginatedList<MailboxResponse>;

export interface DeleteMailboxResponse {
  id: string;
  deleted: true;
}

// ─── Email types (R-5) ─────────────────────────────────────────────────

export interface EmailAddress {
  name: string | null;
  email: string;
}

export interface EmailMessage {
  id: string;
  from: EmailAddress;
  to: EmailAddress[];
  subject: string;
  receivedAt: string;
  size: number;
  hasAttachment: boolean;
  preview: string;
}

export interface EmailDetail extends EmailMessage {
  cc: EmailAddress[];
  textBody: string | null;
  htmlBody: string | null;
}

/** @deprecated Use PaginatedList<EmailMessage> */
export type EmailListResponse = PaginatedList<EmailMessage>;

// ─── Send types (R-6) ─────────────────────────────────────────────────

export interface SendMessageRequest {
  to: string;
  subject: string;
  body?: string;
  html?: string;
  cc?: string;
  bcc?: string;
}

export interface SendMessageResponse {
  message_id: string;
  status: "sent";
}

// ─── Webhook types (R-7) ──────────────────────────────────────────────

export interface RegisterWebhookRequest {
  url: string;
  secret?: string;
  events?: string[];
}

export interface WebhookResponse {
  id: string;
  url: string;
  events: string[];
  status: string;
  created_at: string;
}

/** @deprecated Use PaginatedList<WebhookResponse> */
export type WebhookListResponse = PaginatedList<WebhookResponse>;

export interface DeleteWebhookResponse {
  id: string;
  deleted: true;
}

export interface WebhookPayload {
  event: string;
  mailbox_id: string;
  message_id: string;
  from: { name: string | null; email: string };
  to: { name: string | null; email: string }[];
  subject: string;
  preview: string;
  received_at: string;
  size: number;
  has_attachment: boolean;
  timestamp: string;
}

// ─── Domain types (R-9) ──────────────────────────────────────────────

export interface DnsRecord {
  type: string;
  name: string;
  content: string;
  priority?: number;
}

export interface RegisterDomainRequest {
  domain: string;
}

export interface DomainResponse {
  id: string;
  domain: string;
  status: string;
  owner_wallet: string;
  created_at: string;
  verified_at: string | null;
  required_records: DnsRecord[];
  dkim_records?: DnsRecord[];
}

/** @deprecated Use PaginatedList<DomainResponse> */
export type DomainListResponse = PaginatedList<DomainResponse>;

export interface DeleteDomainResponse {
  id: string;
  deleted: true;
  warning?: string;
}

export interface VerificationResult {
  type: string;
  name: string;
  expected: string;
  found: string | null;
  pass: boolean;
}

export interface VerifyDomainResponse {
  id: string;
  domain: string;
  status: string;
  verified_at: string | null;
  verification_results?: VerificationResult[];
  dkim_records?: DnsRecord[];
}

// ─── JMAP context (used by R-5/R-6) ────────────────────────────────────

export type { JmapContext } from "./context.ts";
export type { JmapSession } from "./jmap.ts";
