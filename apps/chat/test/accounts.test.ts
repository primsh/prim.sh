// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.CHAT_ENCRYPTION_KEY = "a".repeat(64);
  process.env.CHAT_SESSION_SECRET = "test-secret-for-signing-sessions";
  process.env.CHAT_DB_PATH = ":memory:";
});

import { createAccount, decryptWalletKey, getAccount, getAccountByPasskey } from "../src/accounts.ts";
import { resetDb } from "../src/db.ts";

describe("accounts", () => {
  beforeEach(() => {
    resetDb();
  });

  afterEach(() => {
    resetDb();
  });

  it("createAccount generates wallet and stores encrypted key", () => {
    const result = createAccount("cred_123", new Uint8Array([1, 2, 3]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.id).toMatch(/^acct_/);
    expect(result.data.wallet_address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(result.data.created_at).toBeTruthy();
  });

  it("createAccount returns different wallets for different credentials", () => {
    const r1 = createAccount("cred_1", new Uint8Array([1]));
    const r2 = createAccount("cred_2", new Uint8Array([2]));
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.data.wallet_address).not.toBe(r2.data.wallet_address);
  });

  it("createAccount rejects duplicate passkey credential", () => {
    createAccount("cred_dup", new Uint8Array([1]));
    const result = createAccount("cred_dup", new Uint8Array([2]));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(409);
    expect(result.code).toBe("account_exists");
  });

  it("getAccount retrieves created account", () => {
    const created = createAccount("cred_get", new Uint8Array([1]));
    if (!created.ok) throw new Error("setup failed");

    const result = getAccount(created.data.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.id).toBe(created.data.id);
    expect(result.data.wallet_address).toBe(created.data.wallet_address);
  });

  it("getAccount returns 404 for unknown id", () => {
    const result = getAccount("acct_nonexistent");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(404);
  });

  it("getAccountByPasskey retrieves account by credential id", () => {
    const created = createAccount("cred_lookup", new Uint8Array([5, 6]));
    if (!created.ok) throw new Error("setup failed");

    const result = getAccountByPasskey("cred_lookup");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.id).toBe(created.data.id);
    expect(result.data.passkey_credential_id).toBe("cred_lookup");
  });

  it("getAccountByPasskey returns 404 for unknown credential", () => {
    const result = getAccountByPasskey("cred_unknown");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(404);
  });

  it("decryptWalletKey roundtrips with encrypted key from createAccount", () => {
    const created = createAccount("cred_decrypt", new Uint8Array([1]));
    if (!created.ok) throw new Error("setup failed");

    const account = getAccountByPasskey("cred_decrypt");
    if (!account.ok) throw new Error("lookup failed");

    const decrypted = decryptWalletKey(account.data.encrypted_private_key);
    expect(decrypted).toMatch(/^0x[a-fA-F0-9]{64}$/);
  });

  it("decryptWalletKey fails with wrong encryption key", () => {
    const created = createAccount("cred_wrongkey", new Uint8Array([1]));
    if (!created.ok) throw new Error("setup failed");

    const account = getAccountByPasskey("cred_wrongkey");
    if (!account.ok) throw new Error("lookup failed");

    const original = process.env.CHAT_ENCRYPTION_KEY;
    process.env.CHAT_ENCRYPTION_KEY = "b".repeat(64);
    expect(() => decryptWalletKey(account.data.encrypted_private_key)).toThrow();
    process.env.CHAT_ENCRYPTION_KEY = original;
  });
});
