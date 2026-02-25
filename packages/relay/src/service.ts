import { randomBytes, createHash } from "node:crypto";
import {
  insertMailbox,
  getMailboxById,
  getMailboxByAddress,
  getMailboxesByOwner,
  getMailboxesByOwnerAll,
  countMailboxesByOwner,
  countMailboxesByOwnerAll,
  deleteMailboxRow,
  updateExpiresAt,
  insertWebhook,
  getWebhooksByMailbox,
  getWebhookById,
  deleteWebhookRow,
} from "./db.ts";
import {
  StalwartError,
  createPrincipal,
  deletePrincipal,
} from "./stalwart.ts";
import { encryptPassword } from "./crypto.ts";
import { discoverSession, buildBasicAuth, JmapError, queryEmails, getEmail, sendEmail } from "./jmap.ts";
import { getJmapContext } from "./context.ts";
import { expireMailbox } from "./expiry.ts";
import { verifySignature } from "./webhook-delivery.ts";
import { dispatchWebhookDeliveries } from "./webhook-delivery.ts";
import type {
  ServiceResult,
  MailboxResponse,
  MailboxListResponse,
  CreateMailboxRequest,
  RenewMailboxRequest,
  DeleteMailboxResponse,
  EmailMessage,
  EmailDetail,
  EmailListResponse,
  EmailAddress,
  SendMessageRequest,
  SendMessageResponse,
  RegisterWebhookRequest,
  WebhookResponse,
  WebhookListResponse,
  DeleteWebhookResponse,
  WebhookPayload,
} from "./api.ts";
import type { MailboxRow } from "./db.ts";

// ─── Constants ───────────────────────────────────────────────────────────

const DEFAULT_DOMAIN = process.env.RELAY_DEFAULT_DOMAIN ?? "relay.prim.sh";
const DEFAULT_TTL_MS = Number(process.env.RELAY_DEFAULT_TTL_MS) || 86_400_000; // 24h
const MIN_TTL_MS = Number(process.env.RELAY_MIN_TTL_MS) || 300_000; // 5 min
const MAX_TTL_MS = Number(process.env.RELAY_MAX_TTL_MS) || 604_800_000; // 7 days
const MAX_COLLISION_RETRIES = 3;

// ─── Helpers ─────────────────────────────────────────────────────────────

function generateId(): string {
  return `mbx_${randomBytes(4).toString("hex")}`;
}

function generateUsername(): string {
  return randomBytes(4).toString("hex");
}

function generatePassword(): string {
  return randomBytes(32).toString("hex");
}

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

function rowToResponse(row: MailboxRow): MailboxResponse {
  return {
    id: row.id,
    address: row.address,
    username: row.stalwart_name,
    domain: row.domain,
    status: row.status as MailboxResponse["status"],
    created_at: new Date(row.created_at).toISOString(),
    expires_at: new Date(row.expires_at).toISOString(),
  };
}

// ─── Expiry check ────────────────────────────────────────────────────────

function isExpired(row: MailboxRow): boolean {
  return row.status === "expired" || (row.status === "active" && row.expires_at < Date.now());
}

async function lazyExpire(row: MailboxRow): Promise<void> {
  if (row.status === "active" && row.expires_at < Date.now()) {
    await expireMailbox(row);
  }
}

// ─── Ownership ───────────────────────────────────────────────────────────

function checkOwnership(
  id: string,
  callerWallet: string,
): { ok: true; row: MailboxRow } | { ok: false; status: 404; code: "not_found"; message: string } {
  const row = getMailboxById(id);
  if (!row || row.owner_wallet !== callerWallet) {
    return { ok: false, status: 404, code: "not_found", message: "Mailbox not found" };
  }
  return { ok: true, row };
}

function validateTtl(ttlMs: number | undefined): ServiceResult<number> {
  if (ttlMs === undefined) return { ok: true, data: DEFAULT_TTL_MS };
  if (ttlMs < MIN_TTL_MS || ttlMs > MAX_TTL_MS) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: `ttl_ms must be between ${MIN_TTL_MS} and ${MAX_TTL_MS}`,
    };
  }
  return { ok: true, data: ttlMs };
}

// ─── Mailbox service ─────────────────────────────────────────────────────

export async function createMailbox(
  request: CreateMailboxRequest,
  callerWallet: string,
): Promise<ServiceResult<MailboxResponse>> {
  const domain = request.domain ?? DEFAULT_DOMAIN;

  if (domain !== DEFAULT_DOMAIN) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: `Only "${DEFAULT_DOMAIN}" is supported as a domain`,
    };
  }

  const ttlResult = validateTtl(request.ttl_ms);
  if (!ttlResult.ok) return ttlResult;

  const password = generatePassword();
  const passwordHash = hashPassword(password);
  const passwordEnc = encryptPassword(password);
  const now = Date.now();
  const expiresAt = now + ttlResult.data;

  let lastError: StalwartError | null = null;

  for (let attempt = 0; attempt < MAX_COLLISION_RETRIES; attempt++) {
    const username = generateUsername();
    const address = `${username}@${domain}`;

    try {
      await createPrincipal({
        type: "individual",
        name: username,
        secrets: [password],
        emails: [address],
        roles: ["user"],
      });
    } catch (err) {
      if (err instanceof StalwartError) {
        if (err.code === "conflict") {
          lastError = err;
          continue;
        }
        return { ok: false, status: err.statusCode, code: err.code, message: err.message };
      }
      throw err;
    }

    // Bootstrap JMAP session (best-effort — don't fail mailbox creation if JMAP is unreachable)
    let jmapData: {
      jmap_api_url: string | null;
      jmap_account_id: string | null;
      jmap_identity_id: string | null;
      jmap_inbox_id: string | null;
      jmap_drafts_id: string | null;
      jmap_sent_id: string | null;
    } = {
      jmap_api_url: null,
      jmap_account_id: null,
      jmap_identity_id: null,
      jmap_inbox_id: null,
      jmap_drafts_id: null,
      jmap_sent_id: null,
    };

    try {
      const authHeader = buildBasicAuth(address, password);
      const session = await discoverSession(authHeader);
      jmapData = {
        jmap_api_url: session.apiUrl,
        jmap_account_id: session.accountId,
        jmap_identity_id: session.identityId,
        jmap_inbox_id: session.inboxId,
        jmap_drafts_id: session.draftsId,
        jmap_sent_id: session.sentId,
      };
    } catch (err) {
      if (!(err instanceof JmapError)) throw err;
      // JMAP bootstrap failed — mailbox is still usable, session will be discovered lazily
    }

    const id = generateId();

    insertMailbox({
      id,
      stalwart_name: username,
      address,
      domain,
      owner_wallet: callerWallet,
      password_hash: passwordHash,
      password_enc: passwordEnc,
      quota: 0,
      created_at: now,
      expires_at: expiresAt,
      ...jmapData,
    });

    const row = getMailboxById(id);
    if (!row) throw new Error("Failed to retrieve mailbox after insert");

    return { ok: true, data: rowToResponse(row) };
  }

  return {
    ok: false,
    status: lastError?.statusCode ?? 500,
    code: "conflict",
    message: "Failed to generate unique username after retries",
  };
}

export function listMailboxes(
  callerWallet: string,
  page: number,
  perPage: number,
  includeExpired = false,
): MailboxListResponse {
  const offset = (page - 1) * perPage;
  const rows = includeExpired
    ? getMailboxesByOwnerAll(callerWallet, perPage, offset)
    : getMailboxesByOwner(callerWallet, perPage, offset);
  const total = includeExpired
    ? countMailboxesByOwnerAll(callerWallet)
    : countMailboxesByOwner(callerWallet);

  return {
    mailboxes: rows.map(rowToResponse),
    total,
    page,
    per_page: perPage,
  };
}

export async function getMailbox(
  id: string,
  callerWallet: string,
): Promise<ServiceResult<MailboxResponse>> {
  const check = checkOwnership(id, callerWallet);
  if (!check.ok) return check;

  await lazyExpire(check.row);
  // Re-read to get updated status
  const row = getMailboxById(id);
  if (!row) return { ok: false, status: 404, code: "not_found", message: "Mailbox not found" };

  return { ok: true, data: rowToResponse(row) };
}

export async function deleteMailbox(
  id: string,
  callerWallet: string,
): Promise<ServiceResult<DeleteMailboxResponse>> {
  const check = checkOwnership(id, callerWallet);
  if (!check.ok) return check;

  try {
    await deletePrincipal(check.row.stalwart_name);
  } catch (err) {
    if (err instanceof StalwartError) {
      return { ok: false, status: err.statusCode, code: err.code, message: err.message };
    }
    throw err;
  }

  deleteMailboxRow(id);

  return { ok: true, data: { id, deleted: true } };
}

// ─── Email reading (R-5) ──────────────────────────────────────────────

type FolderName = "inbox" | "drafts" | "sent" | "all";

function flattenAddress(addrs: { name: string | null; email: string }[]): EmailAddress {
  if (!addrs || addrs.length === 0) return { name: null, email: "" };
  return { name: addrs[0].name ?? null, email: addrs[0].email };
}

function flattenAddresses(addrs: { name: string | null; email: string }[]): EmailAddress[] {
  if (!addrs) return [];
  return addrs.map((a) => ({ name: a.name ?? null, email: a.email }));
}

export async function listMessages(
  mailboxId: string,
  callerWallet: string,
  opts: { limit?: number; position?: number; folder?: FolderName },
): Promise<ServiceResult<EmailListResponse>> {
  const check = checkOwnership(mailboxId, callerWallet);
  if (!check.ok) return check;
  await lazyExpire(check.row);
  if (isExpired(check.row)) {
    return { ok: false, status: 410, code: "expired", message: "Mailbox has expired" };
  }

  const ctxResult = await getJmapContext(mailboxId, callerWallet);
  if (!ctxResult.ok) return ctxResult;
  const ctx = ctxResult.data;

  const folder = opts.folder ?? "inbox";
  let jmapMailboxId: string | undefined;
  if (folder === "inbox") jmapMailboxId = ctx.inboxId;
  else if (folder === "drafts") jmapMailboxId = ctx.draftsId || undefined;
  else if (folder === "sent") jmapMailboxId = ctx.sentId || undefined;
  // folder === "all" → undefined (no filter)

  const limit = Math.max(1, Math.min(opts.limit ?? 20, 100));
  const position = Math.max(0, opts.position ?? 0);

  try {
    const result = await queryEmails(ctx, { mailboxId: jmapMailboxId, limit, position });
    const messages: EmailMessage[] = result.messages.map((m) => ({
      id: m.id,
      from: flattenAddress(m.from),
      to: flattenAddresses(m.to),
      subject: m.subject,
      receivedAt: m.receivedAt,
      size: m.size,
      hasAttachment: m.hasAttachment,
      preview: m.preview,
    }));
    return { ok: true, data: { messages, total: result.total, position: result.position } };
  } catch (err) {
    if (err instanceof JmapError) {
      return { ok: false, status: err.statusCode, code: err.code, message: err.message };
    }
    throw err;
  }
}

export async function getMessage(
  mailboxId: string,
  callerWallet: string,
  messageId: string,
): Promise<ServiceResult<EmailDetail>> {
  const check = checkOwnership(mailboxId, callerWallet);
  if (!check.ok) return check;
  await lazyExpire(check.row);
  if (isExpired(check.row)) {
    return { ok: false, status: 410, code: "expired", message: "Mailbox has expired" };
  }

  const ctxResult = await getJmapContext(mailboxId, callerWallet);
  if (!ctxResult.ok) return ctxResult;
  const ctx = ctxResult.data;

  try {
    const email = await getEmail(ctx, messageId);
    const bodyValues = email.bodyValues ?? {};

    let textBody: string | null = null;
    if (email.textBody?.length > 0) {
      const partId = email.textBody[0].partId;
      textBody = bodyValues[partId]?.value ?? null;
    }

    let htmlBody: string | null = null;
    if (email.htmlBody?.length > 0) {
      const partId = email.htmlBody[0].partId;
      htmlBody = bodyValues[partId]?.value ?? null;
    }

    const detail: EmailDetail = {
      id: email.id,
      from: flattenAddress(email.from),
      to: flattenAddresses(email.to),
      cc: flattenAddresses(email.cc ?? []),
      subject: email.subject ?? "",
      receivedAt: email.receivedAt ?? "",
      size: email.size ?? 0,
      hasAttachment: email.hasAttachment ?? false,
      preview: email.preview ?? "",
      textBody,
      htmlBody,
    };
    return { ok: true, data: detail };
  } catch (err) {
    if (err instanceof JmapError) {
      return { ok: false, status: err.statusCode, code: err.code, message: err.message };
    }
    throw err;
  }
}

// ─── Email sending (R-6) ──────────────────────────────────────────────

export async function sendMessage(
  mailboxId: string,
  callerWallet: string,
  request: SendMessageRequest,
): Promise<ServiceResult<SendMessageResponse>> {
  if (!request.to || request.to.trim() === "") {
    return { ok: false, status: 400, code: "invalid_request", message: "to is required" };
  }
  if (!request.body && !request.html) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "At least one of body or html is required",
    };
  }

  const check = checkOwnership(mailboxId, callerWallet);
  if (!check.ok) return check;
  await lazyExpire(check.row);
  if (isExpired(check.row)) {
    return { ok: false, status: 410, code: "expired", message: "Mailbox has expired" };
  }

  const ctxResult = await getJmapContext(mailboxId, callerWallet);
  if (!ctxResult.ok) return ctxResult;
  const ctx = ctxResult.data;

  const to = [{ name: null, email: request.to }];
  const cc = request.cc ? [{ name: null, email: request.cc }] : undefined;
  const bcc = request.bcc ? [{ name: null, email: request.bcc }] : undefined;

  try {
    const result = await sendEmail(ctx, {
      from: { name: null, email: ctx.address },
      to,
      cc,
      bcc,
      subject: request.subject,
      textBody: request.body ?? null,
      htmlBody: request.html ?? null,
      identityId: ctx.identityId,
      draftsId: ctx.draftsId,
    });
    return { ok: true, data: { message_id: result.messageId, status: "sent" } };
  } catch (err) {
    if (err instanceof JmapError) {
      return { ok: false, status: err.statusCode, code: err.code, message: err.message };
    }
    throw err;
  }
}

// ─── Mailbox renewal (R-8) ────────────────────────────────────────────

export async function renewMailbox(
  id: string,
  callerWallet: string,
  request: RenewMailboxRequest,
): Promise<ServiceResult<MailboxResponse>> {
  const check = checkOwnership(id, callerWallet);
  if (!check.ok) return check;

  // Cannot renew an already-expired mailbox
  await lazyExpire(check.row);
  if (isExpired(check.row)) {
    return { ok: false, status: 410, code: "expired", message: "Mailbox has expired" };
  }

  const ttlResult = validateTtl(request.ttl_ms);
  if (!ttlResult.ok) return ttlResult;

  const newExpiresAt = Date.now() + ttlResult.data;
  updateExpiresAt(id, newExpiresAt);

  const row = getMailboxById(id);
  if (!row) return { ok: false, status: 404, code: "not_found", message: "Mailbox not found" };

  return { ok: true, data: rowToResponse(row) };
}

// ─── Webhooks (R-7) ──────────────────────────────────────────────────

function webhookToResponse(row: import("./db.ts").WebhookRow): WebhookResponse {
  const events: string[] = JSON.parse(row.events);
  return {
    id: row.id,
    url: row.url,
    events,
    status: row.status,
    created_at: new Date(row.created_at).toISOString(),
  };
}

export async function registerWebhook(
  mailboxId: string,
  callerWallet: string,
  request: RegisterWebhookRequest,
): Promise<ServiceResult<WebhookResponse>> {
  const check = checkOwnership(mailboxId, callerWallet);
  if (!check.ok) return check;

  if (!request.url || request.url.trim() === "") {
    return { ok: false, status: 400, code: "invalid_request", message: "url is required" };
  }

  const allowHttp = process.env.NODE_ENV === "test" || process.env.RELAY_ALLOW_HTTP_WEBHOOKS === "1";
  if (!request.url.startsWith("https://") && !(allowHttp && request.url.startsWith("http://"))) {
    return { ok: false, status: 400, code: "invalid_request", message: "url must use HTTPS" };
  }

  const events = request.events ?? ["message.received"];
  const validEvents = ["message.received"];
  for (const e of events) {
    if (!validEvents.includes(e)) {
      return { ok: false, status: 400, code: "invalid_request", message: `Unsupported event: ${e}` };
    }
  }

  const secretEnc = request.secret ? encryptPassword(request.secret) : null;
  const id = `wh_${randomBytes(4).toString("hex")}`;
  const now = Date.now();

  insertWebhook({
    id,
    mailbox_id: mailboxId,
    owner_wallet: callerWallet,
    url: request.url,
    secret_enc: secretEnc,
    events: JSON.stringify(events),
    created_at: now,
  });

  const row = getWebhookById(id);
  if (!row) throw new Error("Failed to retrieve webhook after insert");

  return { ok: true, data: webhookToResponse(row) };
}

export function listWebhooks(
  mailboxId: string,
  callerWallet: string,
): ServiceResult<WebhookListResponse> {
  const check = checkOwnership(mailboxId, callerWallet);
  if (!check.ok) return check;

  const rows = getWebhooksByMailbox(mailboxId);
  return {
    ok: true,
    data: {
      webhooks: rows.map(webhookToResponse),
      total: rows.length,
    },
  };
}

export function deleteWebhook(
  mailboxId: string,
  callerWallet: string,
  webhookId: string,
): ServiceResult<DeleteWebhookResponse> {
  const check = checkOwnership(mailboxId, callerWallet);
  if (!check.ok) return check;

  const wh = getWebhookById(webhookId);
  if (!wh || wh.mailbox_id !== mailboxId) {
    return { ok: false, status: 404, code: "not_found", message: "Webhook not found" };
  }

  deleteWebhookRow(webhookId);
  return { ok: true, data: { id: webhookId, deleted: true } };
}

// ─── Ingest handler (R-7) ────────────────────────────────────────────

interface IngestResult {
  accepted: boolean;
  reason?: string;
}

export async function handleIngestEvent(
  rawBody: string,
  signature: string | null,
): Promise<ServiceResult<IngestResult>> {
  // Verify HMAC signature from Stalwart
  const secret = process.env.STALWART_WEBHOOK_SECRET ?? "";
  if (secret) {
    if (!signature || !verifySignature(secret, rawBody, signature)) {
      return { ok: false, status: 401, code: "forbidden", message: "Invalid signature" };
    }
  }

  let events: Array<{ type: string; data: Record<string, unknown> }>;
  try {
    const parsed = JSON.parse(rawBody);
    events = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return { ok: false, status: 400, code: "invalid_request", message: "Invalid JSON" };
  }

  for (const event of events) {
    if (event.type !== "message-ingest.ham" && event.type !== "message-ingest.spam") {
      continue;
    }

    const recipients = (event.data?.rcptTo ?? event.data?.recipients ?? []) as string[];
    for (const rcpt of recipients) {
      const address = typeof rcpt === "string" ? rcpt : "";
      if (!address) continue;

      const mbxRow = getMailboxByAddress(address);
      if (!mbxRow) continue;

      const webhooks = getWebhooksByMailbox(mbxRow.id);
      if (webhooks.length === 0) continue;

      // Build payload from event data — skip JMAP fetch for speed
      const payload: WebhookPayload = {
        event: "message.received",
        mailbox_id: mbxRow.id,
        message_id: (event.data?.messageId as string) ?? "",
        from: { name: null, email: (event.data?.from as string) ?? "" },
        to: [{ name: null, email: address }],
        subject: (event.data?.subject as string) ?? "",
        preview: "",
        received_at: new Date().toISOString(),
        size: (event.data?.size as number) ?? 0,
        has_attachment: false,
        timestamp: new Date().toISOString(),
      };

      dispatchWebhookDeliveries(webhooks, payload);
    }
  }

  return { ok: true, data: { accepted: true } };
}
