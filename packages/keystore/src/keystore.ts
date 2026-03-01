// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { getAddress } from "viem";
import type { LocalAccount } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { getDefaultAddress, setDefaultAddress } from "./config.ts";
import { decryptFromV3, encryptToV3 } from "./crypto.ts";
import { getOrCreateDeviceKey } from "./device.ts";
import { getKeyPath, getKeysDir, getPrimDir } from "./paths.ts";
import type { KeyInfo, KeystoreFile } from "./types.ts";

/**
 * Resolve the V3 "password" for a keystore file based on prim.kdfInput.
 *
 * Decision table:
 * | kdfInput      | passphrase provided | password used                    |
 * |---------------|---------------------|----------------------------------|
 * | "device"      | no                  | hex(device.key)                  |
 * | "device"      | yes                 | error: device-encrypted key      |
 * | "passphrase"  | no                  | error: passphrase required       |
 * | "passphrase"  | yes                 | the passphrase                   |
 * | missing (V3)  | no                  | error: passphrase required       |
 * | missing (V3)  | yes                 | the passphrase                   |
 */
function resolvePassword(keystoreFile: KeystoreFile, passphrase?: string): string {
  const kdfInput = keystoreFile.prim?.kdfInput;

  if (kdfInput === "device") {
    if (passphrase !== undefined) {
      throw new Error("This key uses device encryption, not a passphrase");
    }
    return getOrCreateDeviceKey();
  }

  if (kdfInput === "passphrase") {
    if (passphrase === undefined) {
      throw new Error("Passphrase required for this key");
    }
    return passphrase;
  }

  // No prim block: imported V3 from geth/foundry/MetaMask — always passphrase
  if (passphrase === undefined) {
    throw new Error("Passphrase required for this key");
  }
  return passphrase;
}

function readKeystoreFile(address: string): KeystoreFile {
  const keyPath = getKeyPath(address);
  if (!existsSync(keyPath)) {
    throw new Error(`Key not found: ${address}`);
  }
  return JSON.parse(readFileSync(keyPath, "utf-8")) as KeystoreFile;
}

function saveKeystoreFile(address: string, file: KeystoreFile): void {
  mkdirSync(getKeysDir(), { recursive: true });
  writeFileSync(getKeyPath(address), JSON.stringify(file, null, 2), "utf-8");
}

/** Generate a new secp256k1 key, encrypt, and store at ~/.prim/keys/<address>.json */
export async function createKey(opts?: {
  label?: string;
  passphrase?: string;
}): Promise<{ address: string }> {
  const privateKey = generatePrivateKey();
  return importKey(privateKey, opts);
}

/**
 * Import an existing private key into the keystore.
 * Encrypts with device secret by default; use passphrase option for passphrase mode.
 */
export async function importKey(
  privateKey: `0x${string}`,
  opts?: { label?: string; passphrase?: string },
): Promise<{ address: string }> {
  const account = privateKeyToAccount(privateKey);
  const address = account.address; // EIP-55 checksum

  const kdfInput = opts?.passphrase !== undefined ? "passphrase" : "device";
  const password =
    kdfInput === "passphrase" ? (opts?.passphrase as string) : getOrCreateDeviceKey();
  const cryptoParams = encryptToV3(privateKey, password);

  const keystoreFile: KeystoreFile = {
    version: 3,
    id: randomUUID(),
    address: address.slice(2).toLowerCase(), // V3 standard: no 0x, lowercase
    crypto: cryptoParams,
    prim: {
      kdfInput,
      createdAt: new Date().toISOString(),
      ...(opts?.label ? { label: opts.label } : {}),
    },
  };

  saveKeystoreFile(address, keystoreFile);

  // Auto-set as default if this is the first key
  const keys = await listKeys();
  if (keys.length === 1) {
    await setDefaultAddress(address);
  }

  return { address };
}

/**
 * Load and decrypt a private key.
 *
 * Address resolution order:
 * 1. address param provided → use it (throw if not found)
 * 2. no address, default_wallet set → use default (throw if file missing)
 * 3. no address, no default, exactly 1 key → use it
 * 4. no address, no default, 0 or 2+ keys → throw
 */
export async function loadKey(
  address?: string,
  opts?: { passphrase?: string },
): Promise<`0x${string}`> {
  const resolvedAddress = await resolveAddress(address);
  const keystoreFile = readKeystoreFile(resolvedAddress);
  const password = resolvePassword(keystoreFile, opts?.passphrase);
  return decryptFromV3(keystoreFile.crypto, password);
}

/** Load a private key and return it as a viem LocalAccount (ready for signing). */
export async function loadAccount(
  address?: string,
  opts?: { passphrase?: string },
): Promise<LocalAccount> {
  const privateKey = await loadKey(address, opts);
  return privateKeyToAccount(privateKey);
}

async function resolveAddress(address?: string): Promise<string> {
  if (address !== undefined) {
    const checksumAddr = getAddress(address);
    if (!existsSync(getKeyPath(checksumAddr))) {
      throw new Error(`Key not found: ${address}`);
    }
    return checksumAddr;
  }

  const defaultAddr = await getDefaultAddress();
  const keys = await listKeys();

  if (defaultAddr !== null) {
    if (!existsSync(getKeyPath(defaultAddr))) {
      throw new Error("Default key not found");
    }
    return defaultAddr;
  }

  if (keys.length === 1 && keys[0]) {
    return keys[0].address;
  }

  throw new Error("No default wallet. Run: prim wallet list");
}

/** List all stored keys (address + label + createdAt, no secrets). */
export async function listKeys(): Promise<KeyInfo[]> {
  const keysDir = getKeysDir();
  if (!existsSync(keysDir)) return [];

  const defaultAddr = await getDefaultAddress();
  const files = readdirSync(keysDir).filter((f) => f.endsWith(".json"));

  return files.map((filename) => {
    const address = filename.slice(0, -5); // strip .json
    const keystoreFile = JSON.parse(readFileSync(getKeyPath(address), "utf-8")) as KeystoreFile;

    return {
      address,
      label: keystoreFile.prim?.label,
      createdAt: keystoreFile.prim?.createdAt ?? "unknown",
      isDefault: address === defaultAddr,
    };
  });
}

/** Decrypt and return the private key in plaintext. */
export async function exportKey(
  address: string,
  opts?: { passphrase?: string },
): Promise<`0x${string}`> {
  return loadKey(address, opts);
}

/** Delete a key file from disk. */
export async function removeKey(address: string): Promise<void> {
  const checksumAddr = getAddress(address);
  const keyPath = getKeyPath(checksumAddr);
  if (!existsSync(keyPath)) {
    throw new Error(`Key not found: ${address}`);
  }
  unlinkSync(keyPath);
}
