// SPDX-License-Identifier: Apache-2.0
import type { ServiceResult } from "@primsh/x402-middleware";
import { decryptPassword } from "./crypto.ts";
import { getMailboxById, updateMailboxJmap } from "./db.ts";
import { JmapError, buildBasicAuth, discoverSession } from "./jmap.ts";

export interface JmapContext {
  apiUrl: string;
  accountId: string;
  identityId: string;
  inboxId: string;
  draftsId: string;
  sentId: string;
  authHeader: string;
  address: string;
}

export async function getJmapContext(
  mailboxId: string,
  callerWallet: string,
): Promise<ServiceResult<JmapContext>> {
  const row = getMailboxById(mailboxId);
  if (!row || row.owner_wallet !== callerWallet) {
    return { ok: false, status: 404, code: "not_found", message: "Mailbox not found" };
  }

  if (!row.password_enc) {
    return {
      ok: false,
      status: 500,
      code: "internal_error",
      message: "Mailbox missing encrypted credentials",
    };
  }

  let password: string;
  try {
    password = decryptPassword(row.password_enc);
  } catch {
    return {
      ok: false,
      status: 500,
      code: "internal_error",
      message: "Failed to decrypt mailbox credentials",
    };
  }

  const authHeader = buildBasicAuth(row.stalwart_name, password);

  // Return cached session data if available
  if (row.jmap_api_url && row.jmap_account_id && row.jmap_identity_id && row.jmap_inbox_id) {
    return {
      ok: true,
      data: {
        apiUrl: row.jmap_api_url,
        accountId: row.jmap_account_id,
        identityId: row.jmap_identity_id,
        inboxId: row.jmap_inbox_id,
        draftsId: row.jmap_drafts_id ?? "",
        sentId: row.jmap_sent_id ?? "",
        authHeader,
        address: row.address,
      },
    };
  }

  // Discover and cache
  try {
    const session = await discoverSession(authHeader);

    updateMailboxJmap(mailboxId, {
      jmap_api_url: session.apiUrl,
      jmap_account_id: session.accountId,
      jmap_identity_id: session.identityId,
      jmap_inbox_id: session.inboxId,
      jmap_drafts_id: session.draftsId,
      jmap_sent_id: session.sentId,
    });

    return {
      ok: true,
      data: { ...session, authHeader, address: row.address },
    };
  } catch (err) {
    if (err instanceof JmapError) {
      return { ok: false, status: err.statusCode, code: err.code, message: err.message };
    }
    throw err;
  }
}
