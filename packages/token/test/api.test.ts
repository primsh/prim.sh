/**
 * token.sh tests: deploy, list, get, mint, supply with mock RPC + :memory: SQLite.
 *
 * IMPORTANT: env vars must be set before any module import that touches db/deployer/factory.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

// ─── Env setup (before imports) ──────────────────────────────────────────

process.env.TOKEN_DB_PATH = ":memory:";
process.env.TOKEN_FACTORY_ADDRESS = "0xFACT000000000000000000000000000000000001";
process.env.TOKEN_MASTER_KEY = "a".repeat(64);

// Generate a valid encrypted key for the deployer
import { createCipheriv } from "node:crypto";
function makeEncryptedKey(): string {
  const masterKey = Buffer.from("a".repeat(64), "hex");
  const iv = Buffer.alloc(12, 1);
  const cipher = createCipheriv("aes-256-gcm", masterKey, iv);
  const privKey = `0x${"bb".repeat(32)}`;
  const encrypted = Buffer.concat([cipher.update(Buffer.from(privKey, "utf8")), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    version: 1,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: encrypted.toString("base64"),
  });
}

process.env.TOKEN_DEPLOYER_ENCRYPTED_KEY = makeEncryptedKey();

// ─── Mock viem (intercept writeContract / readContract) ──────────────────

const writeContractMock = vi.fn(async (_args?: unknown) => "0xTXHASH_DEPLOY_000000000000000000000000000000000000000000000000000000");
const readContractMock = vi.fn(async (_args?: unknown) => 100000000000000000000000000n); // 100M with 18 decimals

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createWalletClient: vi.fn(() => ({
      writeContract: (...args: unknown[]) => writeContractMock(args[0]),
      account: { address: "0xDEPLOYER0000000000000000000000000000001" },
    })),
    createPublicClient: vi.fn(() => ({
      readContract: (...args: unknown[]) => readContractMock(args[0]),
    })),
  };
});

vi.mock("viem/accounts", () => ({
  privateKeyToAccount: vi.fn(() => ({
    address: "0xDEPLOYER0000000000000000000000000000001",
    signMessage: vi.fn(),
    signTransaction: vi.fn(),
    signTypedData: vi.fn(),
    type: "local",
    source: "privateKey",
    publicKey: "0x00",
  })),
}));

vi.mock("viem/chains", () => ({
  base: { id: 8453, name: "Base", network: "base" },
}));

// ─── Import after env + mocks ────────────────────────────────────────────

import { resetDb, getDeploymentById, updateDeploymentStatus } from "../src/db.ts";
import {
  deployToken,
  listTokens,
  getToken,
  mintTokens,
  getSupply,
  validateCreateToken,
} from "../src/service.ts";

// ─── Fixtures ────────────────────────────────────────────────────────────

const CALLER = "0xca11e90000000000000000000000000000000001";
const OTHER = "0xca11e90000000000000000000000000000000002";

const VALID_REQUEST = {
  name: "Kelly Claude Token",
  symbol: "KELLYCLAUDE",
  decimals: 18,
  initialSupply: "100000000000",
  mintable: false,
};

const MINTABLE_REQUEST = {
  name: "Mintable Token",
  symbol: "MINT",
  decimals: 18,
  initialSupply: "1000000",
  mintable: true,
  maxSupply: "10000000",
};

// ─── Tests ───────────────────────────────────────────────────────────────

describe("token.sh", () => {
  beforeEach(() => {
    resetDb();
    writeContractMock.mockClear();
    readContractMock.mockClear();
    writeContractMock.mockResolvedValue(
      "0xTXHASH_DEPLOY_000000000000000000000000000000000000000000000000000000",
    );
    readContractMock.mockResolvedValue(100000000000000000000000000n);
  });

  afterEach(() => {
    resetDb();
  });

  // ─── Input validation ────────────────────────────────────────────────

  describe("validateCreateToken", () => {
    it("valid non-mintable request passes", () => {
      expect(validateCreateToken(VALID_REQUEST)).toBeNull();
    });

    it("valid mintable request passes", () => {
      expect(validateCreateToken(MINTABLE_REQUEST)).toBeNull();
    });

    it("empty name fails", () => {
      const result = validateCreateToken({ ...VALID_REQUEST, name: "" });
      expect(result).not.toBeNull();
      expect(result?.code).toBe("invalid_request");
    });

    it("name > 64 chars fails", () => {
      const result = validateCreateToken({ ...VALID_REQUEST, name: "a".repeat(65) });
      expect(result).not.toBeNull();
      expect(result?.code).toBe("invalid_request");
    });

    it("empty symbol fails", () => {
      const result = validateCreateToken({ ...VALID_REQUEST, symbol: "" });
      expect(result).not.toBeNull();
      expect(result?.code).toBe("invalid_request");
    });

    it("symbol > 11 chars fails", () => {
      const result = validateCreateToken({ ...VALID_REQUEST, symbol: "ABCDEFGHIJKL" });
      expect(result).not.toBeNull();
      expect(result?.code).toBe("invalid_request");
    });

    it("lowercase symbol fails", () => {
      const result = validateCreateToken({ ...VALID_REQUEST, symbol: "abc" });
      expect(result).not.toBeNull();
      expect(result?.code).toBe("invalid_request");
      expect(result?.message).toContain("uppercase");
    });

    it("symbol with special chars fails", () => {
      const result = validateCreateToken({ ...VALID_REQUEST, symbol: "AB-C" });
      expect(result).not.toBeNull();
    });

    it("decimals -1 fails", () => {
      const result = validateCreateToken({ ...VALID_REQUEST, decimals: -1 });
      expect(result).not.toBeNull();
      expect(result?.code).toBe("invalid_request");
    });

    it("decimals 19 fails", () => {
      const result = validateCreateToken({ ...VALID_REQUEST, decimals: 19 });
      expect(result).not.toBeNull();
    });

    it("decimals 0 passes", () => {
      expect(validateCreateToken({ ...VALID_REQUEST, decimals: 0 })).toBeNull();
    });

    it("decimals 18 passes", () => {
      expect(validateCreateToken({ ...VALID_REQUEST, decimals: 18 })).toBeNull();
    });

    it("empty initialSupply fails", () => {
      const result = validateCreateToken({ ...VALID_REQUEST, initialSupply: "" });
      expect(result).not.toBeNull();
    });

    it("initialSupply 0 fails", () => {
      const result = validateCreateToken({ ...VALID_REQUEST, initialSupply: "0" });
      expect(result).not.toBeNull();
    });

    it("negative initialSupply fails", () => {
      const result = validateCreateToken({ ...VALID_REQUEST, initialSupply: "-100" });
      expect(result).not.toBeNull();
    });

    it("mintable=true without maxSupply fails", () => {
      const result = validateCreateToken({
        ...VALID_REQUEST,
        mintable: true,
        maxSupply: null,
      });
      expect(result).not.toBeNull();
      expect(result?.message).toContain("maxSupply");
    });

    it("mintable=true with maxSupply < initialSupply fails", () => {
      const result = validateCreateToken({
        ...VALID_REQUEST,
        mintable: true,
        initialSupply: "1000",
        maxSupply: "500",
      });
      expect(result).not.toBeNull();
      expect(result?.message).toContain("maxSupply");
    });

    it("mintable=true with maxSupply == initialSupply passes", () => {
      expect(
        validateCreateToken({
          ...VALID_REQUEST,
          mintable: true,
          initialSupply: "1000",
          maxSupply: "1000",
        }),
      ).toBeNull();
    });

    it("defaults: decimals=18, mintable=false", () => {
      expect(
        validateCreateToken({ name: "Test", symbol: "TST", initialSupply: "1000" }),
      ).toBeNull();
    });
  });

  // ─── Deploy ──────────────────────────────────────────────────────────

  describe("deployToken", () => {
    it("deploy — returns token with pending status", async () => {
      const result = await deployToken(VALID_REQUEST, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.token.id).toMatch(/^tk_/);
      expect(result.data.token.name).toBe("Kelly Claude Token");
      expect(result.data.token.symbol).toBe("KELLYCLAUDE");
      expect(result.data.token.ownerWallet).toBe(CALLER);
      expect(result.data.token.deployStatus).toBe("pending");
      expect(result.data.token.decimals).toBe(18);
      expect(result.data.token.mintable).toBe(false);
      expect(result.data.token.maxSupply).toBeNull();
    });

    it("deploy — persists to DB", async () => {
      const result = await deployToken(VALID_REQUEST, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const row = getDeploymentById(result.data.token.id);
      expect(row).not.toBeNull();
      expect(row?.name).toBe("Kelly Claude Token");
      expect(row?.symbol).toBe("KELLYCLAUDE");
      expect(row?.owner_wallet).toBe(CALLER);
    });

    it("deploy — calls writeContract on factory", async () => {
      await deployToken(VALID_REQUEST, CALLER);
      expect(writeContractMock).toHaveBeenCalledTimes(1);
      const args = writeContractMock.mock.calls[0][0] as Record<string, unknown>;
      expect(args.address).toBe(process.env.TOKEN_FACTORY_ADDRESS);
      expect(args.functionName).toBe("deploy");
    });

    it("deploy — mintable token stores maxSupply", async () => {
      const result = await deployToken(MINTABLE_REQUEST, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.token.mintable).toBe(true);
      expect(result.data.token.maxSupply).toBe("10000000");
    });

    it("deploy — invalid name returns 400", async () => {
      const result = await deployToken({ ...VALID_REQUEST, name: "" }, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
      expect(result.code).toBe("invalid_request");
    });

    it("deploy — invalid symbol returns 400", async () => {
      const result = await deployToken({ ...VALID_REQUEST, symbol: "lowercase" }, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
    });

    it("deploy — RPC error returns 502", async () => {
      writeContractMock.mockRejectedValueOnce(new Error("gas estimation failed"));
      const result = await deployToken(VALID_REQUEST, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(502);
      expect(result.code).toBe("rpc_error");
      expect(result.message).toContain("gas estimation failed");
    });

    it("deploy — custom decimals", async () => {
      const result = await deployToken({ ...VALID_REQUEST, decimals: 6 }, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.token.decimals).toBe(6);
    });

    it("deploy — defaults decimals to 18", async () => {
      const { decimals, ...noDecimals } = VALID_REQUEST;
      const result = await deployToken(noDecimals as typeof VALID_REQUEST, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.token.decimals).toBe(18);
    });
  });

  // ─── List tokens ──────────────────────────────────────────────────────

  describe("listTokens", () => {
    it("returns only caller's tokens", async () => {
      await deployToken(VALID_REQUEST, CALLER);
      await deployToken({ ...VALID_REQUEST, name: "Other Token", symbol: "OTH" }, OTHER);

      const result = listTokens(CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.tokens).toHaveLength(1);
      expect(result.data.tokens[0].name).toBe("Kelly Claude Token");
    });

    it("empty list when no tokens", () => {
      const result = listTokens(CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.tokens).toHaveLength(0);
    });

    it("multiple tokens for same owner", async () => {
      await deployToken(VALID_REQUEST, CALLER);
      await deployToken({ ...VALID_REQUEST, name: "Second", symbol: "SEC" }, CALLER);

      const result = listTokens(CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.tokens).toHaveLength(2);
    });
  });

  // ─── Get token ────────────────────────────────────────────────────────

  describe("getToken", () => {
    it("owner can access", async () => {
      const deployed = await deployToken(VALID_REQUEST, CALLER);
      if (!deployed.ok) return;

      const result = getToken(deployed.data.token.id, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.token.name).toBe("Kelly Claude Token");
    });

    it("non-owner gets 403", async () => {
      const deployed = await deployToken(VALID_REQUEST, CALLER);
      if (!deployed.ok) return;

      const result = getToken(deployed.data.token.id, OTHER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(403);
      expect(result.code).toBe("forbidden");
    });

    it("nonexistent returns 404", () => {
      const result = getToken("tk_nonexist", CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(404);
      expect(result.code).toBe("not_found");
    });
  });

  // ─── Mint tokens ──────────────────────────────────────────────────────

  describe("mintTokens", () => {
    async function deployMintable(): Promise<string> {
      const result = await deployToken(MINTABLE_REQUEST, CALLER);
      if (!result.ok) throw new Error("Setup failed");
      // Simulate confirmed deploy with contract address
      updateDeploymentStatus(result.data.token.id, "confirmed", "0xTOKEN00000000000000000000000000000000001");
      return result.data.token.id;
    }

    async function deployNonMintable(): Promise<string> {
      const result = await deployToken(VALID_REQUEST, CALLER);
      if (!result.ok) throw new Error("Setup failed");
      updateDeploymentStatus(result.data.token.id, "confirmed", "0xTOKEN00000000000000000000000000000000002");
      return result.data.token.id;
    }

    // Decision table:
    // mintable=false, * , *                     → 400 not_mintable
    // mintable=true, caller!=owner, *           → 403 forbidden
    // mintable=true, caller==owner, exceeds cap → 422 exceeds_max_supply
    // mintable=true, caller==owner, within cap  → 200 tx submitted

    it("not mintable → 400 not_mintable", async () => {
      const tokenId = await deployNonMintable();
      const result = await mintTokens(tokenId, { to: CALLER, amount: "1000" }, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
      expect(result.code).toBe("not_mintable");
    });

    it("mintable, non-owner → 403 forbidden", async () => {
      const tokenId = await deployMintable();
      const result = await mintTokens(tokenId, { to: OTHER, amount: "1000" }, OTHER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(403);
      expect(result.code).toBe("forbidden");
    });

    it("mintable, owner, exceeds cap → 422 exceeds_max_supply", async () => {
      const tokenId = await deployMintable();
      // maxSupply=10000000, initialSupply=1000000, mint 9500000 → total 10500000 > 10000000
      const result = await mintTokens(tokenId, { to: CALLER, amount: "9500000" }, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(422);
      expect(result.code).toBe("exceeds_max_supply");
    });

    it("mintable, owner, within cap → 200 tx submitted", async () => {
      const tokenId = await deployMintable();
      const result = await mintTokens(tokenId, { to: CALLER, amount: "1000" }, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.status).toBe("pending");
      expect(result.data.to).toBe(CALLER);
      expect(result.data.amount).toBe("1000");
    });

    it("mint calls writeContract on token address", async () => {
      const tokenId = await deployMintable();
      writeContractMock.mockClear();
      await mintTokens(tokenId, { to: CALLER, amount: "1000" }, CALLER);
      expect(writeContractMock).toHaveBeenCalledTimes(1);
      const args = writeContractMock.mock.calls[0][0] as Record<string, unknown>;
      expect(args.address).toBe("0xTOKEN00000000000000000000000000000000001");
      expect(args.functionName).toBe("mint");
    });

    it("nonexistent token → 404", async () => {
      const result = await mintTokens("tk_nonexist", { to: CALLER, amount: "1000" }, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(404);
    });

    it("pending deploy → 400 not yet deployed", async () => {
      // Deploy but don't confirm (contract_address stays null)
      const deployed = await deployToken(MINTABLE_REQUEST, CALLER);
      if (!deployed.ok) throw new Error("Setup failed");
      const result = await mintTokens(
        deployed.data.token.id,
        { to: CALLER, amount: "1000" },
        CALLER,
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
      expect(result.message).toContain("not yet deployed");
    });

    it("invalid to address → 400", async () => {
      const tokenId = await deployMintable();
      const result = await mintTokens(tokenId, { to: "not-an-address", amount: "1000" }, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
      expect(result.code).toBe("invalid_request");
    });

    it("invalid amount (0) → 400", async () => {
      const tokenId = await deployMintable();
      const result = await mintTokens(tokenId, { to: CALLER, amount: "0" }, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
    });

    it("invalid amount (negative) → 400", async () => {
      const tokenId = await deployMintable();
      const result = await mintTokens(tokenId, { to: CALLER, amount: "-100" }, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
    });

    it("RPC error during mint → 502", async () => {
      const tokenId = await deployMintable();
      writeContractMock.mockRejectedValueOnce(new Error("nonce too low"));
      const result = await mintTokens(tokenId, { to: CALLER, amount: "1000" }, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(502);
      expect(result.code).toBe("rpc_error");
    });
  });

  // ─── Supply ──────────────────────────────────────────────────────────

  describe("getSupply", () => {
    async function deployAndConfirm(): Promise<string> {
      const result = await deployToken(VALID_REQUEST, CALLER);
      if (!result.ok) throw new Error("Setup failed");
      updateDeploymentStatus(result.data.token.id, "confirmed", "0xTOKEN00000000000000000000000000000000003");
      return result.data.token.id;
    }

    it("returns total supply from chain", async () => {
      const tokenId = await deployAndConfirm();
      const result = await getSupply(tokenId, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.contractAddress).toBe("0xTOKEN00000000000000000000000000000000003");
      expect(result.data.totalSupply).toBeDefined();
    });

    it("non-owner gets 403", async () => {
      const tokenId = await deployAndConfirm();
      const result = await getSupply(tokenId, OTHER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(403);
    });

    it("nonexistent token → 404", async () => {
      const result = await getSupply("tk_nonexist", CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(404);
    });

    it("pending deploy → 400", async () => {
      const deployed = await deployToken(VALID_REQUEST, CALLER);
      if (!deployed.ok) return;
      const result = await getSupply(deployed.data.token.id, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
      expect(result.message).toContain("not yet deployed");
    });

    it("RPC error → 502", async () => {
      const tokenId = await deployAndConfirm();
      readContractMock.mockRejectedValueOnce(new Error("connection refused"));
      const result = await getSupply(tokenId, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(502);
      expect(result.code).toBe("rpc_error");
    });
  });

  // ─── CREATE2 salt ────────────────────────────────────────────────────

  describe("CREATE2 salt", () => {
    it("same inputs produce same salt", async () => {
      const { computeDeploySalt } = await import("../src/factory.ts");
      const salt1 = computeDeploySalt(CALLER as `0x${string}`, "Test", "TST");
      const salt2 = computeDeploySalt(CALLER as `0x${string}`, "Test", "TST");
      expect(salt1).toBe(salt2);
    });

    it("different owner produces different salt", async () => {
      const { computeDeploySalt } = await import("../src/factory.ts");
      const salt1 = computeDeploySalt(CALLER as `0x${string}`, "Test", "TST");
      const salt2 = computeDeploySalt(OTHER as `0x${string}`, "Test", "TST");
      expect(salt1).not.toBe(salt2);
    });

    it("different name produces different salt", async () => {
      const { computeDeploySalt } = await import("../src/factory.ts");
      const salt1 = computeDeploySalt(CALLER as `0x${string}`, "Test", "TST");
      const salt2 = computeDeploySalt(CALLER as `0x${string}`, "Other", "TST");
      expect(salt1).not.toBe(salt2);
    });

    it("different symbol produces different salt", async () => {
      const { computeDeploySalt } = await import("../src/factory.ts");
      const salt1 = computeDeploySalt(CALLER as `0x${string}`, "Test", "TST");
      const salt2 = computeDeploySalt(CALLER as `0x${string}`, "Test", "OTH");
      expect(salt1).not.toBe(salt2);
    });
  });

  // ─── Deployer keystore ──────────────────────────────────────────────

  describe("deployer keystore", () => {
    it("encrypt then decrypt roundtrips", async () => {
      const { encryptPrivateKey, decryptPrivateKey } = await import("../src/deployer.ts");
      const key = `0x${"cc".repeat(32)}`;
      const encrypted = encryptPrivateKey(key as `0x${string}`);
      const decrypted = decryptPrivateKey(encrypted);
      expect(decrypted).toBe(key);
    });

    it("missing TOKEN_MASTER_KEY throws", async () => {
      const origKey = process.env.TOKEN_MASTER_KEY;
      process.env.TOKEN_MASTER_KEY = "";
      try {
        const { getMasterKey } = await import("../src/deployer.ts");
        expect(() => getMasterKey()).toThrow("TOKEN_MASTER_KEY is required");
      } finally {
        process.env.TOKEN_MASTER_KEY = origKey;
      }
    });
  });

  // ─── Factory address validation ─────────────────────────────────────

  describe("factory address", () => {
    it("getFactoryAddress returns configured address", async () => {
      const { getFactoryAddress } = await import("../src/factory.ts");
      expect(getFactoryAddress()).toBe("0xFACT000000000000000000000000000000000001");
    });

    it("missing TOKEN_FACTORY_ADDRESS throws", async () => {
      const orig = process.env.TOKEN_FACTORY_ADDRESS;
      process.env.TOKEN_FACTORY_ADDRESS = "";
      try {
        const { getFactoryAddress } = await import("../src/factory.ts");
        expect(() => getFactoryAddress()).toThrow("TOKEN_FACTORY_ADDRESS is required");
      } finally {
        process.env.TOKEN_FACTORY_ADDRESS = orig;
      }
    });
  });
});
