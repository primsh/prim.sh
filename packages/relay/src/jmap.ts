/**
 * JMAP session discovery and bootstrap.
 * Discovers apiUrl, accountId, identityId, and mailbox folder IDs
 * for a given user via Basic auth against Stalwart's JMAP endpoint.
 */

export class JmapError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "JmapError";
  }
}

export interface JmapSession {
  apiUrl: string;
  accountId: string;
  identityId: string;
  inboxId: string;
  draftsId: string;
  sentId: string;
}

function getJmapBaseUrl(): string {
  return process.env.STALWART_JMAP_URL ?? "https://mail.relay.prim.sh";
}

export function buildBasicAuth(email: string, password: string): string {
  return `Basic ${Buffer.from(`${email}:${password}`).toString("base64")}`;
}

interface JmapSessionResponse {
  apiUrl: string;
  primaryAccounts?: Record<string, string>;
  accounts?: Record<string, { name: string }>;
}

interface JmapMailbox {
  id: string;
  role: string | null;
  name: string;
}

interface JmapIdentity {
  id: string;
  email: string;
  name: string;
}

interface JmapMethodResponse {
  methodResponses: [string, Record<string, unknown>, string][];
}

export async function discoverSession(
  authHeader: string,
  baseUrl?: string,
): Promise<JmapSession> {
  const jmapUrl = baseUrl ?? getJmapBaseUrl();

  // Step 1: GET /.well-known/jmap → apiUrl + accountId
  const sessionRes = await fetch(`${jmapUrl}/.well-known/jmap`, {
    headers: { Authorization: authHeader },
  });

  if (!sessionRes.ok) {
    throw new JmapError(
      sessionRes.status,
      sessionRes.status === 401 ? "forbidden" : "jmap_error",
      `JMAP session discovery failed: ${sessionRes.status}`,
    );
  }

  const session = (await sessionRes.json()) as JmapSessionResponse;
  const apiUrl = session.apiUrl;
  if (!apiUrl) {
    throw new JmapError(500, "jmap_error", "JMAP session response missing apiUrl");
  }

  const accountId = session.primaryAccounts?.["urn:ietf:params:jmap:mail"];
  if (!accountId) {
    throw new JmapError(500, "jmap_error", "JMAP session response missing mail accountId");
  }

  // Step 2: POST apiUrl with Mailbox/get + Identity/get
  const batchRes = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      using: [
        "urn:ietf:params:jmap:core",
        "urn:ietf:params:jmap:mail",
        "urn:ietf:params:jmap:submission",
      ],
      methodCalls: [
        ["Mailbox/get", { accountId, properties: ["id", "role", "name"] }, "mb"],
        ["Identity/get", { accountId }, "id"],
      ],
    }),
  });

  if (!batchRes.ok) {
    throw new JmapError(
      batchRes.status,
      "jmap_error",
      `JMAP batch request failed: ${batchRes.status}`,
    );
  }

  const batch = (await batchRes.json()) as JmapMethodResponse;

  // Extract mailbox IDs by role
  const mailboxResponse = batch.methodResponses.find(([name]) => name === "Mailbox/get");
  if (!mailboxResponse) {
    throw new JmapError(500, "jmap_error", "Mailbox/get response missing");
  }

  const mailboxes = (mailboxResponse[1].list ?? []) as JmapMailbox[];
  const inbox = mailboxes.find((m) => m.role === "inbox");
  if (!inbox) {
    throw new JmapError(500, "jmap_error", "Inbox mailbox not found");
  }

  const drafts = mailboxes.find((m) => m.role === "drafts");
  const sent = mailboxes.find((m) => m.role === "sent");

  // Extract identity
  const identityResponse = batch.methodResponses.find(([name]) => name === "Identity/get");
  if (!identityResponse) {
    throw new JmapError(500, "jmap_error", "Identity/get response missing");
  }

  const identities = (identityResponse[1].list ?? []) as JmapIdentity[];
  if (identities.length === 0) {
    throw new JmapError(500, "jmap_error", "No identities found for mailbox");
  }

  return {
    apiUrl,
    accountId,
    identityId: identities[0].id,
    inboxId: inbox.id,
    draftsId: drafts?.id ?? "",
    sentId: sent?.id ?? "",
  };
}
