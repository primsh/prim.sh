import { randomBytes, createHash } from "node:crypto";
import {
  insertMailbox,
  getMailboxById,
  getMailboxesByOwner,
  countMailboxesByOwner,
  deleteMailboxRow,
} from "./db.ts";
import {
  StalwartError,
  createPrincipal,
  deletePrincipal,
} from "./stalwart.ts";
import { encryptPassword } from "./crypto.ts";
import { discoverSession, buildBasicAuth, JmapError } from "./jmap.ts";
import type {
  ServiceResult,
  MailboxResponse,
  MailboxListResponse,
  CreateMailboxRequest,
  DeleteMailboxResponse,
} from "./api.ts";
import type { MailboxRow } from "./db.ts";

// ─── Constants ───────────────────────────────────────────────────────────

const DEFAULT_DOMAIN = process.env.RELAY_DEFAULT_DOMAIN ?? "relay.prim.sh";
const DEFAULT_TTL_MS = Number(process.env.RELAY_DEFAULT_TTL_MS) || 86_400_000; // 24h
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

  const password = generatePassword();
  const passwordHash = hashPassword(password);
  const passwordEnc = encryptPassword(password);
  const now = Date.now();
  const expiresAt = now + DEFAULT_TTL_MS;

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
): MailboxListResponse {
  const offset = (page - 1) * perPage;
  const rows = getMailboxesByOwner(callerWallet, perPage, offset);
  const total = countMailboxesByOwner(callerWallet);

  return {
    mailboxes: rows.map(rowToResponse),
    total,
    page,
    per_page: perPage,
  };
}

export function getMailbox(
  id: string,
  callerWallet: string,
): ServiceResult<MailboxResponse> {
  const check = checkOwnership(id, callerWallet);
  if (!check.ok) return check;
  return { ok: true, data: rowToResponse(check.row) };
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
