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
  return process.env.STALWART_JMAP_URL ?? "https://mail.email.prim.sh";
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

// ─── Email query types (R-5) ──────────────────────────────────────────

export interface JmapEmailAddress {
  name: string | null;
  email: string;
}

export interface JmapEmail {
  id: string;
  from: JmapEmailAddress[];
  to: JmapEmailAddress[];
  subject: string;
  receivedAt: string;
  size: number;
  hasAttachment: boolean;
  preview: string;
}

export interface JmapEmailDetail extends JmapEmail {
  cc: JmapEmailAddress[];
  textBody: { partId: string }[];
  htmlBody: { partId: string }[];
  bodyValues: Record<string, { value: string }>;
}

export interface QueryOpts {
  mailboxId?: string;
  limit: number;
  position: number;
}

export interface QueryResult {
  messages: JmapEmail[];
  total: number;
  position: number;
}

export async function discoverSession(
  authHeader: string,
  baseUrl?: string,
): Promise<JmapSession> {
  const jmapUrl = baseUrl ?? getJmapBaseUrl();

  // Step 1: GET /.well-known/jmap → follow redirect manually (auth header is
  // stripped on 3xx by some runtimes). If we get a redirect, re-request with auth.
  let sessionRes = await fetch(`${jmapUrl}/.well-known/jmap`, {
    headers: { Authorization: authHeader },
    redirect: "manual",
  });

  if (sessionRes.status >= 300 && sessionRes.status < 400) {
    const location = sessionRes.headers.get("location");
    if (location) {
      const redirectUrl = location.startsWith("http") ? location : `${jmapUrl}${location}`;
      sessionRes = await fetch(redirectUrl, {
        headers: { Authorization: authHeader },
      });
    }
  }

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

// ─── Email query/get (R-5) ────────────────────────────────────────────

interface JmapContextLike {
  apiUrl: string;
  accountId: string;
  authHeader: string;
}

async function jmapCall(
  ctx: JmapContextLike,
  methodCalls: unknown[],
  extraNamespaces?: string[],
): Promise<JmapMethodResponse> {
  const using = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"];
  if (extraNamespaces) {
    using.push(...extraNamespaces);
  }

  const res = await fetch(ctx.apiUrl, {
    method: "POST",
    headers: {
      Authorization: ctx.authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ using, methodCalls }),
  });

  if (!res.ok) {
    throw new JmapError(
      res.status,
      res.status === 401 ? "forbidden" : "jmap_error",
      `JMAP request failed: ${res.status}`,
    );
  }

  return (await res.json()) as JmapMethodResponse;
}

function checkMethodError(response: [string, Record<string, unknown>, string]): void {
  if (response[0] === "error") {
    const detail = response[1];
    throw new JmapError(
      500,
      "jmap_error",
      `JMAP method error: ${detail.type ?? "unknown"}`,
    );
  }
}

export async function queryEmails(
  ctx: JmapContextLike,
  opts: QueryOpts,
): Promise<QueryResult> {
  const filter: Record<string, string> = {};
  if (opts.mailboxId) {
    filter.inMailbox = opts.mailboxId;
  }

  const batch = await jmapCall(ctx, [
    [
      "Email/query",
      {
        accountId: ctx.accountId,
        filter,
        sort: [{ property: "receivedAt", isAscending: false }],
        limit: opts.limit,
        position: opts.position,
        calculateTotal: true,
      },
      "q",
    ],
    [
      "Email/get",
      {
        accountId: ctx.accountId,
        "#ids": { resultOf: "q", name: "Email/query", path: "/ids" },
        properties: [
          "id",
          "from",
          "to",
          "subject",
          "receivedAt",
          "size",
          "hasAttachment",
          "preview",
        ],
      },
      "e",
    ],
  ]);

  // Check for error responses first (JMAP returns "error" as method name on failure)
  for (const response of batch.methodResponses) {
    checkMethodError(response);
  }

  const queryResponse = batch.methodResponses.find(([name]) => name === "Email/query");
  if (!queryResponse) {
    throw new JmapError(500, "jmap_error", "Email/query response missing");
  }

  const getResponse = batch.methodResponses.find(([name]) => name === "Email/get");
  if (!getResponse) {
    throw new JmapError(500, "jmap_error", "Email/get response missing");
  }

  const total = (queryResponse[1].total as number) ?? 0;
  const position = (queryResponse[1].position as number) ?? 0;
  const messages = ((getResponse[1].list ?? []) as JmapEmail[]).map((m) => ({
    id: m.id,
    from: m.from ?? [],
    to: m.to ?? [],
    subject: m.subject ?? "",
    receivedAt: m.receivedAt ?? "",
    size: m.size ?? 0,
    hasAttachment: m.hasAttachment ?? false,
    preview: m.preview ?? "",
  }));

  return { messages, total, position };
}

export async function getEmail(
  ctx: JmapContextLike,
  emailId: string,
): Promise<JmapEmailDetail> {
  const batch = await jmapCall(ctx, [
    [
      "Email/get",
      {
        accountId: ctx.accountId,
        ids: [emailId],
        properties: [
          "id",
          "from",
          "to",
          "cc",
          "subject",
          "receivedAt",
          "size",
          "hasAttachment",
          "preview",
          "textBody",
          "htmlBody",
          "bodyValues",
        ],
        fetchAllBodyValues: true,
      },
      "e",
    ],
  ]);

  for (const response of batch.methodResponses) {
    checkMethodError(response);
  }

  const getResponse = batch.methodResponses.find(([name]) => name === "Email/get");
  if (!getResponse) {
    throw new JmapError(500, "jmap_error", "Email/get response missing");
  }

  const notFound = (getResponse[1].notFound as string[]) ?? [];
  if (notFound.includes(emailId)) {
    throw new JmapError(404, "not_found", "Message not found");
  }

  const list = (getResponse[1].list ?? []) as JmapEmailDetail[];
  if (list.length === 0) {
    throw new JmapError(404, "not_found", "Message not found");
  }

  return list[0];
}

// ─── Email send (R-6) ─────────────────────────────────────────────────

export interface SendEmailOpts {
  from: { name: string | null; email: string };
  to: { name: string | null; email: string }[];
  cc?: { name: string | null; email: string }[];
  bcc?: { name: string | null; email: string }[];
  subject: string;
  textBody: string | null;
  htmlBody: string | null;
  identityId: string;
  draftsId: string;
}

export interface SendResult {
  messageId: string;
  submissionId: string;
}

export async function sendEmail(
  ctx: JmapContextLike,
  opts: SendEmailOpts,
): Promise<SendResult> {
  // Build bodyStructure + bodyValues based on provided parts
  let bodyStructure: Record<string, unknown>;
  const bodyValues: Record<string, { value: string; isEncodingProblem?: boolean; isTruncated?: boolean }> = {};

  const hasText = opts.textBody !== null;
  const hasHtml = opts.htmlBody !== null;

  if (hasText && hasHtml) {
    bodyValues.text = { value: opts.textBody as string };
    bodyValues.html = { value: opts.htmlBody as string };
    bodyStructure = {
      type: "multipart/alternative",
      subParts: [
        { type: "text/plain", partId: "text" },
        { type: "text/html", partId: "html" },
      ],
    };
  } else if (hasHtml) {
    bodyValues.html = { value: opts.htmlBody as string };
    bodyStructure = { type: "text/html", partId: "html" };
  } else {
    bodyValues.text = { value: opts.textBody as string };
    bodyStructure = { type: "text/plain", partId: "text" };
  }

  // Build recipient arrays for envelope
  const allRecipients = [
    ...opts.to,
    ...(opts.cc ?? []),
    ...(opts.bcc ?? []),
  ];

  const batch = await jmapCall(
    ctx,
    [
      [
        "Email/set",
        {
          accountId: ctx.accountId,
          create: {
            draft: {
              mailboxIds: opts.draftsId ? { [opts.draftsId]: true } : {},
              from: [opts.from],
              to: opts.to,
              ...(opts.cc?.length ? { cc: opts.cc } : {}),
              ...(opts.bcc?.length ? { bcc: opts.bcc } : {}),
              subject: opts.subject,
              bodyStructure,
              bodyValues,
            },
          },
        },
        "e",
      ],
      [
        "EmailSubmission/set",
        {
          accountId: ctx.accountId,
          create: {
            sub: {
              identityId: opts.identityId,
              emailId: "#draft",
              envelope: {
                mailFrom: { email: opts.from.email },
                rcptTo: allRecipients.map((r) => ({ email: r.email })),
              },
            },
          },
        },
        "es",
      ],
    ],
    ["urn:ietf:params:jmap:submission"],
  );

  // Check for method-level errors
  for (const response of batch.methodResponses) {
    checkMethodError(response);
  }

  // Check Email/set result
  const emailSetResponse = batch.methodResponses.find(([name]) => name === "Email/set");
  if (!emailSetResponse) {
    throw new JmapError(500, "jmap_error", "Email/set response missing");
  }

  const emailNotCreated = emailSetResponse[1].notCreated as Record<string, { type: string; description?: string }> | undefined;
  if (emailNotCreated?.draft) {
    const reason = emailNotCreated.draft.description ?? emailNotCreated.draft.type;
    throw new JmapError(400, "invalid_request", `Email creation failed: ${reason}`);
  }

  const emailCreated = emailSetResponse[1].created as Record<string, { id: string }> | undefined;
  if (!emailCreated?.draft) {
    throw new JmapError(500, "jmap_error", "Email/set did not return created draft");
  }

  // Check EmailSubmission/set result
  const subResponse = batch.methodResponses.find(([name]) => name === "EmailSubmission/set");
  if (!subResponse) {
    throw new JmapError(500, "jmap_error", "EmailSubmission/set response missing");
  }

  const subNotCreated = subResponse[1].notCreated as Record<string, { type: string; description?: string }> | undefined;
  if (subNotCreated?.sub) {
    const reason = subNotCreated.sub.description ?? subNotCreated.sub.type;
    throw new JmapError(502, "jmap_error", `Email submission failed: ${reason}`);
  }

  const subCreated = subResponse[1].created as Record<string, { id: string }> | undefined;
  if (!subCreated?.sub) {
    throw new JmapError(500, "jmap_error", "EmailSubmission/set did not return created submission");
  }

  return {
    messageId: emailCreated.draft.id,
    submissionId: subCreated.sub.id,
  };
}
