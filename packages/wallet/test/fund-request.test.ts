/**
 * W-6 fund request tests: create, list, approve, deny, ownership, pending-only checks.
 *
 * IMPORTANT: env vars must be set before any module imports that touch keystore/db.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

// Set master key and in-memory DB before any imports
const TEST_MASTER_KEY = "a".repeat(64); // 32 bytes as hex
process.env.WALLET_MASTER_KEY = TEST_MASTER_KEY;
process.env.WALLET_DB_PATH = ":memory:";

// ─── Hoist mock fns so vi.mock factories can reference them ───────────────

const { mockWriteContract, mockGetUsdcBalance } = vi.hoisted(() => ({
  mockWriteContract: vi.fn<[], Promise<`0x${string}`>>(),
  mockGetUsdcBalance: vi.fn<[string], Promise<{ balance: string; funded: boolean }>>(),
}));

// ─── Mock viem wallet client ───────────────────────────────────────────────

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createWalletClient: vi.fn(() => ({
      writeContract: mockWriteContract,
    })),
  };
});

// ─── Mock balance check ────────────────────────────────────────────────────

vi.mock("../src/balance.ts", () => ({
  getUsdcBalance: mockGetUsdcBalance,
}));

// Import modules after mocks are set up
import { resetDb } from "../src/db.ts";
import { generateWallet, encryptPrivateKey } from "../src/keystore.ts";
import { insertWallet, claimWallet } from "../src/db.ts";
import {
  createFundRequest,
  listFundRequests,
  approveFundRequest,
  denyFundRequest,
} from "../src/service.ts";

// ─── Test helpers ─────────────────────────────────────────────────────────

// Owner's identity address (pays from this address, also has a wallet in DB)
const OWNER = "0x0wner000000000000000000000000000000000001";
const OTHER = "0x0ther000000000000000000000000000000000002";

function makeWallet(owner?: string): { address: string; claimToken: string } {
  const { address, privateKey } = generateWallet();
  const encryptedKey = encryptPrivateKey(privateKey);
  const claimToken = `ctk_${"a".repeat(64)}`;
  insertWallet({ address, chain: "eip155:8453", encryptedKey, claimToken });
  if (owner) {
    claimWallet(address, claimToken, owner);
  }
  return { address, claimToken };
}

beforeEach(() => {
  resetDb();
  mockWriteContract.mockReset();
  mockGetUsdcBalance.mockReset();
});

afterEach(() => {
  resetDb();
});

// ─── Create fund request ──────────────────────────────────────────────────

describe("createFundRequest — valid", () => {
  it("returns request object with fr_ ID and status pending", () => {
    const agent = makeWallet(OWNER);

    const result = createFundRequest(agent.address, { amount: "5.00", reason: "Need funds" }, OWNER);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.id).toMatch(/^fr_[0-9a-f]{8}$/);
      expect(result.data.status).toBe("pending");
      expect(result.data.walletAddress).toBe(agent.address);
      expect(result.data.amount).toBe("5.00");
      expect(result.data.reason).toBe("Need funds");
      expect(typeof result.data.createdAt).toBe("string");
    }
  });
});

describe("createFundRequest — not owner", () => {
  it("returns 403 when caller does not own the wallet", () => {
    const agent = makeWallet(OWNER);

    const result = createFundRequest(agent.address, { amount: "5.00", reason: "Need funds" }, OTHER);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.code).toBe("forbidden");
    }
  });
});

describe("createFundRequest — validation", () => {
  it("returns 400 for zero amount", () => {
    const agent = makeWallet(OWNER);
    const result = createFundRequest(agent.address, { amount: "0", reason: "test" }, OWNER);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it("returns 400 for empty reason", () => {
    const agent = makeWallet(OWNER);
    const result = createFundRequest(agent.address, { amount: "1.00", reason: "" }, OWNER);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });
});

// ─── List fund requests ───────────────────────────────────────────────────

describe("listFundRequests — has requests", () => {
  it("returns array with pending requests", () => {
    const agent = makeWallet(OWNER);
    createFundRequest(agent.address, { amount: "5.00", reason: "first" }, OWNER);
    createFundRequest(agent.address, { amount: "10.00", reason: "second" }, OWNER);

    const result = listFundRequests(agent.address, OWNER, 20);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.requests).toHaveLength(2);
      expect(result.data.requests[0].status).toBe("pending");
      expect(result.data.cursor).toBeNull();
    }
  });
});

describe("listFundRequests — empty", () => {
  it("returns empty array when no requests exist", () => {
    const agent = makeWallet(OWNER);

    const result = listFundRequests(agent.address, OWNER, 20);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.requests).toHaveLength(0);
      expect(result.data.cursor).toBeNull();
    }
  });
});

describe("listFundRequests — not owner", () => {
  it("returns 403 when caller does not own the wallet", () => {
    const agent = makeWallet(OWNER);
    const result = listFundRequests(agent.address, OTHER, 20);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });
});

// ─── Approve fund request ─────────────────────────────────────────────────

describe("approveFundRequest — success", () => {
  it("returns status approved with txHash", async () => {
    // Owner has their own wallet in DB (to send from)
    const ownerWallet = makeWallet(OWNER);
    // Agent wallet is also owned by OWNER
    const agentWallet = makeWallet(OWNER);

    // Create a fund request on the agent's wallet
    const createResult = createFundRequest(agentWallet.address, { amount: "5.00", reason: "Need funds" }, OWNER);
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;
    const requestId = createResult.data.id;

    mockGetUsdcBalance.mockResolvedValue({ balance: "100.00", funded: true });
    mockWriteContract.mockResolvedValue("0xApprovedTxHash");

    // Approve: owner sends from their own wallet (OWNER address) to agent wallet
    // sendUsdc(ownerWalletAddress, { to: agentWallet }, OWNER)
    // Here ownerWalletAddress = ownerWallet.address (owner claimed it)
    // But approveFundRequest calls sendUsdc(caller, ...) where caller = OWNER
    // OWNER must own a wallet at address OWNER — but addresses are generated...
    // We need to use the ownerWallet.address as the caller in the service.
    // Actually, the approve endpoint identifies the caller by their payment address.
    // In this test, we use OWNER directly as the caller, but OWNER's wallet in the DB
    // is at ownerWallet.address (a generated address, not OWNER itself).
    // So we call approveFundRequest with ownerWallet.address as the caller,
    // and the fund request's wallet_address ownership check will verify
    // that ownerWallet.address == created_by of agentWallet.
    // This requires: agentWallet.created_by == ownerWallet.address.
    // But our makeWallet uses OWNER as the claim target, not ownerWallet.address.
    //
    // To make this test work cleanly, we use OWNER as both the caller identity
    // AND we ensure agentWallet's created_by == OWNER.
    // Then approveFundRequest(requestId, OWNER) calls sendUsdc(OWNER, ..., OWNER).
    // sendUsdc(OWNER, ...) calls checkOwnership(OWNER, OWNER).
    // getWalletByAddress(OWNER) — this looks up a wallet with address == OWNER.
    // OWNER is "0x0wner..." which is NOT a wallet address in our DB (ownerWallet.address is generated).
    // So we need to insert a wallet with address == OWNER.

    // Insert a synthetic wallet with OWNER as its address, owned by OWNER
    const { address: _oAddr, privateKey: _oPk } = generateWallet();
    const ownerKeyBlob = encryptPrivateKey(_oPk);
    insertWallet({ address: OWNER, chain: "eip155:8453", encryptedKey: ownerKeyBlob, claimToken: "ctk_ownertoken00000000000000000000000000000000000000000000000000000000000" });
    claimWallet(OWNER, "ctk_ownertoken00000000000000000000000000000000000000000000000000000000000", OWNER);

    const result = await approveFundRequest(requestId, OWNER);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe("approved");
      expect(result.data.txHash).toBe("0xApprovedTxHash");
      expect(result.data.id).toBe(requestId);
      expect(typeof result.data.approvedAt).toBe("string");
    }
  });
});

describe("approveFundRequest — already approved", () => {
  it("returns 409 when approving a non-pending request", async () => {
    const agentWallet = makeWallet(OWNER);

    // Insert owner's wallet at OWNER address
    const { privateKey: oPk } = generateWallet();
    insertWallet({ address: OWNER, chain: "eip155:8453", encryptedKey: encryptPrivateKey(oPk), claimToken: "ctk_ow2" });
    claimWallet(OWNER, "ctk_ow2", OWNER);

    const createResult = createFundRequest(agentWallet.address, { amount: "5.00", reason: "test" }, OWNER);
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;
    const requestId = createResult.data.id;

    mockGetUsdcBalance.mockResolvedValue({ balance: "100.00", funded: true });
    mockWriteContract.mockResolvedValue("0xTxHash1");

    // First approve succeeds
    const first = await approveFundRequest(requestId, OWNER);
    expect(first.ok).toBe(true);

    // Second approve should fail
    const second = await approveFundRequest(requestId, OWNER);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.status).toBe(409);
    }
  });
});

describe("approveFundRequest — insufficient balance", () => {
  it("propagates error from sendUsdc", async () => {
    const agentWallet = makeWallet(OWNER);

    const { privateKey: oPk } = generateWallet();
    insertWallet({ address: OWNER, chain: "eip155:8453", encryptedKey: encryptPrivateKey(oPk), claimToken: "ctk_ow3" });
    claimWallet(OWNER, "ctk_ow3", OWNER);

    const createResult = createFundRequest(agentWallet.address, { amount: "50.00", reason: "big ask" }, OWNER);
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;
    const requestId = createResult.data.id;

    mockGetUsdcBalance.mockResolvedValue({ balance: "5.00", funded: true }); // less than 50.00

    const result = await approveFundRequest(requestId, OWNER);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(422);
      expect(result.code).toBe("insufficient_balance");
    }
  });
});

// ─── Deny fund request ────────────────────────────────────────────────────

describe("denyFundRequest — success", () => {
  it("returns status denied", () => {
    const agent = makeWallet(OWNER);
    const createResult = createFundRequest(agent.address, { amount: "5.00", reason: "test" }, OWNER);
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const result = denyFundRequest(createResult.data.id, OWNER);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe("denied");
      expect(result.data.reason).toBeNull();
      expect(result.data.id).toBe(createResult.data.id);
      expect(typeof result.data.deniedAt).toBe("string");
    }
  });

  it("returns denial reason when provided", () => {
    const agent = makeWallet(OWNER);
    const createResult = createFundRequest(agent.address, { amount: "5.00", reason: "test" }, OWNER);
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const result = denyFundRequest(createResult.data.id, OWNER, "Budget exceeded");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.reason).toBe("Budget exceeded");
    }
  });
});

describe("denyFundRequest — not owner", () => {
  it("returns 403 when caller does not own the wallet", () => {
    const agent = makeWallet(OWNER);
    const createResult = createFundRequest(agent.address, { amount: "5.00", reason: "test" }, OWNER);
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const result = denyFundRequest(createResult.data.id, OTHER);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
    }
  });
});

describe("denyFundRequest — already denied", () => {
  it("returns 409 when denying a non-pending request", () => {
    const agent = makeWallet(OWNER);
    const createResult = createFundRequest(agent.address, { amount: "5.00", reason: "test" }, OWNER);
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;
    const id = createResult.data.id;

    // First deny succeeds
    const first = denyFundRequest(id, OWNER);
    expect(first.ok).toBe(true);

    // Second deny should fail
    const second = denyFundRequest(id, OWNER);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.status).toBe(409);
    }
  });
});

describe("denyFundRequest — not found", () => {
  it("returns 404 for non-existent request ID", () => {
    const result = denyFundRequest("fr_nonexist", OWNER);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
    }
  });
});
