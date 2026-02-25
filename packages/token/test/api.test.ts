/**
 * token.sh tests: deploy, list, get, mint, supply with mock RPC + :memory: SQLite.
 *
 * IMPORTANT: env vars must be set before any module import that touches db/deployer/factory.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

// ─── Env setup (before imports) ──────────────────────────────────────────

process.env.TOKEN_DB_PATH = ":memory:";
process.env.TOKEN_MASTER_KEY = "a".repeat(64);
process.env.BASE_CHAIN_ID = "8453";

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

// ─── Mock viem (intercept deployContract / writeContract / readContract) ──────────────────

// biome-ignore lint/suspicious/noExplicitAny: mock needs flexible return types
const deployContractMock = vi.fn<any[], any>(async (_args?: unknown) => "0xTXHASH_DEPLOY_000000000000000000000000000000000000000000000000000000" as `0x${string}`);
// biome-ignore lint/suspicious/noExplicitAny: mock needs flexible return types
const writeContractMock = vi.fn<any[], any>(async (_args?: unknown) => "0xTXHASH_MINT_000000000000000000000000000000000000000000000000000000" as `0x${string}`);
// biome-ignore lint/suspicious/noExplicitAny: mock needs flexible return types
const readContractMock = vi.fn<any[], any>(async (_args?: unknown) => 100000000000000000000000000n); // 100M with 18 decimals
// biome-ignore lint/suspicious/noExplicitAny: mock needs flexible return types
const waitForTransactionReceiptMock = vi.fn<any[], any>(async (_args?: unknown) => ({
  status: "success" as const,
  contractAddress: "0xTOKEN_DEPLOYED_CONTRACT0000000000000001" as `0x${string}`,
}));

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createWalletClient: vi.fn(() => ({
      deployContract: (...args: unknown[]) => deployContractMock(args[0]),
      writeContract: (...args: unknown[]) => writeContractMock(args[0]),
      account: { address: "0xDEPLOYER0000000000000000000000000000001" },
    })),
    createPublicClient: vi.fn(() => ({
      readContract: (...args: unknown[]) => readContractMock(args[0]),
      waitForTransactionReceipt: (...args: unknown[]) => waitForTransactionReceiptMock(args[0]),
      getChainId: async () => 8453,
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
  baseSepolia: { id: 84532, name: "Base Sepolia", network: "base-sepolia" },
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
  createPool,
  getPool,
  getLiquidityParams,
} from "../src/service.ts";
import {
  computeSqrtPriceX96,
  computeFullRangeTicks,
} from "../src/uniswap.ts";

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
    deployContractMock.mockClear();
    writeContractMock.mockClear();
    readContractMock.mockClear();
    waitForTransactionReceiptMock.mockClear();
    deployContractMock.mockResolvedValue(
      "0xTXHASH_DEPLOY_000000000000000000000000000000000000000000000000000000",
    );
    writeContractMock.mockResolvedValue(
      "0xTXHASH_MINT_000000000000000000000000000000000000000000000000000000",
    );
    readContractMock.mockResolvedValue(100000000000000000000000000n);
    waitForTransactionReceiptMock.mockResolvedValue({
      status: "success",
      contractAddress: "0xTOKEN_DEPLOYED_CONTRACT0000000000000001",
    });
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
    it("deploy — returns token with confirmed status when receipt succeeds", async () => {
      const result = await deployToken(VALID_REQUEST, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.token.id).toMatch(/^tk_/);
      expect(result.data.token.name).toBe("Kelly Claude Token");
      expect(result.data.token.symbol).toBe("KELLYCLAUDE");
      expect(result.data.token.ownerWallet).toBe(CALLER);
      expect(result.data.token.deployStatus).toBe("confirmed");
      expect(result.data.token.contractAddress).toBe("0xTOKEN_DEPLOYED_CONTRACT0000000000000001");
      expect(result.data.token.decimals).toBe(18);
      expect(result.data.token.mintable).toBe(false);
      expect(result.data.token.maxSupply).toBeNull();
      expect(result.data.token.totalMinted).toBe("0");
    });

    it("deploy — returns pending when receipt times out", async () => {
      waitForTransactionReceiptMock.mockRejectedValueOnce(new Error("Timed out"));
      const result = await deployToken(VALID_REQUEST, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.token.deployStatus).toBe("pending");
      expect(result.data.token.contractAddress).toBeNull();
    });

    it("deploy — status becomes failed when receipt is reverted", async () => {
      waitForTransactionReceiptMock.mockResolvedValueOnce({ status: "reverted", contractAddress: null });
      const result = await deployToken(VALID_REQUEST, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.token.deployStatus).toBe("failed");
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
      expect(row?.total_minted).toBe("0");
    });

    it("deploy — calls deployContract (not factory writeContract)", async () => {
      await deployToken(VALID_REQUEST, CALLER);
      expect(deployContractMock).toHaveBeenCalledTimes(1);
      expect(writeContractMock).not.toHaveBeenCalled();
      const args = deployContractMock.mock.calls[0][0] as Record<string, unknown>;
      expect(args.bytecode).toBeDefined();
      expect(args.abi).toBeDefined();
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
      deployContractMock.mockRejectedValueOnce(new Error("gas estimation failed"));
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

    it("deploy — duplicate (same owner+name+symbol) creates separate token", async () => {
      const r1 = await deployToken(VALID_REQUEST, CALLER);
      const r2 = await deployToken(VALID_REQUEST, CALLER);
      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
      if (!r1.ok || !r2.ok) return;
      expect(r1.data.token.id).not.toBe(r2.data.token.id);
    });

    it("deploy — large supply values use BigInt (no precision loss)", async () => {
      // 2^53 + 1 = 9007199254740993 — exceeds Number.MAX_SAFE_INTEGER
      const largeSupply = "9007199254740993";
      const result = await deployToken({ ...VALID_REQUEST, initialSupply: largeSupply }, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.token.initialSupply).toBe(largeSupply);
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

    beforeEach(() => {
      // For mint tests, receipt has no contractAddress (it's a call, not a deploy)
      waitForTransactionReceiptMock.mockResolvedValue({ status: "success", contractAddress: null });
    });

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

    it("cumulative mint cap: second mint fails when total would exceed maxSupply (Bug 1 fix)", async () => {
      const tokenId = await deployMintable();
      // maxSupply=10000000, initialSupply=1000000
      // Mint 8000000 → total=9000000 (within cap)
      const r1 = await mintTokens(tokenId, { to: CALLER, amount: "8000000" }, CALLER);
      expect(r1.ok).toBe(true);
      // Now total_minted=8000000. initialSupply + total_minted = 9000000.
      // Mint 1500000 → 9000000 + 1500000 = 10500000 > 10000000 → should fail
      const r2 = await mintTokens(tokenId, { to: CALLER, amount: "1500000" }, CALLER);
      expect(r2.ok).toBe(false);
      if (r2.ok) return;
      expect(r2.status).toBe(422);
      expect(r2.code).toBe("exceeds_max_supply");
    });

    it("cumulative mint cap: second mint succeeds when total stays within maxSupply", async () => {
      const tokenId = await deployMintable();
      // maxSupply=10000000, initialSupply=1000000
      // Mint 4000000 → total=5000000 (within cap)
      const r1 = await mintTokens(tokenId, { to: CALLER, amount: "4000000" }, CALLER);
      expect(r1.ok).toBe(true);
      // Mint 4000000 → 5000000 + 4000000 = 9000000 ≤ 10000000 → should pass
      const r2 = await mintTokens(tokenId, { to: CALLER, amount: "4000000" }, CALLER);
      expect(r2.ok).toBe(true);
    });

    it("total_minted incremented after successful mint", async () => {
      const tokenId = await deployMintable();
      await mintTokens(tokenId, { to: CALLER, amount: "500000" }, CALLER);
      const row = getDeploymentById(tokenId);
      expect(row?.total_minted).toBe("500000");
    });

    it("total_minted not incremented when mint tx reverts", async () => {
      const tokenId = await deployMintable();
      waitForTransactionReceiptMock.mockResolvedValueOnce({ status: "reverted", contractAddress: null });
      await mintTokens(tokenId, { to: CALLER, amount: "500000" }, CALLER);
      const row = getDeploymentById(tokenId);
      expect(row?.total_minted).toBe("0");
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
      // Reset to pending to simulate timeout scenario
      updateDeploymentStatus(deployed.data.token.id, "pending");
      // Manually clear contract_address by directly re-checking
      // The deployed token's contract_address gets set by receipt mock,
      // so we need to deploy with a timed-out receipt for this test
      resetDb();
      waitForTransactionReceiptMock.mockRejectedValueOnce(new Error("Timed out"));
      const deployResult = await deployToken(MINTABLE_REQUEST, CALLER);
      if (!deployResult.ok) throw new Error("Deploy failed");
      const result = await mintTokens(
        deployResult.data.token.id,
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
      waitForTransactionReceiptMock.mockRejectedValueOnce(new Error("Timed out"));
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

  // ─── Uniswap math ────────────────────────────────────────────────────

  describe("computeSqrtPriceX96", () => {
    // USDC on Base mainnet: 0x833589fCD6eDb6E08f4c7C32D4f71b1566469c3d
    // "token < USDC" address: 0x0000000000000000000000000000000000000001 (always < 0x8335...)
    // "token > USDC" address: 0xffffffffffffffffffffffffffffffffffffffff (always > 0x8335...)
    const TOKEN_LT = "0x0000000000000000000000000000000000000001" as const;
    const TOKEN_GT = "0xffffffffffffffffffffffffffffffffffffffff" as const;

    it("price=1.0, token < USDC: sqrtPriceX96 = floor(2^96 / 10^6)", () => {
      // token0=agentToken(18), token1=USDC(6)
      // price_atomic = 1 * 10^6 / 10^18 = 10^-12
      // sqrtPriceX96 = sqrt(10^-12) * 2^96 = 10^-6 * 2^96 = floor(2^96 / 10^6)
      const expected = 2n ** 96n / 10n ** 6n;
      const result = computeSqrtPriceX96("1.0", TOKEN_LT, 18, 8453);
      expect(result).toBe(expected);
    });

    it("price=1.0, token > USDC: sqrtPriceX96 = 10^6 * 2^96 (inversion)", () => {
      // token0=USDC(6), token1=agentToken(18)
      // price_atomic = 1 * 10^18 / 10^6 = 10^12
      // sqrtPriceX96 = sqrt(10^12) * 2^96 = 10^6 * 2^96
      const expected = 10n ** 6n * 2n ** 96n;
      const result = computeSqrtPriceX96("1.0", TOKEN_GT, 18, 8453);
      expect(result).toBe(expected);
    });

    it("price=0.01, token < USDC: sqrtPriceX96 = floor(2^96 / 10^7)", () => {
      // price_atomic = 0.01 * 10^6 / 10^18 = 10^-14
      // sqrtPriceX96 = sqrt(10^-14) * 2^96 = 10^-7 * 2^96 = floor(2^96 / 10^7)
      const expected = 2n ** 96n / 10n ** 7n;
      const result = computeSqrtPriceX96("0.01", TOKEN_LT, 18, 8453);
      expect(result).toBe(expected);
    });

    it("price=0.01, token > USDC: sqrtPriceX96 = 10^7 * 2^96 (inversion)", () => {
      // price_atomic = 100 * 10^18 / 10^6 = 10^14
      // sqrtPriceX96 = sqrt(10^14) * 2^96 = 10^7 * 2^96
      const expected = 10n ** 7n * 2n ** 96n;
      const result = computeSqrtPriceX96("0.01", TOKEN_GT, 18, 8453);
      expect(result).toBe(expected);
    });

    it("inversion symmetry: token>USDC price is strictly larger than token<USDC price", () => {
      // When token > USDC, USDC is token0 and price is inverted (large value)
      // When token < USDC, agentToken is token0 and price is small
      const lt = computeSqrtPriceX96("0.01", TOKEN_LT, 18, 8453);
      const gt = computeSqrtPriceX96("0.01", TOKEN_GT, 18, 8453);
      expect(gt).toBeGreaterThan(lt);
      // gt / lt should be approximately 10^14 (= price_B / price_A = 10^14 / 10^-14... no,
      // sqrt(price_B) / sqrt(price_A) = sqrt(10^14 / 10^-14) = sqrt(10^28) = 10^14)
      // so gt / lt ≈ 10^14
      expect(gt / lt).toBe(10n ** 14n);
    });
  });

  describe("computeFullRangeTicks", () => {
    it("fee tier 500 → tickSpacing 10: [-887270, 887270]", () => {
      const { tickLower, tickUpper } = computeFullRangeTicks(500);
      expect(tickLower).toBe(-887270);
      expect(tickUpper).toBe(887270);
    });

    it("fee tier 3000 → tickSpacing 60: [-887220, 887220]", () => {
      const { tickLower, tickUpper } = computeFullRangeTicks(3000);
      expect(tickLower).toBe(-887220);
      expect(tickUpper).toBe(887220);
    });

    it("fee tier 10000 → tickSpacing 200: [-887200, 887200]", () => {
      const { tickLower, tickUpper } = computeFullRangeTicks(10000);
      expect(tickLower).toBe(-887200);
      expect(tickUpper).toBe(887200);
    });

    it("unsupported fee tier throws", () => {
      expect(() => computeFullRangeTicks(9999)).toThrow("Unsupported fee tier");
    });
  });

  // ─── Pool creation ────────────────────────────────────────────────────

  describe("createPool + getPool + getLiquidityParams", () => {
    // Token address used by mock: "0xTOKEN_DEPLOYED_CONTRACT0000000000000001"
    // USDC on Base (chain 8453): "0x833589fCD6eDb6E08f4c7C32D4f71b1566469c3d"
    // "0xtoken_..." > "0x8335..." → USDC is token0, agentToken is token1

    const POOL_ADDRESS = "0xPOOLADDRESS00000000000000000000000000001";
    const INIT_TX = "0xTXHASH_INIT_000000000000000000000000000000000000000000000000000000";
    const MOCK_TICK = -46055;

    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    const SLOT0_INITIALIZED = (tick = MOCK_TICK) => ({
      sqrtPriceX96: 792281625142643n,
      tick,
      observationIndex: 0,
      observationCardinality: 1,
      observationCardinalityNext: 1,
      feeProtocol: 0,
      unlocked: true,
    });
    const SLOT0_UNINITIALIZED = {
      sqrtPriceX96: 0n,
      tick: 0,
      observationIndex: 0,
      observationCardinality: 0,
      observationCardinalityNext: 0,
      feeProtocol: 0,
      unlocked: true,
    };

    // Happy path: new pool (getPool → zero, createPool, getPool → addr, slot0 → 0, initialize, slot0 → confirmed)
    function setupPoolMocks(tick = MOCK_TICK) {
      // readContract sequence:
      // 1. factory.getPool (pre-check) → ZERO_ADDRESS
      // 2. factory.getPool (after createPool) → POOL_ADDRESS
      // 3. pool.slot0 (pre-check) → uninitialized (sqrtPriceX96=0)
      // 4. pool.slot0 (after initialize) → confirmed
      readContractMock.mockResolvedValueOnce(ZERO_ADDRESS);
      readContractMock.mockResolvedValueOnce(POOL_ADDRESS);
      readContractMock.mockResolvedValueOnce(SLOT0_UNINITIALIZED);
      readContractMock.mockResolvedValueOnce(SLOT0_INITIALIZED(tick));
      // writeContract: createPool tx, then initialize tx
      writeContractMock.mockResolvedValueOnce(
        "0xTXHASH_CREATE_000000000000000000000000000000000000000000000000000000",
      );
      writeContractMock.mockResolvedValueOnce(INIT_TX);
      // waitForTransactionReceipt: createPool receipt, initialize receipt
      waitForTransactionReceiptMock.mockResolvedValueOnce({
        status: "success" as const,
        contractAddress: null,
      });
      waitForTransactionReceiptMock.mockResolvedValueOnce({
        status: "success" as const,
        contractAddress: null,
      });
    }

    // Crash recovery: pool exists on-chain + already initialized (skip createPool + initialize)
    function setupAdoptInitializedMocks(tick = MOCK_TICK) {
      // readContract: getPool → POOL_ADDRESS, slot0 → initialized (no re-read needed)
      readContractMock.mockResolvedValueOnce(POOL_ADDRESS);
      readContractMock.mockResolvedValueOnce(SLOT0_INITIALIZED(tick));
      // no writeContract or waitForTransactionReceipt calls
    }

    // Crash recovery: pool exists on-chain but not yet initialized
    function setupAdoptUninitializedMocks(tick = MOCK_TICK) {
      // readContract: getPool → POOL_ADDRESS, slot0 → 0 (pre-check), slot0 → confirmed (after init)
      readContractMock.mockResolvedValueOnce(POOL_ADDRESS);
      readContractMock.mockResolvedValueOnce(SLOT0_UNINITIALIZED);
      readContractMock.mockResolvedValueOnce(SLOT0_INITIALIZED(tick));
      // writeContract: only initialize tx
      writeContractMock.mockResolvedValueOnce(INIT_TX);
      // waitForTransactionReceipt: only initialize receipt
      waitForTransactionReceiptMock.mockResolvedValueOnce({
        status: "success" as const,
        contractAddress: null,
      });
    }

    async function deployConfirmedToken(): Promise<string> {
      const r = await deployToken(VALID_REQUEST, CALLER);
      if (!r.ok) throw new Error("Deploy failed");
      // receipt mock returns contractAddress="0xTOKEN_DEPLOYED_CONTRACT0000000000000001"
      return r.data.token.id;
    }

    it("happy path: creates pool and returns pool info", async () => {
      const tokenId = await deployConfirmedToken();
      setupPoolMocks();
      const result = await createPool(tokenId, { pricePerToken: "0.01" }, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.poolAddress).toBe(POOL_ADDRESS);
      expect(result.data.fee).toBe(10000);
      expect(result.data.tick).toBe(MOCK_TICK);
      expect(result.data.txHash).toBe(INIT_TX);
      expect(result.data.token0).toBeDefined();
      expect(result.data.token1).toBeDefined();
    });

    it("custom fee tier 3000 is accepted", async () => {
      const tokenId = await deployConfirmedToken();
      setupPoolMocks();
      const result = await createPool(tokenId, { pricePerToken: "0.01", feeTier: 3000 }, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.fee).toBe(3000);
    });

    it("token not found → 404", async () => {
      const result = await createPool("tk_nonexist", { pricePerToken: "0.01" }, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(404);
      expect(result.code).toBe("not_found");
    });

    it("non-owner → 403", async () => {
      const tokenId = await deployConfirmedToken();
      const result = await createPool(tokenId, { pricePerToken: "0.01" }, OTHER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(403);
      expect(result.code).toBe("forbidden");
    });

    it("token not confirmed (pending) → 400", async () => {
      // Deploy with timed-out receipt → stays pending
      waitForTransactionReceiptMock.mockRejectedValueOnce(new Error("Timed out"));
      const r = await deployToken(VALID_REQUEST, CALLER);
      if (!r.ok) throw new Error("Deploy failed");
      const result = await createPool(r.data.token.id, { pricePerToken: "0.01" }, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
      expect(result.code).toBe("invalid_request");
    });

    it("duplicate pool → 409 pool_exists", async () => {
      const tokenId = await deployConfirmedToken();
      // First pool creation succeeds
      setupPoolMocks();
      const r1 = await createPool(tokenId, { pricePerToken: "0.01" }, CALLER);
      expect(r1.ok).toBe(true);
      // Second attempt → 409
      const r2 = await createPool(tokenId, { pricePerToken: "0.01" }, CALLER);
      expect(r2.ok).toBe(false);
      if (r2.ok) return;
      expect(r2.status).toBe(409);
      expect(r2.code).toBe("pool_exists");
    });

    it("invalid feeTier → 400", async () => {
      const tokenId = await deployConfirmedToken();
      const result = await createPool(tokenId, { pricePerToken: "0.01", feeTier: 9999 }, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
      expect(result.code).toBe("invalid_request");
    });

    it("invalid pricePerToken (zero) → 400", async () => {
      const tokenId = await deployConfirmedToken();
      const result = await createPool(tokenId, { pricePerToken: "0" }, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
    });

    it("invalid pricePerToken (negative) → 400", async () => {
      const tokenId = await deployConfirmedToken();
      const result = await createPool(tokenId, { pricePerToken: "-1" }, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
    });

    it("RPC error during pool creation → 502", async () => {
      const tokenId = await deployConfirmedToken();
      // getPool pre-check returns zero, then createPool reverts
      readContractMock.mockResolvedValueOnce(ZERO_ADDRESS);
      writeContractMock.mockRejectedValueOnce(new Error("execution reverted"));
      const result = await createPool(tokenId, { pricePerToken: "0.01" }, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(502);
      expect(result.code).toBe("rpc_error");
    });

    it("crash recovery: pool exists on-chain + initialized → adopt without creating or initializing", async () => {
      const tokenId = await deployConfirmedToken();
      setupAdoptInitializedMocks();
      const result = await createPool(tokenId, { pricePerToken: "0.01" }, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.poolAddress).toBe(POOL_ADDRESS);
      expect(result.data.tick).toBe(MOCK_TICK);
      // No createPool or initialize tx was submitted
      expect(writeContractMock).not.toHaveBeenCalled();
    });

    it("crash recovery: pool exists on-chain but uninitialized → skip createPool, call initialize", async () => {
      const tokenId = await deployConfirmedToken();
      setupAdoptUninitializedMocks();
      const result = await createPool(tokenId, { pricePerToken: "0.01" }, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.poolAddress).toBe(POOL_ADDRESS);
      // Only initialize was called (not createPool)
      expect(writeContractMock).toHaveBeenCalledTimes(1);
      const args = writeContractMock.mock.calls[0][0] as Record<string, unknown>;
      expect(args.functionName).toBe("initialize");
    });

    // ─── getPool ──────────────────────────────────────────────────────

    it("getPool: owner can fetch pool info", async () => {
      const tokenId = await deployConfirmedToken();
      setupPoolMocks();
      await createPool(tokenId, { pricePerToken: "0.01" }, CALLER);
      const result = getPool(tokenId, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.poolAddress).toBe(POOL_ADDRESS);
    });

    it("getPool: non-owner → 403", async () => {
      const tokenId = await deployConfirmedToken();
      setupPoolMocks();
      await createPool(tokenId, { pricePerToken: "0.01" }, CALLER);
      const result = getPool(tokenId, OTHER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(403);
    });

    it("getPool: no pool exists → 404", async () => {
      const tokenId = await deployConfirmedToken();
      const result = getPool(tokenId, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(404);
    });

    it("getPool: token not found → 404", async () => {
      const result = getPool("tk_nonexist", CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(404);
      expect(result.code).toBe("not_found");
    });

    // ─── getLiquidityParams ───────────────────────────────────────────

    it("getLiquidityParams: returns complete calldata", async () => {
      const tokenId = await deployConfirmedToken();
      setupPoolMocks();
      await createPool(tokenId, { pricePerToken: "0.01" }, CALLER);

      const result = getLiquidityParams(tokenId, "100", "1", CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const d = result.data;
      expect(d.positionManagerAddress).toBeDefined();
      expect(d.token0).toBeDefined();
      expect(d.token1).toBeDefined();
      expect(d.fee).toBe(10000);
      expect(d.tickLower).toBe(-887200);
      expect(d.tickUpper).toBe(887200);
      expect(d.amount0Min).toBe("0");
      expect(d.amount1Min).toBe("0");
      expect(d.recipient).toBe(CALLER);
      expect(d.deadline).toBeGreaterThan(Math.floor(Date.now() / 1000));
      expect(d.approvals).toHaveLength(2);
      expect(d.approvals[0].spender).toBe(d.positionManagerAddress);
      expect(d.approvals[1].spender).toBe(d.positionManagerAddress);
    });

    it("getLiquidityParams: amounts are in atomic units", async () => {
      const tokenId = await deployConfirmedToken();
      setupPoolMocks();
      await createPool(tokenId, { pricePerToken: "0.01" }, CALLER);

      const result = getLiquidityParams(tokenId, "1", "1", CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // One of amount0Desired/amount1Desired should be 1 USDC in atomic = 1000000
      // Other should be 1 token in atomic = 1000000000000000000
      const amounts = [result.data.amount0Desired, result.data.amount1Desired];
      expect(amounts).toContain("1000000"); // 1 USDC (6 dec)
      expect(amounts).toContain("1000000000000000000"); // 1 token (18 dec)
    });

    it("getLiquidityParams: token0/token1 ordering respected in amounts", async () => {
      // token "0xTOKEN_DEPLOYED_CONTRACT0000000000000001" > USDC → USDC is token0
      // So amount0Desired = usdcAtoms, amount1Desired = tokenAtoms
      const tokenId = await deployConfirmedToken();
      setupPoolMocks();
      await createPool(tokenId, { pricePerToken: "0.01" }, CALLER);

      const result = getLiquidityParams(tokenId, "5", "2", CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const pool = result.data;
      // token > USDC: token is token1, USDC is token0
      // token1 address contains "token", token0 address = USDC
      // amount0 = USDC = 2 * 10^6, amount1 = token = 5 * 10^18
      expect(pool.amount0Desired).toBe("2000000"); // 2 USDC
      expect(pool.amount1Desired).toBe("5000000000000000000"); // 5 tokens
    });

    it("getLiquidityParams: non-owner → 403", async () => {
      const tokenId = await deployConfirmedToken();
      setupPoolMocks();
      await createPool(tokenId, { pricePerToken: "0.01" }, CALLER);
      const result = getLiquidityParams(tokenId, "100", "1", OTHER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(403);
    });

    it("getLiquidityParams: no pool → 404", async () => {
      const tokenId = await deployConfirmedToken();
      const result = getLiquidityParams(tokenId, "100", "1", CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(404);
    });

    it("getLiquidityParams: invalid tokenAmount → 400", async () => {
      const tokenId = await deployConfirmedToken();
      setupPoolMocks();
      await createPool(tokenId, { pricePerToken: "0.01" }, CALLER);
      const result = getLiquidityParams(tokenId, "0", "1", CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
    });

    it("getLiquidityParams: invalid usdcAmount → 400", async () => {
      const tokenId = await deployConfirmedToken();
      setupPoolMocks();
      await createPool(tokenId, { pricePerToken: "0.01" }, CALLER);
      const result = getLiquidityParams(tokenId, "100", "-1", CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
    });
  });

  // ─── Chain configuration ─────────────────────────────────────────────

  describe("getChain", () => {
    it("BASE_CHAIN_ID=8453 returns base", async () => {
      process.env.BASE_CHAIN_ID = "8453";
      const { getChain } = await import("../src/deployer.ts");
      const chain = getChain();
      expect(chain.id).toBe(8453);
    });

    it("BASE_CHAIN_ID=84532 returns baseSepolia", async () => {
      process.env.BASE_CHAIN_ID = "84532";
      const { getChain } = await import("../src/deployer.ts");
      const chain = getChain();
      expect(chain.id).toBe(84532);
      process.env.BASE_CHAIN_ID = "8453";
    });

    it("unsupported chain ID throws", async () => {
      process.env.BASE_CHAIN_ID = "1";
      const { getChain } = await import("../src/deployer.ts");
      expect(() => getChain()).toThrow("Unsupported BASE_CHAIN_ID");
      process.env.BASE_CHAIN_ID = "8453";
    });
  });
});
