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
  insertDomain,
  getDomainById,
  getDomainByName,
  getDomainsByOwner,
  countDomainsByOwner,
  updateDomainVerification,
  updateDomainProvisioned,
  deleteDomainRow,
  countMailboxesByDomain,
} from "./db.ts";
import {
  StalwartError,
  createPrincipal,
  deletePrincipal,
  createDomainPrincipal,
  deleteDomainPrincipal,
  generateDkim,
  getDnsRecords,
} from "./stalwart.ts";
import { encryptPassword } from "./crypto.ts";
import { discoverSession, buildBasicAuth, JmapError, queryEmails, getEmail, sendEmail } from "./jmap.ts";
import { getJmapContext } from "./context.ts";
import { expireMailbox } from "./expiry.ts";
import { verifySignature, dispatchWebhookDeliveries } from "./webhook-delivery.ts";
import { verifyDns } from "./dns-check.ts";
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
  RegisterDomainRequest,
  DomainResponse,
  DomainListResponse,
  DeleteDomainResponse,
  VerifyDomainResponse,
  DnsRecord,
  VerificationResult,
} from "./api.ts";
import type { MailboxRow, DomainRow } from "./db.ts";

// ─── Constants ───────────────────────────────────────────────────────────

const DEFAULT_DOMAIN = process.env.EMAIL_DEFAULT_DOMAIN ?? "email.prim.sh";
const DEFAULT_TTL_MS = Number(process.env.EMAIL_DEFAULT_TTL_MS) || 86_400_000; // 24h
const MIN_TTL_MS = Number(process.env.EMAIL_MIN_TTL_MS) || 300_000; // 5 min
const MAX_COLLISION_RETRIES = 3;

const USERNAME_RE = /^[a-z0-9]([a-z0-9.\-]*[a-z0-9])?$/i;

// ─── Helpers ─────────────────────────────────────────────────────────────

function generateId(): string {
  return `mbx_${randomBytes(4).toString("hex")}`;
}

function generateUsername(): string {
  return randomBytes(4).toString("hex");
}

function validateUsername(username: string): ServiceResult<string> {
  if (username.length < 3 || username.length > 32) {
    return { ok: false, status: 400, code: "invalid_request", message: "Username must be 3-32 characters" };
  }
  if (!USERNAME_RE.test(username)) {
    return { ok: false, status: 400, code: "invalid_request", message: "Username must be alphanumeric, dots, or hyphens, and cannot start/end with dot or hyphen" };
  }
  if (/[.\-]{2}/.test(username)) {
    return { ok: false, status: 400, code: "invalid_request", message: "Username cannot contain consecutive dots or hyphens" };
  }
  return { ok: true, data: username.toLowerCase() };
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
    expires_at: row.expires_at !== null ? new Date(row.expires_at).toISOString() : null,
  };
}

// ─── Expiry check ────────────────────────────────────────────────────────

function isExpired(row: MailboxRow): boolean {
  if (row.status === "expired") return true;
  if (row.expires_at === null) return false;
  return row.status === "active" && row.expires_at < Date.now();
}

async function lazyExpire(row: MailboxRow): Promise<void> {
  if (row.expires_at === null) return;
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

function validateTtl(ttlMs: number | undefined): ServiceResult<number | null> {
  if (ttlMs === undefined) return { ok: true, data: null };
  if (ttlMs < MIN_TTL_MS) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: `ttl_ms must be at least ${MIN_TTL_MS}`,
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
    const domainRow = getDomainByName(domain);
    if (!domainRow || domainRow.owner_wallet !== callerWallet) {
      return { ok: false, status: 400, code: "invalid_request", message: "Domain not found" };
    }
    if (domainRow.status !== "active") {
      return { ok: false, status: 400, code: "domain_not_verified", message: "Domain not yet verified" };
    }
  }

  const ttlResult = validateTtl(request.ttl_ms);
  if (!ttlResult.ok) return ttlResult;

  // Validate custom username if provided
  let customUsername: string | undefined;
  if (request.username !== undefined) {
    const usernameResult = validateUsername(request.username);
    if (!usernameResult.ok) return usernameResult;
    customUsername = usernameResult.data;
  }

  const password = generatePassword();
  const passwordHash = hashPassword(password);
  const passwordEnc = encryptPassword(password);
  const now = Date.now();
  const expiresAt = ttlResult.data !== null ? now + ttlResult.data : null;

  if (customUsername) {
    // Custom username path — single attempt, no retry loop
    const address = `${customUsername}@${domain}`;

    try {
      await createPrincipal({
        type: "individual",
        name: customUsername,
        secrets: [password],
        emails: [address],
        roles: ["user"],
      });
    } catch (err) {
      if (err instanceof StalwartError) {
        if (err.code === "conflict") {
          return { ok: false, status: 409, code: "username_taken", message: "Username is already taken" };
        }
        return { ok: false, status: err.statusCode, code: err.code, message: err.message };
      }
      throw err;
    }

    return finalizeMailbox(customUsername, address, domain, callerWallet, password, passwordHash, passwordEnc, now, expiresAt);
  }

  // Random username path — retry loop on collision
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

    return finalizeMailbox(username, address, domain, callerWallet, password, passwordHash, passwordEnc, now, expiresAt);
  }

  return {
    ok: false,
    status: lastError?.statusCode ?? 500,
    code: "conflict",
    message: "Failed to generate unique username after retries",
  };
}

async function finalizeMailbox(
  username: string,
  address: string,
  domain: string,
  callerWallet: string,
  password: string,
  passwordHash: string,
  passwordEnc: string,
  now: number,
  expiresAt: number | null,
): Promise<ServiceResult<MailboxResponse>> {
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
    const authHeader = buildBasicAuth(username, password);
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

  if (request.ttl_ms === undefined) {
    // No ttl_ms: ephemeral → make permanent, permanent → no-op
    if (check.row.expires_at !== null) {
      updateExpiresAt(id, null);
    }
  } else {
    const ttlResult = validateTtl(request.ttl_ms);
    if (!ttlResult.ok) return ttlResult;
    const newExpiresAt = ttlResult.data !== null ? Date.now() + ttlResult.data : null;
    updateExpiresAt(id, newExpiresAt);
  }

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

  const allowHttp = process.env.NODE_ENV === "test" || process.env.EMAIL_ALLOW_HTTP_WEBHOOKS === "1";
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

// ─── Custom domains (R-9) ────────────────────────────────────────────

const MAIL_HOST = process.env.EMAIL_MAIL_HOST ?? "mail.email.prim.sh";
const RESERVED_DOMAINS = ["email.prim.sh", "prim.sh", "mail.email.prim.sh"];

function isValidDomain(domain: string): boolean {
  if (!domain || domain.length > 253) return false;
  const parts = domain.split(".");
  if (parts.length < 2) return false;
  return parts.every(
    (p) => p.length > 0 && p.length <= 63 && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i.test(p),
  );
}

function buildRequiredRecords(domain: string): DnsRecord[] {
  return [
    { type: "MX", name: domain, content: MAIL_HOST, priority: 10 },
    { type: "TXT", name: domain, content: "v=spf1 include:email.prim.sh -all" },
    { type: "TXT", name: `_dmarc.${domain}`, content: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}; pct=100` },
  ];
}

function domainToResponse(row: DomainRow): DomainResponse {
  const resp: DomainResponse = {
    id: row.id,
    domain: row.domain,
    status: row.status,
    owner_wallet: row.owner_wallet,
    created_at: new Date(row.created_at).toISOString(),
    verified_at: row.verified_at ? new Date(row.verified_at).toISOString() : null,
    required_records: buildRequiredRecords(row.domain),
  };
  if (row.status === "active" && (row.dkim_rsa_record || row.dkim_ed_record)) {
    resp.dkim_records = [];
    if (row.dkim_rsa_record) {
      resp.dkim_records.push({ type: "TXT", name: `rsa._domainkey.${row.domain}`, content: row.dkim_rsa_record });
    }
    if (row.dkim_ed_record) {
      resp.dkim_records.push({ type: "TXT", name: `ed._domainkey.${row.domain}`, content: row.dkim_ed_record });
    }
  }
  return resp;
}

export async function registerDomain(
  request: RegisterDomainRequest,
  callerWallet: string,
): Promise<ServiceResult<DomainResponse>> {
  const domain = request.domain?.trim().toLowerCase();
  if (!domain || !isValidDomain(domain)) {
    return { ok: false, status: 400, code: "invalid_request", message: "Invalid domain format" };
  }
  if (RESERVED_DOMAINS.includes(domain)) {
    return { ok: false, status: 400, code: "invalid_request", message: "Domain is reserved" };
  }

  const existing = getDomainByName(domain);
  if (existing) {
    return { ok: false, status: 409, code: "domain_taken", message: "Domain already registered" };
  }

  const id = `dom_${randomBytes(4).toString("hex")}`;
  const now = Date.now();
  insertDomain({ id, domain, owner_wallet: callerWallet, created_at: now, updated_at: now });

  const row = getDomainById(id);
  if (!row) throw new Error("Failed to retrieve domain after insert");

  return { ok: true, data: domainToResponse(row) };
}

export function listDomains(
  callerWallet: string,
  page: number,
  perPage: number,
): DomainListResponse {
  const offset = (page - 1) * perPage;
  const rows = getDomainsByOwner(callerWallet, perPage, offset);
  const total = countDomainsByOwner(callerWallet);
  return {
    domains: rows.map(domainToResponse),
    total,
    page,
    per_page: perPage,
  };
}

export function getDomain(
  id: string,
  callerWallet: string,
): ServiceResult<DomainResponse> {
  const row = getDomainById(id);
  if (!row || row.owner_wallet !== callerWallet) {
    return { ok: false, status: 404, code: "not_found", message: "Domain not found" };
  }
  return { ok: true, data: domainToResponse(row) };
}

export async function verifyDomain(
  id: string,
  callerWallet: string,
): Promise<ServiceResult<VerifyDomainResponse>> {
  const row = getDomainById(id);
  if (!row || row.owner_wallet !== callerWallet) {
    return { ok: false, status: 404, code: "not_found", message: "Domain not found" };
  }
  if (row.status === "active") {
    return { ok: false, status: 400, code: "already_verified", message: "Domain already verified" };
  }

  const dnsResult = await verifyDns(row.domain);

  updateDomainVerification(id, {
    mx_verified: dnsResult.mx.pass,
    spf_verified: dnsResult.spf.pass,
    dmarc_verified: dnsResult.dmarc.pass,
  });

  if (!dnsResult.allPass) {
    const results: VerificationResult[] = [
      { type: "MX", name: row.domain, expected: dnsResult.mx.expected, found: dnsResult.mx.found, pass: dnsResult.mx.pass },
      { type: "TXT", name: row.domain, expected: dnsResult.spf.expected, found: dnsResult.spf.found, pass: dnsResult.spf.pass },
      { type: "TXT", name: `_dmarc.${row.domain}`, expected: dnsResult.dmarc.expected, found: dnsResult.dmarc.found, pass: dnsResult.dmarc.pass },
    ];
    return {
      ok: true,
      data: {
        id: row.id,
        domain: row.domain,
        status: "pending",
        verified_at: null,
        verification_results: results,
      },
    };
  }

  // All DNS checks passed — provision in Stalwart
  try {
    await createDomainPrincipal(row.domain);
  } catch (err) {
    if (err instanceof StalwartError) {
      if (err.code !== "conflict") {
        return { ok: false, status: err.statusCode, code: err.code, message: err.message };
      }
      // Domain already exists in Stalwart — continue
    } else {
      throw err;
    }
  }

  try {
    await generateDkim(row.domain, "RSA");
    await generateDkim(row.domain, "Ed25519");
  } catch (err) {
    if (err instanceof StalwartError) {
      // Rollback domain principal on DKIM failure
      try { await deleteDomainPrincipal(row.domain); } catch { /* best effort */ }
      return { ok: false, status: err.statusCode, code: err.code, message: `DKIM generation failed: ${err.message}` };
    }
    throw err;
  }

  // Fetch DNS records from Stalwart to get DKIM public keys
  let dkimRsa: string | null = null;
  let dkimEd: string | null = null;
  const dkimRecords: DnsRecord[] = [];
  try {
    const records = await getDnsRecords(row.domain);
    for (const rec of records) {
      if (rec.type === "TXT" && rec.name.includes("_domainkey")) {
        if (rec.name.startsWith("rsa.") || rec.name.includes("rsa._domainkey")) {
          dkimRsa = rec.content;
          dkimRecords.push({ type: "TXT", name: rec.name, content: rec.content });
        } else if (rec.name.startsWith("ed.") || rec.name.includes("ed._domainkey")) {
          dkimEd = rec.content;
          dkimRecords.push({ type: "TXT", name: rec.name, content: rec.content });
        }
      }
    }
  } catch (err) {
    if (!(err instanceof StalwartError)) throw err;
    // Non-fatal — DKIM keys were generated, agent can check later
  }

  updateDomainProvisioned(id, { dkim_rsa_record: dkimRsa, dkim_ed_record: dkimEd });

  return {
    ok: true,
    data: {
      id: row.id,
      domain: row.domain,
      status: "active",
      verified_at: new Date().toISOString(),
      dkim_records: dkimRecords,
    },
  };
}

export async function deleteDomain(
  id: string,
  callerWallet: string,
): Promise<ServiceResult<DeleteDomainResponse>> {
  const row = getDomainById(id);
  if (!row || row.owner_wallet !== callerWallet) {
    return { ok: false, status: 404, code: "not_found", message: "Domain not found" };
  }

  if (row.stalwart_provisioned) {
    try {
      await deleteDomainPrincipal(row.domain);
    } catch (err) {
      if (err instanceof StalwartError && err.code !== "not_found") {
        return { ok: false, status: err.statusCode, code: err.code, message: err.message };
      }
      // not_found is fine — already cleaned up
    }
  }

  const mailboxCount = countMailboxesByDomain(row.domain);
  deleteDomainRow(id);

  const resp: DeleteDomainResponse = { id, deleted: true };
  if (mailboxCount > 0) {
    resp.warning = `${mailboxCount} active mailbox${mailboxCount > 1 ? "es" : ""} on this domain`;
  }
  return { ok: true, data: resp };
}
