/**
 * relay.sh API contract — request/response types and error envelope.
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
  expires_at: string;
}

export interface CreateMailboxRequest {
  domain?: string;
  ttl_ms?: number;
}

export interface RenewMailboxRequest {
  ttl_ms?: number;
}

export interface MailboxListResponse {
  mailboxes: MailboxResponse[];
  total: number;
  page: number;
  per_page: number;
}

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

export interface EmailListResponse {
  messages: EmailMessage[];
  total: number;
  position: number;
}

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

export interface WebhookListResponse {
  webhooks: WebhookResponse[];
  total: number;
}

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

// ─── JMAP context (used by R-5/R-6) ────────────────────────────────────

export type { JmapContext } from "./context.ts";
export type { JmapSession } from "./jmap.ts";
