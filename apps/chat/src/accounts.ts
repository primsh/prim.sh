// SPDX-License-Identifier: Apache-2.0
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { AccountRow } from "./db.ts";
import { getDb } from "./db.ts";

type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string };

interface Account {
  id: string;
  wallet_address: string;
  created_at: string;
}

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getEncryptionKey(): Buffer {
  const key = process.env.CHAT_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("CHAT_ENCRYPTION_KEY env var is required");
  }
  return Buffer.from(key, "hex");
}

function encryptPrivateKey(privateKey: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(privateKey, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: iv:authTag:ciphertext (all hex)
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptWalletKey(encryptedKey: string): string {
  const key = getEncryptionKey();
  const [ivHex, authTagHex, ciphertextHex] = encryptedKey.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext) + decipher.final("utf8");
}

export function createAccount(
  passkeyCredentialId: string,
  passkeyPublicKey: Uint8Array,
): ServiceResult<Account> {
  const db = getDb();

  const existing = db
    .query<AccountRow, [string]>("SELECT * FROM accounts WHERE passkey_credential_id = ?")
    .get(passkeyCredentialId) as AccountRow | null;

  if (existing) {
    return { ok: false, status: 409, code: "account_exists", message: "Account already exists" };
  }

  const privateKey = generatePrivateKey();
  const viemAccount = privateKeyToAccount(privateKey);
  const encryptedKey = encryptPrivateKey(privateKey);
  const now = new Date().toISOString();
  const id = `acct_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

  db.query(
    `INSERT INTO accounts (id, passkey_credential_id, passkey_public_key, wallet_address, encrypted_private_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    passkeyCredentialId,
    Buffer.from(passkeyPublicKey),
    viemAccount.address,
    encryptedKey,
    now,
  );

  return {
    ok: true,
    data: { id, wallet_address: viemAccount.address, created_at: now },
  };
}

export function getAccount(id: string): ServiceResult<Account> {
  const db = getDb();
  const row = db
    .query<AccountRow, [string]>("SELECT * FROM accounts WHERE id = ?")
    .get(id) as AccountRow | null;

  if (!row) {
    return { ok: false, status: 404, code: "not_found", message: "Account not found" };
  }

  return {
    ok: true,
    data: { id: row.id, wallet_address: row.wallet_address, created_at: row.created_at },
  };
}

export function getAccountByPasskey(credentialId: string): ServiceResult<AccountRow> {
  const db = getDb();
  const row = db
    .query<AccountRow, [string]>("SELECT * FROM accounts WHERE passkey_credential_id = ?")
    .get(credentialId) as AccountRow | null;

  if (!row) {
    return { ok: false, status: 404, code: "not_found", message: "Account not found" };
  }

  return { ok: true, data: row };
}
