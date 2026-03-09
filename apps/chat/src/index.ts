// SPDX-License-Identifier: Apache-2.0
import { getUsdcBalance } from "@primsh/wallet/balance";
import { Hono } from "hono";
import type { Address } from "viem";
import { streamChat } from "./agent.ts";
import { getAccount } from "./accounts.ts";
import { getSessionAccountId, registerAuthRoutes } from "./auth.ts";
import { createConversation, getConversations, getMessages } from "./conversations.ts";

const app = new Hono();

// Health check
app.get("/health", (c) => c.json({ service: "chat", status: "ok" }));

// Auth routes
registerAuthRoutes(app);

// GET /api/conversations
app.get("/api/conversations", (c) => {
  const accountId = getSessionAccountId(c);
  if (!accountId) {
    return c.json({ error: { code: "unauthorized", message: "Not authenticated" } }, 401);
  }

  const result = getConversations(accountId);
  if (!result.ok) {
    return c.json({ error: { code: result.code, message: result.message } }, result.status as 500);
  }
  return c.json({ conversations: result.data });
});

// POST /api/conversations
app.post("/api/conversations", async (c) => {
  const accountId = getSessionAccountId(c);
  if (!accountId) {
    return c.json({ error: { code: "unauthorized", message: "Not authenticated" } }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const title = (body as { title?: string }).title;
  const result = createConversation(accountId, title);
  if (!result.ok) {
    return c.json({ error: { code: result.code, message: result.message } }, result.status as 500);
  }
  return c.json({ conversation: result.data }, 201);
});

// GET /api/conversations/:id/messages
app.get("/api/conversations/:id/messages", (c) => {
  const accountId = getSessionAccountId(c);
  if (!accountId) {
    return c.json({ error: { code: "unauthorized", message: "Not authenticated" } }, 401);
  }

  const result = getMessages(c.req.param("id"));
  if (!result.ok) {
    return c.json({ error: { code: result.code, message: result.message } }, result.status as 500);
  }
  return c.json({ messages: result.data });
});

// POST /api/chat — agent runtime with streaming
app.post("/api/chat", async (c) => {
  const accountId = getSessionAccountId(c);
  if (!accountId) {
    return c.json({ error: { code: "unauthorized", message: "Not authenticated" } }, 401);
  }

  const body = await c.req.json().catch(() => null);
  if (!body || typeof (body as { message?: string }).message !== "string") {
    return c.json({ error: { code: "invalid_request", message: "message is required" } }, 400);
  }

  const { message, conversation_id } = body as { message: string; conversation_id?: string };

  // Create conversation if none provided
  let convId = conversation_id;
  if (!convId) {
    const convResult = createConversation(accountId, message.slice(0, 50));
    if (!convResult.ok) {
      return c.json({ error: { code: convResult.code, message: convResult.message } }, 500);
    }
    convId = convResult.data.id;
  }

  const result = await streamChat({
    accountId,
    conversationId: convId,
    userMessage: message,
  });

  if (!result.ok) {
    return c.json({ error: { code: result.code, message: result.message } }, result.status as 500);
  }

  return new Response(result.data, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Conversation-Id": convId,
    },
  });
});

// GET /api/balance
app.get("/api/balance", async (c) => {
  const accountId = getSessionAccountId(c);
  if (!accountId) {
    return c.json({ error: { code: "unauthorized", message: "Not authenticated" } }, 401);
  }

  const accountResult = getAccount(accountId);
  if (!accountResult.ok) {
    return c.json(
      { error: { code: accountResult.code, message: accountResult.message } },
      accountResult.status as 404,
    );
  }

  const { balance } = await getUsdcBalance(accountResult.data.wallet_address as Address);

  return c.json({
    wallet_address: accountResult.data.wallet_address,
    balance_usdc: balance,
  });
});

export default app;
