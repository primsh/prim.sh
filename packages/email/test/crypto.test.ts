import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptPassword, encryptPassword, getEncryptionKey } from "../src/crypto";

const TEST_KEY = randomBytes(32).toString("hex");

describe("crypto", () => {
  beforeEach(() => {
    process.env.EMAIL_ENCRYPTION_KEY = TEST_KEY;
  });

  afterEach(() => {
    process.env.EMAIL_ENCRYPTION_KEY = undefined;
  });

  it("encrypts and decrypts roundtrip", () => {
    const plaintext = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2";
    const encrypted = encryptPassword(plaintext);
    const decrypted = decryptPassword(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertexts for same plaintext (unique IV)", () => {
    const plaintext = "same-password-twice";
    const enc1 = encryptPassword(plaintext);
    const enc2 = encryptPassword(plaintext);
    expect(enc1).not.toBe(enc2);

    // Both decrypt to the same value
    expect(decryptPassword(enc1)).toBe(plaintext);
    expect(decryptPassword(enc2)).toBe(plaintext);
  });

  it("throws on tampered ciphertext", () => {
    const encrypted = encryptPassword("test-password");
    const parts = encrypted.split(":");
    // XOR first byte of ciphertext to guarantee it's different
    const firstByte = Number.parseInt(parts[1].slice(0, 2), 16);
    const flipped = (firstByte ^ 0x01).toString(16).padStart(2, "0");
    const tampered = `${parts[0]}:${flipped}${parts[1].slice(2)}:${parts[2]}`;
    expect(() => decryptPassword(tampered)).toThrow();
  });

  it("throws on invalid format", () => {
    expect(() => decryptPassword("not-valid")).toThrow("Invalid encrypted password format");
  });

  it("throws when EMAIL_ENCRYPTION_KEY is missing", () => {
    process.env.EMAIL_ENCRYPTION_KEY = "";
    expect(() => getEncryptionKey()).toThrow(
      "EMAIL_ENCRYPTION_KEY environment variable is required",
    );
  });

  it("throws when EMAIL_ENCRYPTION_KEY is wrong length", () => {
    process.env.EMAIL_ENCRYPTION_KEY = "abcd";
    expect(() => getEncryptionKey()).toThrow("must be 64 hex characters");
  });
});
