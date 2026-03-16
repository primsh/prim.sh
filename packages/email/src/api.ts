// SPDX-License-Identifier: Apache-2.0
/**
 * email.sh API contract — Zod schemas, inferred types, and error envelope.
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
  "stalwart_error",
  "conflict",
  "username_taken",
  "jmap_error",
  "expired",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

// ─── Mailbox types ──────────────────────────────────────────────────────

export type MailboxStatus = "active" | "expired" | "deleted";

export const GetMailboxResponseSchema = z.object({
  id: z.string().describe('Mailbox ID (e.g. "mbx_abc123").'),
  address: z.string().describe('Full email address (e.g. "abc123@mail.prim.sh").'),
  username: z.string().describe("Username portion of the email address."),
  domain: z.string().describe("Domain portion of the email address."),
  status: z
    .enum(["active", "expired", "deleted"])
    .describe('Current status: "active" | "expired" | "deleted".'),
  created_at: z.string().describe("ISO 8601 timestamp when the mailbox was created."),
  expires_at: z
    .string()
    .nullable()
    .describe("ISO 8601 timestamp when the mailbox expires. Null if permanent."),
});
export type GetMailboxResponse = z.infer<typeof GetMailboxResponseSchema>;

export const CreateMailboxRequestSchema = z.object({
  username: z.string().optional().describe("Desired username. Omit for random generation."),
  domain: z
    .string()
    .optional()
    .describe("Domain for the mailbox (must be registered). Omit for default domain."),
  ttl_ms: z.number().optional().describe("TTL in milliseconds. Omit for permanent mailbox."),
});
export type CreateMailboxRequest = z.infer<typeof CreateMailboxRequestSchema>;

export const RenewMailboxRequestSchema = z.object({
  ttl_ms: z
    .number()
    .optional()
    .describe("Extension duration in milliseconds. Omit to apply default TTL."),
});
export type RenewMailboxRequest = z.infer<typeof RenewMailboxRequestSchema>;

export const DeleteMailboxResponseSchema = z.object({
  id: z.string().describe("Mailbox ID that was deleted."),
  deleted: z.literal(true).describe("Always true on success."),
});
export type DeleteMailboxResponse = z.infer<typeof DeleteMailboxResponseSchema>;

// ─── Email types (R-5) ─────────────────────────────────────────────────

export const EmailAddressSchema = z.object({
  name: z.string().nullable().describe("Display name. Null if not present."),
  email: z.string().describe("Email address string."),
});
export type EmailAddress = z.infer<typeof EmailAddressSchema>;

export const EmailMessageSchema = z.object({
  id: z.string().describe("Message ID."),
  from: EmailAddressSchema.describe("Sender address."),
  to: z.array(EmailAddressSchema).describe("Recipient addresses."),
  subject: z.string().describe("Email subject line."),
  received_at: z.string().describe("ISO 8601 timestamp when the message was received."),
  size: z.number().describe("Message size in bytes."),
  has_attachment: z.boolean().describe("Whether the message has attachments."),
  preview: z.string().describe("Short preview text (first ~100 chars of body)."),
});
export type EmailMessage = z.infer<typeof EmailMessageSchema>;

export const EmailDetailSchema = EmailMessageSchema.extend({
  cc: z.array(EmailAddressSchema).describe("CC recipient addresses."),
  text_body: z.string().nullable().describe("Plain-text body. Null if not present."),
  html_body: z.string().nullable().describe("HTML body. Null if not present."),
});
export type EmailDetail = z.infer<typeof EmailDetailSchema>;

// ─── Send types (R-6) ─────────────────────────────────────────────────

export const SendMessageRequestSchema = z.object({
  to: z.string().describe("Recipient email address."),
  subject: z.string().describe("Email subject line."),
  body: z.string().optional().describe("Plain-text body. Either body or html is required."),
  html: z.string().optional().describe("HTML body. Either body or html is required."),
  cc: z.string().optional().describe("CC recipient email address."),
  bcc: z.string().optional().describe("BCC recipient email address."),
});
export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;

export const SendMessageResponseSchema = z.object({
  message_id: z.string().describe("Message ID assigned by the mail server."),
  status: z.literal("sent").describe('Always "sent" on success.'),
});
export type SendMessageResponse = z.infer<typeof SendMessageResponseSchema>;

// ─── Webhook types (R-7) ──────────────────────────────────────────────

export const RegisterWebhookRequestSchema = z.object({
  url: z.string().describe("HTTPS URL to receive webhook POST requests."),
  secret: z.string().optional().describe("HMAC secret for X-Prim-Signature verification."),
  events: z
    .array(z.string())
    .optional()
    .describe('Events to subscribe to. Defaults to ["message.received"].'),
});
export type RegisterWebhookRequest = z.infer<typeof RegisterWebhookRequestSchema>;

export const GetWebhookResponseSchema = z.object({
  id: z.string().describe('Webhook ID (e.g. "wh_abc123").'),
  url: z.string().describe("Webhook endpoint URL."),
  events: z.array(z.string()).describe("Subscribed events."),
  status: z.string().describe("Webhook status."),
  created_at: z.string().describe("ISO 8601 timestamp when the webhook was created."),
});
export type GetWebhookResponse = z.infer<typeof GetWebhookResponseSchema>;

export const DeleteWebhookResponseSchema = z.object({
  id: z.string().describe("Webhook ID that was deleted."),
  deleted: z.literal(true).describe("Always true on success."),
});
export type DeleteWebhookResponse = z.infer<typeof DeleteWebhookResponseSchema>;

export const WebhookPayloadSchema = z.object({
  event: z.string().describe('Event type (e.g. "message.received").'),
  mailbox_id: z.string().describe("Mailbox ID that received the message."),
  message_id: z.string().describe("Message ID."),
  from: z.object({ name: z.string().nullable(), email: z.string() }).describe("Sender address."),
  to: z
    .array(z.object({ name: z.string().nullable(), email: z.string() }))
    .describe("Recipient addresses."),
  subject: z.string().describe("Email subject line."),
  preview: z.string().describe("Short preview of the message body."),
  received_at: z.string().describe("ISO 8601 timestamp when the message was received."),
  size: z.number().describe("Message size in bytes."),
  has_attachment: z.boolean().describe("Whether the message has attachments."),
  timestamp: z.string().describe("ISO 8601 timestamp when the webhook was dispatched."),
});
export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;

// ─── Domain types (R-9) ──────────────────────────────────────────────

export const DnsRecordSchema = z.object({
  type: z.string().describe('DNS record type (e.g. "MX", "TXT").'),
  name: z.string().describe("DNS record name (hostname)."),
  content: z.string().describe("DNS record value."),
  priority: z.number().optional().describe("MX priority. Only present for MX records."),
});
export type DnsRecord = z.infer<typeof DnsRecordSchema>;

export const RegisterDomainRequestSchema = z.object({
  domain: z.string().describe('Domain name to register (e.g. "myproject.com").'),
});
export type RegisterDomainRequest = z.infer<typeof RegisterDomainRequestSchema>;

export const GetDomainResponseSchema = z.object({
  id: z.string().describe("Domain registration ID."),
  domain: z.string().describe("Registered domain name."),
  status: z.string().describe('Verification status ("pending" | "verified").'),
  owner_wallet: z.string().describe("Ethereum address of the domain owner."),
  created_at: z.string().describe("ISO 8601 timestamp when the domain was registered."),
  verified_at: z
    .string()
    .nullable()
    .describe("ISO 8601 timestamp when the domain was verified. Null if unverified."),
  required_records: z
    .array(DnsRecordSchema)
    .describe("DNS records that must be added to verify the domain."),
  dkim_records: z
    .array(DnsRecordSchema)
    .optional()
    .describe("DKIM DNS records. Only present after successful verification."),
});
export type GetDomainResponse = z.infer<typeof GetDomainResponseSchema>;

export const DeleteDomainResponseSchema = z.object({
  id: z.string().describe("Domain registration ID that was deleted."),
  deleted: z.literal(true).describe("Always true on success."),
  warning: z.string().optional().describe("Warning message if domain had active mailboxes."),
});
export type DeleteDomainResponse = z.infer<typeof DeleteDomainResponseSchema>;

export const VerificationResultSchema = z.object({
  type: z.string().describe("DNS record type checked."),
  name: z.string().describe("DNS record name checked."),
  expected: z.string().describe("Expected DNS record value."),
  found: z.string().nullable().describe("Actual DNS record value found. Null if not found."),
  pass: z.boolean().describe("Whether the record matched the expected value."),
});
export type VerificationResult = z.infer<typeof VerificationResultSchema>;

export const VerifyDomainResponseSchema = z.object({
  id: z.string().describe("Domain registration ID."),
  domain: z.string().describe("Domain name."),
  status: z.string().describe("Updated verification status."),
  verified_at: z
    .string()
    .nullable()
    .describe("ISO 8601 timestamp when the domain was verified. Null if not yet verified."),
  verification_results: z
    .array(VerificationResultSchema)
    .optional()
    .describe("Per-record verification results."),
  dkim_records: z
    .array(DnsRecordSchema)
    .optional()
    .describe("DKIM records to add to DNS. Only present on successful verification."),
});
export type VerifyDomainResponse = z.infer<typeof VerifyDomainResponseSchema>;

// ─── JMAP context (used by R-5/R-6) ────────────────────────────────────

export type { JmapContext } from "./context.ts";
export type { JmapSession } from "./jmap.ts";
