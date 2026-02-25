import { Hono } from "hono";
import { createAgentStackMiddleware, getNetworkConfig } from "@primsh/x402-middleware";
import type {
  ApiError,
  CreateMailboxRequest,
  RenewMailboxRequest,
  SendMessageRequest,
  RegisterWebhookRequest,
  RegisterDomainRequest,
  MailboxResponse,
  MailboxListResponse,
  DeleteMailboxResponse,
  EmailListResponse,
  EmailDetail,
  SendMessageResponse,
  WebhookResponse,
  WebhookListResponse,
  DeleteWebhookResponse,
  DomainResponse,
  DomainListResponse,
  DeleteDomainResponse,
  VerifyDomainResponse,
} from "./api.ts";
import {
  createMailbox,
  listMailboxes,
  getMailbox,
  deleteMailbox,
  listMessages,
  getMessage,
  sendMessage,
  renewMailbox,
  registerWebhook,
  listWebhooks,
  deleteWebhook,
  handleIngestEvent,
  registerDomain,
  listDomains,
  getDomain,
  verifyDomain,
  deleteDomain,
} from "./service.ts";

const networkConfig = getNetworkConfig();
const PAY_TO_ADDRESS = process.env.PRIM_PAY_TO ?? "0x0000000000000000000000000000000000000000";
const NETWORK = networkConfig.network;

const EMAIL_ROUTES = {
  "POST /v1/mailboxes": "$0.05",
  "GET /v1/mailboxes": "$0.001",
  "GET /v1/mailboxes/[id]": "$0.001",
  "DELETE /v1/mailboxes/[id]": "$0.01",
  "POST /v1/mailboxes/[id]/renew": "$0.01",
  "GET /v1/mailboxes/[id]/messages": "$0.001",
  "GET /v1/mailboxes/[id]/messages/[msgId]": "$0.001",
  "POST /v1/mailboxes/[id]/send": "$0.01",
  "POST /v1/mailboxes/[id]/webhooks": "$0.01",
  "GET /v1/mailboxes/[id]/webhooks": "$0.001",
  "DELETE /v1/mailboxes/[id]/webhooks/[whId]": "$0.001",
  "POST /v1/domains": "$0.05",
  "GET /v1/domains": "$0.001",
  "GET /v1/domains/[id]": "$0.001",
  "POST /v1/domains/[id]/verify": "$0.01",
  "DELETE /v1/domains/[id]": "$0.01",
} as const;

function forbidden(message: string): ApiError {
  return { error: { code: "forbidden", message } };
}

function notFound(message: string): ApiError {
  return { error: { code: "not_found", message } };
}

function invalidRequest(message: string): ApiError {
  return { error: { code: "invalid_request", message } };
}

function stalwartError(message: string): ApiError {
  return { error: { code: "stalwart_error", message } };
}

function serviceError(code: string, message: string): ApiError {
  return { error: { code, message } };
}

type AppVariables = { walletAddress: string | undefined };
const app = new Hono<{ Variables: AppVariables }>();

app.use(
  "*",
  createAgentStackMiddleware(
    {
      payTo: PAY_TO_ADDRESS,
      network: NETWORK,
      freeRoutes: ["GET /", "POST /internal/hooks/ingest"],
    },
    { ...EMAIL_ROUTES },
  ),
);

// GET / — health check (free)
app.get("/", (c) => {
  return c.json({ service: "email.sh", status: "ok" });
});

// POST /v1/mailboxes — Create mailbox
app.post("/v1/mailboxes", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  let body: CreateMailboxRequest;
  try {
    body = await c.req.json<CreateMailboxRequest>();
  } catch {
    body = {};
  }

  const result = await createMailbox(body, caller);
  if (!result.ok) {
    if (result.code === "invalid_request") return c.json(invalidRequest(result.message), 400);
    if (result.code === "username_taken") return c.json(serviceError("username_taken", result.message), 409);
    if (result.code === "conflict") return c.json(stalwartError(result.message), 500);
    return c.json(stalwartError(result.message), result.status as 502);
  }
  return c.json(result.data as MailboxResponse, 201);
});

// GET /v1/mailboxes — List mailboxes
app.get("/v1/mailboxes", (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const perPage = Math.min(Number(c.req.query("per_page")) || 25, 100);
  const page = Math.max(Number(c.req.query("page")) || 1, 1);
  const includeExpired = c.req.query("include_expired") === "true";

  const data = listMailboxes(caller, page, perPage, includeExpired);
  return c.json(data as MailboxListResponse, 200);
});

// GET /v1/mailboxes/:id — Get mailbox
app.get("/v1/mailboxes/:id", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = await getMailbox(c.req.param("id"), caller);
  if (!result.ok) return c.json(notFound(result.message), 404);
  return c.json(result.data as MailboxResponse, 200);
});

// DELETE /v1/mailboxes/:id — Delete mailbox
app.delete("/v1/mailboxes/:id", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = await deleteMailbox(c.req.param("id"), caller);
  if (!result.ok) {
    if (result.status === 404) return c.json(notFound(result.message), 404);
    return c.json(stalwartError(result.message), result.status as 502);
  }
  return c.json(result.data as DeleteMailboxResponse, 200);
});

// POST /v1/mailboxes/:id/renew — Renew mailbox TTL
app.post("/v1/mailboxes/:id/renew", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  let body: RenewMailboxRequest;
  try {
    body = await c.req.json<RenewMailboxRequest>();
  } catch {
    body = {};
  }

  const result = await renewMailbox(c.req.param("id"), caller, body);
  if (!result.ok) {
    if (result.code === "not_found") return c.json(notFound(result.message), 404);
    if (result.code === "expired") return c.json(serviceError("expired", result.message), 410);
    if (result.code === "invalid_request") return c.json(invalidRequest(result.message), 400);
    return c.json(serviceError(result.code, result.message), result.status as 502);
  }
  return c.json(result.data as MailboxResponse, 200);
});

// GET /v1/mailboxes/:id/messages — List messages
app.get("/v1/mailboxes/:id/messages", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const limit = Math.min(Math.max(Number(c.req.query("limit")) || 20, 1), 100);
  const position = Math.max(Number(c.req.query("position")) || 0, 0);
  const folder = (c.req.query("folder") ?? "inbox") as "inbox" | "drafts" | "sent" | "all";
  if (!["inbox", "drafts", "sent", "all"].includes(folder)) {
    return c.json(invalidRequest("folder must be inbox, drafts, sent, or all"), 400);
  }

  const result = await listMessages(c.req.param("id"), caller, { limit, position, folder });
  if (!result.ok) {
    if (result.code === "not_found") return c.json(notFound(result.message), 404);
    if (result.code === "expired") return c.json(serviceError("expired", result.message), 410);
    return c.json(serviceError(result.code, result.message), result.status as 502);
  }
  return c.json(result.data as EmailListResponse, 200);
});

// GET /v1/mailboxes/:id/messages/:msgId — Get single message
app.get("/v1/mailboxes/:id/messages/:msgId", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = await getMessage(c.req.param("id"), caller, c.req.param("msgId"));
  if (!result.ok) {
    if (result.code === "not_found") return c.json(notFound(result.message), 404);
    if (result.code === "expired") return c.json(serviceError("expired", result.message), 410);
    return c.json(serviceError(result.code, result.message), result.status as 502);
  }
  return c.json(result.data as EmailDetail, 200);
});

// POST /v1/mailboxes/:id/send — Send message
app.post("/v1/mailboxes/:id/send", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  let body: SendMessageRequest;
  try {
    body = await c.req.json<SendMessageRequest>();
  } catch {
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await sendMessage(c.req.param("id"), caller, body);
  if (!result.ok) {
    if (result.code === "not_found") return c.json(notFound(result.message), 404);
    if (result.code === "expired") return c.json(serviceError("expired", result.message), 410);
    if (result.code === "invalid_request") return c.json(invalidRequest(result.message), 400);
    return c.json(serviceError(result.code, result.message), result.status as 502);
  }
  return c.json(result.data as SendMessageResponse, 200);
});

// POST /v1/mailboxes/:id/webhooks — Register webhook
app.post("/v1/mailboxes/:id/webhooks", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  let body: RegisterWebhookRequest;
  try {
    body = await c.req.json<RegisterWebhookRequest>();
  } catch {
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await registerWebhook(c.req.param("id"), caller, body);
  if (!result.ok) {
    if (result.code === "not_found") return c.json(notFound(result.message), 404);
    if (result.code === "invalid_request") return c.json(invalidRequest(result.message), 400);
    return c.json(serviceError(result.code, result.message), result.status as 502);
  }
  return c.json(result.data as WebhookResponse, 201);
});

// GET /v1/mailboxes/:id/webhooks — List webhooks
app.get("/v1/mailboxes/:id/webhooks", (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = listWebhooks(c.req.param("id"), caller);
  if (!result.ok) {
    if (result.code === "not_found") return c.json(notFound(result.message), 404);
    return c.json(serviceError(result.code, result.message), result.status as 502);
  }
  return c.json(result.data as WebhookListResponse, 200);
});

// DELETE /v1/mailboxes/:id/webhooks/:whId — Delete webhook
app.delete("/v1/mailboxes/:id/webhooks/:whId", (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = deleteWebhook(c.req.param("id"), caller, c.req.param("whId"));
  if (!result.ok) {
    if (result.code === "not_found") return c.json(notFound(result.message), 404);
    return c.json(serviceError(result.code, result.message), result.status as 502);
  }
  return c.json(result.data as DeleteWebhookResponse, 200);
});

// POST /v1/domains — Register custom domain
app.post("/v1/domains", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  let body: RegisterDomainRequest;
  try {
    body = await c.req.json<RegisterDomainRequest>();
  } catch {
    return c.json(invalidRequest("Invalid JSON body"), 400);
  }

  const result = await registerDomain(body, caller);
  if (!result.ok) {
    if (result.code === "invalid_request") return c.json(invalidRequest(result.message), 400);
    if (result.code === "domain_taken") return c.json(serviceError("domain_taken", result.message), 409);
    return c.json(serviceError(result.code, result.message), result.status as 502);
  }
  return c.json(result.data as DomainResponse, 201);
});

// GET /v1/domains — List caller's domains
app.get("/v1/domains", (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const perPage = Math.min(Number(c.req.query("per_page")) || 25, 100);
  const page = Math.max(Number(c.req.query("page")) || 1, 1);

  const data = listDomains(caller, page, perPage);
  return c.json(data as DomainListResponse, 200);
});

// GET /v1/domains/:id — Get domain details
app.get("/v1/domains/:id", (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = getDomain(c.req.param("id"), caller);
  if (!result.ok) return c.json(notFound(result.message), 404);
  return c.json(result.data as DomainResponse, 200);
});

// POST /v1/domains/:id/verify — Verify DNS and provision
app.post("/v1/domains/:id/verify", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = await verifyDomain(c.req.param("id"), caller);
  if (!result.ok) {
    if (result.code === "not_found") return c.json(notFound(result.message), 404);
    if (result.code === "already_verified") return c.json(invalidRequest(result.message), 400);
    return c.json(serviceError(result.code, result.message), result.status as 502);
  }
  return c.json(result.data as VerifyDomainResponse, 200);
});

// DELETE /v1/domains/:id — Delete custom domain
app.delete("/v1/domains/:id", async (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = await deleteDomain(c.req.param("id"), caller);
  if (!result.ok) {
    if (result.code === "not_found") return c.json(notFound(result.message), 404);
    return c.json(serviceError(result.code, result.message), result.status as 502);
  }
  return c.json(result.data as DeleteDomainResponse, 200);
});

// POST /internal/hooks/ingest — Stalwart webhook ingest (not x402-gated)
app.post("/internal/hooks/ingest", async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header("X-Signature") ?? null;

  const result = await handleIngestEvent(rawBody, signature);
  if (!result.ok) {
    return c.json(serviceError(result.code, result.message), result.status as 401);
  }
  return c.json(result.data, 200);
});

export default app;
