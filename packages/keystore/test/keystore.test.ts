/**
 * @prim/keystore tests.
 *
 * All tests use PRIM_HOME env override → isolated temp dir, never touches real ~/.prim/.
 * PRIM_SCRYPT_N=1024 keeps scrypt fast for test runs.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks for balance tests ───────────────────────────────────────────────────

const mockReadContract = vi.fn();
vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({ readContract: mockReadContract })),
  };
});

vi.mock("@agentstack/x402-middleware", () => ({
  getNetworkConfig: vi.fn(() => ({
    network: "eip155:84532",
    chainId: 84532,
    rpcUrl: "https://sepolia.base.org",
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  })),
}));
import { mkdirSync, rmSync, existsSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createKey,
  importKey,
  loadKey,
  loadAccount,
  listKeys,
  exportKey,
  removeKey,
} from "../src/keystore.ts";
import { getUsdcBalance } from "../src/balance.ts";
import { getDefaultAddress, setDefaultAddress, getConfig } from "../src/config.ts";
import { getDeviceKeyPath } from "../src/paths.ts";

// Known test key (Hardhat account #0)
const TEST_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`;
const TEST_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

let primHome: string;

beforeEach(() => {
  primHome = join(tmpdir(), `prim-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  process.env.PRIM_HOME = primHome;
  process.env.PRIM_SCRYPT_N = "1024";
  mkdirSync(primHome, { recursive: true });
});

afterEach(() => {
  rmSync(primHome, { recursive: true, force: true });
  // biome-ignore lint/performance/noDelete: env vars must be absent, not the string "undefined"
  delete process.env.PRIM_HOME;
  // biome-ignore lint/performance/noDelete: env vars must be absent, not the string "undefined"
  delete process.env.PRIM_SCRYPT_N;
});

// ── Device key ────────────────────────────────────────────────────────────────

describe("device key", () => {
  it("creates device.key on first access", async () => {
    await createKey();
    const deviceKeyPath = getDeviceKeyPath();
    expect(existsSync(deviceKeyPath)).toBe(true);
    const bytes = readFileSync(deviceKeyPath);
    expect(bytes.length).toBe(32);
  });

  it("reuses existing device.key on subsequent calls", async () => {
    const { address: addr1 } = await createKey({ label: "first" });
    const deviceKeyPath = getDeviceKeyPath();
    const firstMtime = statSync(deviceKeyPath).mtimeMs;

    await createKey({ label: "second" });
    const secondMtime = statSync(deviceKeyPath).mtimeMs;
    expect(secondMtime).toBe(firstMtime);

    // Both keys are accessible with the same device key
    const key1 = await loadKey(addr1);
    expect(key1).toMatch(/^0x[0-9a-f]{64}$/i);
  });

  it("device.key has mode 0o600", async () => {
    await createKey();
    const deviceKeyPath = getDeviceKeyPath();
    const mode = statSync(deviceKeyPath).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});

// ── Key lifecycle ─────────────────────────────────────────────────────────────

describe("key lifecycle", () => {
  it("createKey generates valid address and stores encrypted file", async () => {
    const { address } = await createKey();
    expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    const keyPath = join(primHome, "keys", `${address}.json`);
    expect(existsSync(keyPath)).toBe(true);
  });

  it("createKey with label stores label in keystore file", async () => {
    const { address } = await createKey({ label: "test-agent" });
    const keyPath = join(primHome, "keys", `${address}.json`);
    const file = JSON.parse(readFileSync(keyPath, "utf-8")) as { prim?: { label?: string } };
    expect(file.prim?.label).toBe("test-agent");
  });

  it("importKey stores key and round-trips correctly", async () => {
    const { address } = await importKey(TEST_PRIVATE_KEY);
    expect(address).toBe(TEST_ADDRESS);
    const recovered = await loadKey(address);
    expect(recovered).toBe(TEST_PRIVATE_KEY);
  });

  it("loadKey(address) returns correct private key", async () => {
    const { address } = await importKey(TEST_PRIVATE_KEY);
    const key = await loadKey(address);
    expect(key).toBe(TEST_PRIVATE_KEY);
  });

  it("loadKey() with no address uses default wallet", async () => {
    const { address } = await importKey(TEST_PRIVATE_KEY);
    await setDefaultAddress(address);
    const key = await loadKey();
    expect(key).toBe(TEST_PRIVATE_KEY);
  });

  it("loadKey() with no address and no default, single key → uses it", async () => {
    await importKey(TEST_PRIVATE_KEY);
    // Don't set default — single key should be auto-found
    await setDefaultAddress(""); // clear default by writing empty config
    // Re-import to have exactly one key with no default set
    rmSync(join(primHome, "config.toml"), { force: true });
    const key = await loadKey();
    expect(key).toBe(TEST_PRIVATE_KEY);
  });

  it("loadKey() with no address, no default, multiple keys → throws", async () => {
    await importKey(TEST_PRIVATE_KEY);
    const secondKey =
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as `0x${string}`;
    await importKey(secondKey);
    rmSync(join(primHome, "config.toml"), { force: true });
    await expect(loadKey()).rejects.toThrow("No default wallet");
  });

  it("loadKey(nonexistent) throws Key not found", async () => {
    await expect(loadKey("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")).rejects.toThrow(
      "Key not found",
    );
  });

  it("exportKey returns plaintext hex private key", async () => {
    const { address } = await importKey(TEST_PRIVATE_KEY);
    const exported = await exportKey(address);
    expect(exported).toBe(TEST_PRIVATE_KEY);
  });

  it("removeKey deletes the key file from disk", async () => {
    const { address } = await importKey(TEST_PRIVATE_KEY);
    const keyPath = join(primHome, "keys", `${address}.json`);
    expect(existsSync(keyPath)).toBe(true);
    await removeKey(address);
    expect(existsSync(keyPath)).toBe(false);
  });

  it("listKeys returns all keys with metadata", async () => {
    const { address: addr1 } = await createKey({ label: "alpha" });
    const secondKey =
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as `0x${string}`;
    const { address: addr2 } = await importKey(secondKey, { label: "beta" });

    const keys = await listKeys();
    expect(keys).toHaveLength(2);
    const labels = keys.map((k) => k.label);
    expect(labels).toContain("alpha");
    expect(labels).toContain("beta");
    const addresses = keys.map((k) => k.address);
    expect(addresses).toContain(addr1);
    expect(addresses).toContain(addr2);
  });
});

// ── Config ────────────────────────────────────────────────────────────────────

describe("config", () => {
  it("setDefaultAddress updates config.toml", async () => {
    await importKey(TEST_PRIVATE_KEY);
    await setDefaultAddress(TEST_ADDRESS);
    const configPath = join(primHome, "config.toml");
    const content = readFileSync(configPath, "utf-8");
    expect(content).toContain(TEST_ADDRESS);
  });

  it("getDefaultAddress reads config.toml", async () => {
    await importKey(TEST_PRIVATE_KEY);
    await setDefaultAddress(TEST_ADDRESS);
    const addr = await getDefaultAddress();
    expect(addr).toBe(TEST_ADDRESS);
  });

  it("first createKey auto-sets default", async () => {
    const { address } = await createKey();
    const def = await getDefaultAddress();
    expect(def).toBe(address);
  });

  it("getConfig returns PrimConfig", async () => {
    await importKey(TEST_PRIVATE_KEY);
    const config = await getConfig();
    expect(config).toHaveProperty("default_wallet");
  });
});

// ── Passphrase mode ───────────────────────────────────────────────────────────

describe("passphrase mode", () => {
  it("createKey with passphrase encrypts with passphrase", async () => {
    const { address } = await createKey({ passphrase: "test-pass" });
    const keyPath = join(primHome, "keys", `${address}.json`);
    const file = JSON.parse(readFileSync(keyPath, "utf-8")) as {
      prim?: { kdfInput?: string };
    };
    expect(file.prim?.kdfInput).toBe("passphrase");
  });

  it("loadKey with correct passphrase decrypts successfully", async () => {
    const { address } = await importKey(TEST_PRIVATE_KEY, { passphrase: "my-secret" });
    const key = await loadKey(address, { passphrase: "my-secret" });
    expect(key).toBe(TEST_PRIVATE_KEY);
  });

  it("loadKey on passphrase-encrypted key without passphrase throws", async () => {
    const { address } = await importKey(TEST_PRIVATE_KEY, { passphrase: "my-secret" });
    await expect(loadKey(address)).rejects.toThrow("Passphrase required");
  });

  it("loadKey with wrong passphrase throws Decryption failed", async () => {
    const { address } = await importKey(TEST_PRIVATE_KEY, { passphrase: "correct" });
    await expect(loadKey(address, { passphrase: "wrong" })).rejects.toThrow("Decryption failed");
  });
});

// ── V3 format compatibility ───────────────────────────────────────────────────

describe("V3 format", () => {
  it("generated keystore file has version: 3", async () => {
    const { address } = await createKey();
    const keyPath = join(primHome, "keys", `${address}.json`);
    const file = JSON.parse(readFileSync(keyPath, "utf-8")) as { version: number };
    expect(file.version).toBe(3);
  });

  it("crypto block matches V3 schema", async () => {
    const { address } = await createKey();
    const keyPath = join(primHome, "keys", `${address}.json`);
    const file = JSON.parse(readFileSync(keyPath, "utf-8")) as {
      crypto: {
        cipher: string;
        cipherparams: { iv: string };
        ciphertext: string;
        kdf: string;
        kdfparams: { n: number; r: number; p: number; dklen: number; salt: string };
        mac: string;
      };
    };
    expect(file.crypto.cipher).toBe("aes-128-ctr");
    expect(file.crypto.kdf).toBe("scrypt");
    expect(typeof file.crypto.cipherparams.iv).toBe("string");
    expect(typeof file.crypto.ciphertext).toBe("string");
    expect(typeof file.crypto.mac).toBe("string");
    expect(file.crypto.kdfparams).toMatchObject({ r: 8, p: 1, dklen: 32 });
  });

  it("V3 keystore without prim block (geth/foundry import) uses passphrase mode", async () => {
    // Craft a keystore with no prim block
    const { address } = await importKey(TEST_PRIVATE_KEY, { passphrase: "imported-pass" });
    const keyPath = join(primHome, "keys", `${address}.json`);
    const file = JSON.parse(readFileSync(keyPath, "utf-8")) as {
      prim?: { kdfInput: string };
    };
    // Strip prim block to simulate a geth/foundry import
    const strippedFile = { ...file, prim: undefined };
    const { writeFileSync } = await import("node:fs");
    writeFileSync(keyPath, JSON.stringify(strippedFile, null, 2), "utf-8");

    // Loading without passphrase should throw
    await expect(loadKey(address)).rejects.toThrow("Passphrase required");
    // Loading with correct passphrase should succeed
    const key = await loadKey(address, { passphrase: "imported-pass" });
    expect(key).toBe(TEST_PRIVATE_KEY);
  });
});

// ── loadAccount ───────────────────────────────────────────────────────────────

describe("loadAccount", () => {
  it("returns viem LocalAccount with correct address", async () => {
    await importKey(TEST_PRIVATE_KEY);
    const account = await loadAccount(TEST_ADDRESS);
    expect(account.address).toBe(TEST_ADDRESS);
  });

  it("can sign messages (smoke test)", async () => {
    await importKey(TEST_PRIVATE_KEY);
    const account = await loadAccount(TEST_ADDRESS);
    const sig = await account.signMessage({ message: "hello" });
    expect(sig).toMatch(/^0x[0-9a-f]+$/i);
  });
});

// ── getUsdcBalance ────────────────────────────────────────────────────────────

describe("getUsdcBalance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns balance, funded=true, and network on success", async () => {
    // 10.50 USDC in atomic units (6 decimals)
    mockReadContract.mockResolvedValue(10_500_000n);
    const result = await getUsdcBalance(TEST_ADDRESS);
    expect(result.address).toBe(TEST_ADDRESS);
    expect(result.balance).toBe("10.50");
    expect(result.funded).toBe(true);
    expect(result.network).toBe("eip155:84532");
  });

  it("returns funded=false when balance is zero", async () => {
    mockReadContract.mockResolvedValue(0n);
    const result = await getUsdcBalance(TEST_ADDRESS);
    expect(result.balance).toBe("0.00");
    expect(result.funded).toBe(false);
  });

  it("returns fallback { balance: '0.00', funded: false } on RPC failure", async () => {
    mockReadContract.mockRejectedValue(new Error("RPC timeout"));
    const result = await getUsdcBalance(TEST_ADDRESS);
    expect(result.balance).toBe("0.00");
    expect(result.funded).toBe(false);
    expect(result.network).toBe("eip155:84532");
  });

  it("includes address in result", async () => {
    mockReadContract.mockResolvedValue(5_000_000n);
    const result = await getUsdcBalance(TEST_ADDRESS);
    expect(result.address).toBe(TEST_ADDRESS);
  });
});
