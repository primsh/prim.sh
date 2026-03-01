// SPDX-License-Identifier: Apache-2.0
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { http, createPublicClient, createWalletClient } from "viem";
import type { Account, Chain, Hex, Transport, WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";

interface EncryptedKeyBlob {
  version: 1;
  iv: string;
  tag: string;
  ciphertext: string;
}

export function getMasterKey(): Buffer {
  const keyHex = process.env.TOKEN_MASTER_KEY ?? "";
  if (!keyHex) {
    throw new Error("TOKEN_MASTER_KEY is required (64 hex chars / 32 bytes)");
  }

  const buf = Buffer.from(keyHex, "hex");
  if (buf.length !== 32) {
    throw new Error(`TOKEN_MASTER_KEY must be 64 hex chars (32 bytes), got ${buf.length} bytes`);
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

/** Returns the configured viem chain. BASE_CHAIN_ID=84532 → Base Sepolia, default 8453 → Base mainnet. */
export function getChain(): Chain {
  const chainId = Number(process.env.BASE_CHAIN_ID ?? "8453");
  if (chainId === 84532) return baseSepolia;
  if (chainId === 8453) return base;
  throw new Error(
    `Unsupported BASE_CHAIN_ID: ${chainId}. Supported: 8453 (Base), 84532 (Base Sepolia)`,
  );
}

/**
 * Assert that the RPC's reported chain ID matches our configured chain.
 * Call before any write tx to catch mismatched BASE_RPC_URL / BASE_CHAIN_ID early.
 */
export async function assertChainId(
  publicClient: ReturnType<typeof createPublicClient>,
): Promise<void> {
  const expectedId = getChain().id;
  const actualId = await publicClient.getChainId();
  if (actualId !== expectedId) {
    throw new Error(
      `Chain ID mismatch: RPC reports ${actualId}, configured BASE_CHAIN_ID=${expectedId}. Check BASE_RPC_URL and BASE_CHAIN_ID env vars.`,
    );
  }
}

export function getDeployerClient(): WalletClient<Transport, Chain, Account> {
  const encryptedKey = process.env.TOKEN_DEPLOYER_ENCRYPTED_KEY;
  if (!encryptedKey) {
    throw new Error("TOKEN_DEPLOYER_ENCRYPTED_KEY is required");
  }

  const privateKey = decryptPrivateKey(encryptedKey);
  const rpcUrl = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";
  const chain = getChain();

  return createWalletClient({
    account: privateKeyToAccount(privateKey),
    chain,
    transport: http(rpcUrl),
  });
}

export function getPublicClient() {
  const rpcUrl = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";
  const chain = getChain();
  return createPublicClient({ chain, transport: http(rpcUrl) });
}
