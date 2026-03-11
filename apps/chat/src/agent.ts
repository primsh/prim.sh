// SPDX-License-Identifier: Apache-2.0
// Agent runtime: orchestrates LLM calls + tool execution via Vercel AI SDK.
// Emits custom SSE events: token, tool_start, tool_end, conversation_id, error
import { stepCountIs, streamText } from "ai";
import type { Hex } from "viem";
import { createPrimFetch } from "@primsh/x402-client";
import { decryptWalletKey } from "./accounts.ts";
import { addMessage } from "./conversations.ts";
import type { AccountRow } from "./db.ts";
import { getDb } from "./db.ts";
import { createInferModel } from "./provider.ts";
import { createPrimTools } from "./tools.ts";

const SYSTEM_PROMPT = `You are Prim, an AI assistant that helps users build and manage internet infrastructure.

You have access to real infrastructure primitives that you can use on behalf of the user:

**Available primitives:**
- **spawn** — Create, manage, and delete VPS servers (Hetzner)
- **search** — Search the web
- **store** — Object storage (upload, download files)
- **email** — Create mailboxes, send and read emails
- **domain** — Register DNS zones, create records, verify propagation
- **wallet** — Check USDC and ETH balances

Each tool call costs a small amount of USDC (typically $0.001-$0.01) paid from the user's wallet.

**Guidelines:**
- Be concise and direct
- When the user asks you to do something, use the tools — don't just describe what you would do
- Confirm destructive actions (deleting servers, etc.) before proceeding
- Report costs when performing paid operations
- If a tool call fails, explain the error and suggest alternatives`;

type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string };

interface StreamChatOptions {
  accountId: string;
  conversationId: string;
  userMessage: string;
}

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

/**
 * Stream a chat response for a conversation.
 * Returns a ReadableStream of custom SSE events for the frontend.
 */
export async function streamChat(
  options: StreamChatOptions,
): Promise<ServiceResult<ReadableStream<Uint8Array>>> {
  const { accountId, conversationId, userMessage } = options;

  const db = getDb();
  const account = db
    .query<AccountRow, [string]>("SELECT * FROM accounts WHERE id = ?")
    .get(accountId) as AccountRow | null;

  if (!account) {
    return { ok: false, status: 404, code: "not_found", message: "Account not found" };
  }

  const privateKey = decryptWalletKey(account.encrypted_private_key) as Hex;

  const t0 = Date.now();

  const primFetch = createPrimFetch({
    privateKey,
    maxPayment: "0.50",
    onPayment: ({ amount, route }) => {
      const elapsed = Date.now() - t0;
      console.log(`[chat] payment: ${amount} USDC → ${route} (${elapsed}ms into request)`);
    },
  });

  const model = createInferModel(primFetch);
  const tools = createPrimTools(primFetch);

  addMessage(conversationId, "user", userMessage);

  const historyRows = db
    .query<{ role: string; content: string; tool_calls: string | null }, [string]>(
      "SELECT role, content, tool_calls FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
    )
    .all(conversationId) as Array<{ role: string; content: string; tool_calls: string | null }>;

  const messages: Array<{ role: "user" | "assistant"; content: string }> = historyRows
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  const encoder = new TextEncoder();

  // Use TransformStream so the readable side is returned immediately.
  // Bun buffers ReadableStream chunks until start() resolves, which
  // defeats SSE streaming when start() is long-running.
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  // Kick off streaming in the background — don't await
  (async () => {
    try {
      await writer.write(
        encoder.encode(sseEvent({ type: "conversation_id", data: conversationId })),
      );
      await writer.write(encoder.encode(sseEvent({ type: "status", data: "Thinking..." })));

      console.log(
        `[chat] conv=${conversationId} user="${userMessage.slice(0, 60)}" starting streamText`,
      );
      const streamStart = Date.now();
      let firstChunkLogged = false;

      const result = streamText({
        model,
        system: SYSTEM_PROMPT,
        messages,
        tools,
        stopWhen: stepCountIs(20),
        onChunk: ({ chunk }) => {
          if (chunk.type === "reasoning-delta" || chunk.type === "text-delta") {
            if (!firstChunkLogged) {
              firstChunkLogged = true;
              const ttfb = Date.now() - streamStart;
              console.log(`[chat] conv=${conversationId} first_chunk=${chunk.type} ttfb=${ttfb}ms`);
            }
          }
          if (chunk.type === "reasoning-delta") {
            writer.write(encoder.encode(sseEvent({ type: "reasoning", data: chunk.text })));
          } else if (chunk.type === "text-delta") {
            writer.write(encoder.encode(sseEvent({ type: "token", data: chunk.text })));
          } else if (chunk.type === "tool-call") {
            writer.write(
              encoder.encode(
                sseEvent({
                  type: "tool_start",
                  data: { name: chunk.toolName, id: chunk.toolCallId },
                }),
              ),
            );
          } else if (chunk.type === "tool-result") {
            writer.write(
              encoder.encode(sseEvent({ type: "tool_end", data: { id: chunk.toolCallId } })),
            );
          }
        },
        onFinish: async ({ text }) => {
          const totalMs = Date.now() - streamStart;
          console.log(
            `[chat] conv=${conversationId} done total=${totalMs}ms text_len=${text?.length ?? 0}`,
          );
          if (text) {
            addMessage(conversationId, "assistant", text);
          }
          await writer.write(encoder.encode("data: [DONE]\n\n"));
          await writer.close();
        },
        onError: async ({ error }) => {
          const message = error instanceof Error ? error.message : String(error);
          await writer.write(encoder.encode(sseEvent({ type: "error", data: message })));
          await writer.write(encoder.encode("data: [DONE]\n\n"));
          await writer.close();
        },
      });

      // Consume the stream to drive callbacks
      for await (const _ of result.textStream) {
        // Callbacks handle emission; we just need to drain the stream
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      try {
        await writer.write(encoder.encode(sseEvent({ type: "error", data: message })));
        await writer.write(encoder.encode("data: [DONE]\n\n"));
        await writer.close();
      } catch {
        // Writer may already be closed
      }
    }
  })();

  return { ok: true, data: readable };
}
