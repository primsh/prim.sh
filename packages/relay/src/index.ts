import { Hono } from "hono";
import type {
  ApiError,
  CreateMailboxRequest,
  SendMessageRequest,
  MailboxResponse,
  MailboxListResponse,
  DeleteMailboxResponse,
  EmailListResponse,
  EmailDetail,
  SendMessageResponse,
} from "./api.ts";
import {
  createMailbox,
  listMailboxes,
  getMailbox,
  deleteMailbox,
  listMessages,
  getMessage,
  sendMessage,
} from "./service.ts";

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

// GET / — health check (free)
app.get("/", (c) => {
  return c.json({ service: "relay.sh", status: "ok" });
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

  const data = listMailboxes(caller, page, perPage);
  return c.json(data as MailboxListResponse, 200);
});

// GET /v1/mailboxes/:id — Get mailbox
app.get("/v1/mailboxes/:id", (c) => {
  const caller = c.get("walletAddress");
  if (!caller) return c.json(forbidden("No wallet address in payment"), 403);

  const result = getMailbox(c.req.param("id"), caller);
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
    if (result.code === "invalid_request") return c.json(invalidRequest(result.message), 400);
    return c.json(serviceError(result.code, result.message), result.status as 502);
  }
  return c.json(result.data as SendMessageResponse, 200);
});

export default app;
