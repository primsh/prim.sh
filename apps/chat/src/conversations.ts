// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from "node:crypto";
import type { ConversationRow, MessageRow } from "./db.ts";
import { getDb } from "./db.ts";

type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string };

interface Conversation {
  id: string;
  account_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface Message {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  tool_calls: unknown[] | null;
  created_at: string;
}

export function createConversation(accountId: string, title?: string): ServiceResult<Conversation> {
  const db = getDb();
  const now = new Date().toISOString();
  const id = `conv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

  db.query(
    `INSERT INTO conversations (id, account_id, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, accountId, title ?? "New conversation", now, now);

  return {
    ok: true,
    data: {
      id,
      account_id: accountId,
      title: title ?? "New conversation",
      created_at: now,
      updated_at: now,
    },
  };
}

export function getConversations(accountId: string): ServiceResult<Conversation[]> {
  const db = getDb();
  const rows = db
    .query<ConversationRow, [string]>(
      "SELECT * FROM conversations WHERE account_id = ? ORDER BY updated_at DESC",
    )
    .all(accountId) as ConversationRow[];

  return { ok: true, data: rows };
}

export function getMessages(conversationId: string): ServiceResult<Message[]> {
  const db = getDb();
  const rows = db
    .query<MessageRow, [string]>(
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
    )
    .all(conversationId) as MessageRow[];

  const messages: Message[] = rows.map((row) => ({
    id: row.id,
    conversation_id: row.conversation_id,
    role: row.role,
    content: row.content,
    tool_calls: row.tool_calls ? (JSON.parse(row.tool_calls) as unknown[]) : null,
    created_at: row.created_at,
  }));

  return { ok: true, data: messages };
}

export function addMessage(
  conversationId: string,
  role: "user" | "assistant" | "tool",
  content: string,
  toolCalls?: unknown[],
): ServiceResult<Message> {
  const db = getDb();
  const now = new Date().toISOString();
  const id = `msg_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const toolCallsJson = toolCalls ? JSON.stringify(toolCalls) : null;

  db.query(
    `INSERT INTO messages (id, conversation_id, role, content, tool_calls, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, conversationId, role, content, toolCallsJson, now);

  // Update conversation's updated_at
  db.query("UPDATE conversations SET updated_at = ? WHERE id = ?").run(now, conversationId);

  return {
    ok: true,
    data: {
      id,
      conversation_id: conversationId,
      role,
      content,
      tool_calls: toolCalls ?? null,
      created_at: now,
    },
  };
}
