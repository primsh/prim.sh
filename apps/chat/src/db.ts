// SPDX-License-Identifier: Apache-2.0
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";

export interface AccountRow {
  id: string;
  passkey_credential_id: string;
  passkey_public_key: Buffer;
  wallet_address: string;
  encrypted_private_key: string;
  created_at: string;
}

export interface ConversationRow {
  id: string;
  account_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  tool_calls: string | null;
  created_at: string;
}

let _db: Database | null = null;

export function getDb(): Database {
  if (_db) return _db;

  const dataDir = join(process.env.PRIM_HOME ?? join(homedir(), ".prim"), "data");
  mkdirSync(dataDir, { recursive: true });
  const dbPath = process.env.CHAT_DB_PATH ?? join(dataDir, "chat.db");
  _db = new Database(dbPath);

  _db.run(`
    CREATE TABLE IF NOT EXISTS accounts (
      id                    TEXT PRIMARY KEY,
      passkey_credential_id TEXT NOT NULL UNIQUE,
      passkey_public_key    BLOB NOT NULL,
      wallet_address        TEXT NOT NULL,
      encrypted_private_key TEXT NOT NULL,
      created_at            TEXT NOT NULL
    )
  `);

  _db.run(
    "CREATE INDEX IF NOT EXISTS idx_accounts_passkey ON accounts(passkey_credential_id)",
  );

  _db.run(`
    CREATE TABLE IF NOT EXISTS conversations (
      id         TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id),
      title      TEXT NOT NULL DEFAULT 'New conversation',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  _db.run(
    "CREATE INDEX IF NOT EXISTS idx_conversations_account ON conversations(account_id)",
  );

  _db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id              TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id),
      role            TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'tool')),
      content         TEXT NOT NULL,
      tool_calls      TEXT,
      created_at      TEXT NOT NULL
    )
  `);

  _db.run(
    "CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id)",
  );

  return _db;
}

export function resetDb(): void {
  _db = null;
}
