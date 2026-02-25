import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";

interface EncryptedKeyBlob {
  version: 1;
  iv: string;
  tag: string;
  ciphertext: string;
}

export function getMasterKey(): Buffer {
  const keyFile = process.env.WALLET_MASTER_KEY_FILE;

  if (keyFile !== undefined) {
    let fileContents: string;
    try {
      fileContents = readFileSync(keyFile, "utf8").trim();
    } catch {
      throw new Error(`Master key file not found: ${keyFile}`);
    }
    const buf = Buffer.from(fileContents, "hex");
    if (buf.length !== 32) {
      throw new Error(`Master key file must contain 64 hex chars (32 bytes), got ${buf.length} bytes`);
    }
    return buf;
  }

  const keyHex = process.env.WALLET_MASTER_KEY;
  if (!keyHex) {
    throw new Error("No master key configured: set WALLET_MASTER_KEY or WALLET_MASTER_KEY_FILE");
  }

  const buf = Buffer.from(keyHex, "hex");
  if (buf.length !== 32) {
    throw new Error(`WALLET_MASTER_KEY must be 64 hex chars (32 bytes), got ${buf.length} bytes`);
  }
  return buf;
}

export function encryptPrivateKey(privateKey: Hex): string {
  const masterKey = getMasterKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey, iv);

  const plaintext = Buffer.from(privateKey, "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  const blob: EncryptedKeyBlob = {
    version: 1,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: encrypted.toString("base64"),
  };

  return JSON.stringify(blob);
}

export function decryptPrivateKey(blobJson: string): Hex {
  const masterKey = getMasterKey();
  const blob = JSON.parse(blobJson) as EncryptedKeyBlob;

  const iv = Buffer.from(blob.iv, "base64");
  const tag = Buffer.from(blob.tag, "base64");
  const ciphertext = Buffer.from(blob.ciphertext, "base64");

  const decipher = createDecipheriv("aes-256-gcm", masterKey, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8") as Hex;
}

export function generateWallet(): { address: Address; privateKey: Hex } {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return { address: account.address, privateKey };
}
