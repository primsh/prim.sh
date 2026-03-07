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

  const primFetch = createPrimFetch({
    privateKey,
    maxPayment: "0.50",
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

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Send conversation ID first
      controller.enqueue(
        encoder.encode(sseEvent({ type: "conversation_id", data: conversationId })),
      );

      try {
        const result = streamText({
          model,
          system: SYSTEM_PROMPT,
          messages,
          tools,
          stopWhen: stepCountIs(20),
          onChunk: ({ chunk }) => {
            if (chunk.type === "text-delta") {
              controller.enqueue(encoder.encode(sseEvent({ type: "token", data: chunk.text })));
            } else if (chunk.type === "tool-call") {
              controller.enqueue(
                encoder.encode(
                  sseEvent({
                    type: "tool_start",
                    data: { name: chunk.toolName, id: chunk.toolCallId },
                  }),
                ),
              );
            } else if (chunk.type === "tool-result") {
              controller.enqueue(
                encoder.encode(sseEvent({ type: "tool_end", data: { id: chunk.toolCallId } })),
              );
            }
          },
          onFinish: ({ text }) => {
            if (text) {
              addMessage(conversationId, "assistant", text);
            }
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          },
          onError: ({ error }) => {
            const message = error instanceof Error ? error.message : String(error);
            controller.enqueue(encoder.encode(sseEvent({ type: "error", data: message })));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          },
        });

        // Consume the stream to drive callbacks
        for await (const _ of result.textStream) {
          // Callbacks handle emission; we just need to drain the stream
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        controller.enqueue(encoder.encode(sseEvent({ type: "error", data: message })));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return { ok: true, data: stream };
}
