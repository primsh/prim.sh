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

// ─── JMAP context (used by R-5/R-6) ────────────────────────────────────

export type { JmapContext } from "./context.ts";
export type { JmapSession } from "./jmap.ts";
