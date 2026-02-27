import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createAgentStackMiddleware, createWalletAllowlistChecker, getNetworkConfig, metricsMiddleware, metricsHandler, requestIdMiddleware, parsePaginationParams } from "@primsh/x402-middleware";
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

const LLMS_TXT = `# email.prim.sh — API Reference

> Email infrastructure for AI agents. Create mailboxes, send and receive email, webhooks for incoming mail.

Base URL: https://email.prim.sh
Auth: x402 payment protocol (USDC on Base)
Payment: Every non-free request returns 402 with payment requirements. Sign the payment and resend.

## Quick Start

1. POST /v1/mailboxes with empty body {} → get a mailbox address
2. Send email to that address from any mail client
3. GET /v1/mailboxes/{id}/messages → read received mail
4. POST /v1/mailboxes/{id}/send → send mail from your mailbox

## Authentication

All paid endpoints use x402. The flow:
1. Send your request → get 402 response with payment requirements in headers
2. Sign a USDC payment for the specified amount
3. Resend request with X-PAYMENT header containing the signed payment

Free endpoints (no payment required): GET /, GET /llms.txt

## Endpoints

### POST /v1/mailboxes — Create mailbox ($0.05)

Request body (all fields optional):
  username  string   Custom local part. Auto-generated if omitted.
  domain    string   Default: email.prim.sh
  ttl_ms    number   Mailbox lifetime in ms. Permanent if omitted.

Response 201:
  id          string        Mailbox ID (use in all subsequent calls)
  address     string        Full email address (e.g. abc123@email.prim.sh)
  username    string        Local part
  domain      string        Domain
  status      string        "active"
  created_at  string        ISO 8601
  expires_at  string|null   ISO 8601 or null if permanent

Example:
  POST /v1/mailboxes
  Content-Type: application/json
  {"username": "my-agent"}
  → 201 {"id": "mbx_...", "address": "my-agent@email.prim.sh", ...}

### GET /v1/mailboxes — List mailboxes ($0.001)

Response 200:
  mailboxes   MailboxResponse[]
  total       number
  page        number
  per_page    number

### GET /v1/mailboxes/:id — Get mailbox ($0.001)

Response 200: MailboxResponse

### DELETE /v1/mailboxes/:id — Delete mailbox ($0.01)

Response 200: {"id": "...", "deleted": true}

### POST /v1/mailboxes/:id/renew — Renew expiring mailbox ($0.01)

Request body:
  ttl_ms  number  New lifetime in ms from now

### GET /v1/mailboxes/:id/messages — List messages ($0.001)

Query params:
  limit   number  Default 50, max 100
  offset  number  Default 0

Response 200:
  messages  EmailMessage[]
  total     number
  position  number

EmailMessage shape:
  id             string
  from           {name: string|null, email: string}
  to             {name: string|null, email: string}[]
  subject        string
  receivedAt     string (ISO 8601)
  size           number (bytes)
  hasAttachment  boolean
  preview        string (first ~256 chars)

### GET /v1/mailboxes/:id/messages/:msgId — Get full message ($0.001)

Response 200: EmailMessage + {cc, textBody, htmlBody}

### POST /v1/mailboxes/:id/send — Send email ($0.01)

Request body:
  to       string   Recipient address (required)
  subject  string   Subject line (required)
  body     string   Plain text body
  html     string   HTML body
  cc       string   CC address
  bcc      string   BCC address

Response 200: {"message_id": "...", "status": "sent"}

### POST /v1/mailboxes/:id/webhooks — Register webhook ($0.01)

Request body:
  url      string    Webhook delivery URL (required)
  secret   string    HMAC signing secret (optional, auto-generated if omitted)
  events   string[]  Event types to subscribe to (default: ["message.received"])

Response 201: {"id": "...", "url": "...", "events": [...], "status": "active", "created_at": "..."}

### GET /v1/mailboxes/:id/webhooks — List webhooks ($0.001)

Response 200: {"webhooks": [...], "total": number}

### DELETE /v1/mailboxes/:id/webhooks/:whId — Delete webhook ($0.001)

Response 200: {"id": "...", "deleted": true}

### POST /v1/domains — Register custom domain ($0.05)

Request body:
  domain  string  Your domain name (required)

Response 201: DomainResponse with required_records (DNS records to add)

### GET /v1/domains — List domains ($0.001)
### GET /v1/domains/:id — Get domain ($0.001)
### POST /v1/domains/:id/verify — Verify domain DNS ($0.01)
### DELETE /v1/domains/:id — Delete domain ($0.01)

## Error Format

All errors return:
  {"error": {"code": "error_code", "message": "Human-readable message"}}

Error codes: not_found, forbidden, invalid_request, stalwart_error, conflict, username_taken, jmap_error, expired

## Ownership

All resources are scoped to the wallet address that paid to create them. Your wallet address is extracted from the x402 payment. You can only access mailboxes, messages, webhooks, and domains you created.
`;

const networkConfig = getNetworkConfig();
const PAY_TO_ADDRESS = process.env.PRIM_PAY_TO ?? "0x0000000000000000000000000000000000000000";
const NETWORK = networkConfig.network;
const WALLET_INTERNAL_URL = process.env.WALLET_INTERNAL_URL ?? "http://127.0.0.1:3001";
const checkAllowlist = createWalletAllowlistChecker(WALLET_INTERNAL_URL);

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

app.use("*", requestIdMiddleware());

app.use("*", bodyLimit({
  maxSize: 1024 * 1024,
  onError: (c) => c.json({ error: "Request too large" }, 413),
}));

app.use("*", metricsMiddleware());

app.use(
  "*",
  createAgentStackMiddleware(
    {
      payTo: PAY_TO_ADDRESS,
      network: NETWORK,
      freeRoutes: ["GET /", "GET /pricing", "GET /llms.txt", "POST /internal/hooks/ingest", "GET /v1/metrics"],
      checkAllowlist,
    },
    { ...EMAIL_ROUTES },
  ),
);

// GET / — health check (free)
app.get("/", (c) => {
  return c.json({ service: "email.sh", status: "ok" });
});

// GET /pricing — machine-readable pricing (free)
app.get("/pricing", (c) => {
  return c.json({
    service: "email.prim.sh",
    currency: "USDC",
    network: "eip155:8453",
    routes: [
      { method: "POST", path: "/v1/mailboxes", price_usdc: "0.05", description: "Create mailbox" },
      { method: "GET", path: "/v1/mailboxes", price_usdc: "0.001", description: "List mailboxes" },
      { method: "GET", path: "/v1/mailboxes/{id}", price_usdc: "0.001", description: "Get mailbox" },
      { method: "DELETE", path: "/v1/mailboxes/{id}", price_usdc: "0.01", description: "Delete mailbox" },
      { method: "POST", path: "/v1/mailboxes/{id}/renew", price_usdc: "0.01", description: "Renew mailbox" },
      { method: "GET", path: "/v1/mailboxes/{id}/messages", price_usdc: "0.001", description: "List messages" },
      { method: "GET", path: "/v1/mailboxes/{id}/messages/{msgId}", price_usdc: "0.001", description: "Get message" },
      { method: "POST", path: "/v1/mailboxes/{id}/send", price_usdc: "0.01", description: "Send email" },
      { method: "POST", path: "/v1/mailboxes/{id}/webhooks", price_usdc: "0.01", description: "Register webhook" },
      { method: "GET", path: "/v1/mailboxes/{id}/webhooks", price_usdc: "0.001", description: "List webhooks" },
      { method: "DELETE", path: "/v1/mailboxes/{id}/webhooks/{whId}", price_usdc: "0.001", description: "Delete webhook" },
      { method: "POST", path: "/v1/domains", price_usdc: "0.05", description: "Register custom domain" },
      { method: "GET", path: "/v1/domains", price_usdc: "0.001", description: "List domains" },
      { method: "GET", path: "/v1/domains/{id}", price_usdc: "0.001", description: "Get domain" },
      { method: "POST", path: "/v1/domains/{id}/verify", price_usdc: "0.01", description: "Verify domain DNS" },
      { method: "DELETE", path: "/v1/domains/{id}", price_usdc: "0.01", description: "Delete domain" },
    ],
  });
});

// GET /llms.txt — machine-readable API reference (free)
app.get("/llms.txt", (c) => {
  c.header("Content-Type", "text/plain; charset=utf-8");
  return c.body(LLMS_TXT);
});

// GET /v1/metrics — operational metrics (free)
app.get("/v1/metrics", metricsHandler("email.prim.sh"));

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

  const { limit, page } = parsePaginationParams(c.req.query());
  const includeExpired = c.req.query("include_expired") === "true";

  const data = listMailboxes(caller, page, limit, includeExpired);
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

  const { limit, cursor } = parsePaginationParams(c.req.query());
  const position = cursor ? Math.max(Number(cursor), 0) : Math.max(Number(c.req.query("position")) || 0, 0);
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

  const { limit, page } = parsePaginationParams(c.req.query());

  const data = listDomains(caller, page, limit);
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
