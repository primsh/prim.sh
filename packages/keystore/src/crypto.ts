import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from "node:crypto";
import { keccak256 } from "viem";
import type { V3CryptoParams } from "./types.ts";

/**
 * Scrypt N parameter. Set PRIM_SCRYPT_N=1024 in tests for speed.
 * Production default: 131072 (V3 standard).
 */
function getScryptN(): number {
  const envN = process.env.PRIM_SCRYPT_N;
  if (envN) return Number.parseInt(envN, 10);
  return 131072;
}

function deriveKey(password: string, salt: Buffer, n: number): Buffer {
  return scryptSync(password, salt, 32, { N: n, r: 8, p: 1 }) as Buffer;
}

function computeMac(dkSlice: Buffer, ciphertext: Buffer): string {
  const combined = Buffer.concat([dkSlice, ciphertext]);
  // Buffer extends Uint8Array; keccak256 accepts Uint8Array directly
  const mac = keccak256(combined as Uint8Array);
  return mac.slice(2); // strip "0x"
}

/**
 * Encrypts a private key to V3 keystore crypto params.
 * Uses scrypt KDF + AES-128-CTR cipher + keccak-256 MAC.
 */
export function encryptToV3(privateKey: `0x${string}`, password: string): V3CryptoParams {
  const n = getScryptN();
  const salt = randomBytes(32);
  const iv = randomBytes(16);
  const dk = deriveKey(password, salt, n);
  const cipherKey = dk.slice(0, 16);
  const privateKeyBytes = Buffer.from(privateKey.slice(2), "hex");

  const cipher = createCipheriv("aes-128-ctr", cipherKey, iv);
  const ciphertext = Buffer.concat([cipher.update(privateKeyBytes), cipher.final()]);
  const mac = computeMac(dk.slice(16, 32), ciphertext);

  return {
    cipher: "aes-128-ctr",
    cipherparams: { iv: iv.toString("hex") },
    ciphertext: ciphertext.toString("hex"),
    kdf: "scrypt",
    kdfparams: { n, r: 8, p: 1, dklen: 32, salt: salt.toString("hex") },
    mac,
  };
}

/**
 * Decrypts V3 keystore crypto params back to a private key.
 * Verifies MAC before decryption; throws on wrong password.
 */
export function decryptFromV3(crypto: V3CryptoParams, password: string): `0x${string}` {
  const { kdfparams, cipherparams, ciphertext, mac } = crypto;
  const salt = Buffer.from(kdfparams.salt, "hex");
  const dk = deriveKey(password, salt, kdfparams.n);

  const ciphertextBuf = Buffer.from(ciphertext, "hex");
  const expectedMac = computeMac(dk.slice(16, 32), ciphertextBuf);
  if (expectedMac !== mac) {
    throw new Error("Decryption failed: MAC mismatch (wrong password?)");
  }

  const cipherKey = dk.slice(0, 16);
  const iv = Buffer.from(cipherparams.iv, "hex");
  const decipher = createDecipheriv("aes-128-ctr", cipherKey, iv);
  const privateKeyBytes = Buffer.concat([decipher.update(ciphertextBuf), decipher.final()]);

  return `0x${privateKeyBytes.toString("hex")}` as `0x${string}`;
}
