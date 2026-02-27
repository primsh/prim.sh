/**
 * W-10 fund request tests: create, list, approve (non-custodial), deny.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

// Set in-memory DB before any imports
process.env.WALLET_DB_PATH = ":memory:";

// Mock balance check
const { mockGetUsdcBalance } = vi.hoisted(() => ({
  mockGetUsdcBalance: vi.fn<[string], Promise<{ balance: string; funded: boolean }>>(),
}));

vi.mock("../src/balance.ts", () => ({
  getUsdcBalance: mockGetUsdcBalance,
}));

import { resetDb } from "../src/db.ts";
import {
  createFundRequest,
  listFundRequests,
  approveFundRequest,
  denyFundRequest,
} from "../src/service.ts";
import { registerTestWallet } from "./helpers.ts";

// Owner's identity address
const OWNER = "0x0wner000000000000000000000000000000000001";
const OTHER = "0x0ther000000000000000000000000000000000002";

beforeEach(() => {
  resetDb();
  mockGetUsdcBalance.mockReset();
});

afterEach(() => {
  resetDb();
});

// ─── Create fund request ──────────────────────────────────────────────────

describe("createFundRequest — valid", () => {
  it("returns request object with fr_ ID and status pending", () => {
    const { address } = registerTestWallet(OWNER);

    const result = createFundRequest(address, { amount: "5.00", reason: "Need funds" }, OWNER);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.id).toMatch(/^fr_[0-9a-f]{8}$/);
      expect(result.data.status).toBe("pending");
      expect(result.data.wallet_address).toBe(address);
      expect(result.data.amount).toBe("5.00");
      expect(result.data.reason).toBe("Need funds");
      expect(typeof result.data.created_at).toBe("string");
    }
  });
});

describe("createFundRequest — not owner", () => {
  it("returns 403 when caller does not own the wallet", () => {
    const { address } = registerTestWallet(OWNER);

    const result = createFundRequest(address, { amount: "5.00", reason: "Need funds" }, OTHER);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.code).toBe("forbidden");
    }
  });
});

describe("createFundRequest — validation", () => {
  it("returns 400 for zero amount", () => {
    const { address } = registerTestWallet(OWNER);
    const result = createFundRequest(address, { amount: "0", reason: "test" }, OWNER);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it("returns 400 for empty reason", () => {
    const { address } = registerTestWallet(OWNER);
    const result = createFundRequest(address, { amount: "1.00", reason: "" }, OWNER);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });
});

// ─── List fund requests ───────────────────────────────────────────────────

describe("listFundRequests — has requests", () => {
  it("returns array with pending requests", () => {
    const { address } = registerTestWallet(OWNER);
    createFundRequest(address, { amount: "5.00", reason: "first" }, OWNER);
    createFundRequest(address, { amount: "10.00", reason: "second" }, OWNER);

    const result = listFundRequests(address, OWNER, 20);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.data).toHaveLength(2);
      expect(result.data.data[0].status).toBe("pending");
      expect(result.data.pagination.cursor).toBeNull();
    }
  });
});

describe("listFundRequests — empty", () => {
  it("returns empty array when no requests exist", () => {
    const { address } = registerTestWallet(OWNER);

    const result = listFundRequests(address, OWNER, 20);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.data).toHaveLength(0);
      expect(result.data.pagination.cursor).toBeNull();
    }
  });
});

describe("listFundRequests — not owner", () => {
  it("returns 403 when caller does not own the wallet", () => {
    const { address } = registerTestWallet(OWNER);
    const result = listFundRequests(address, OTHER, 20);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });
});

// ─── Approve fund request (non-custodial) ────────────────────────────────

describe("approveFundRequest — success (non-custodial)", () => {
  it("returns status approved with fundingAddress and amount", () => {
    const { address } = registerTestWallet(OWNER);

    const createResult = createFundRequest(address, { amount: "5.00", reason: "Need funds" }, OWNER);
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;
    const requestId = createResult.data.id;

    const result = approveFundRequest(requestId, OWNER);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe("approved");
      expect(result.data.funding_address).toBe(address);
      expect(result.data.amount).toBe("5.00");
      expect(typeof result.data.chain).toBe("string");
      expect(result.data.id).toBe(requestId);
      expect(typeof result.data.approved_at).toBe("string");
    }
  });
});

describe("approveFundRequest — already approved", () => {
  it("returns 409 when approving a non-pending request", () => {
    const { address } = registerTestWallet(OWNER);

    const createResult = createFundRequest(address, { amount: "5.00", reason: "test" }, OWNER);
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;
    const requestId = createResult.data.id;

    // First approve succeeds
    const first = approveFundRequest(requestId, OWNER);
    expect(first.ok).toBe(true);

    // Second approve should fail
    const second = approveFundRequest(requestId, OWNER);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.status).toBe(409);
    }
  });
});

// ─── Deny fund request ────────────────────────────────────────────────────

describe("denyFundRequest — success", () => {
  it("returns status denied", () => {
    const { address } = registerTestWallet(OWNER);
    const createResult = createFundRequest(address, { amount: "5.00", reason: "test" }, OWNER);
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const result = denyFundRequest(createResult.data.id, OWNER);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe("denied");
      expect(result.data.reason).toBeNull();
      expect(result.data.id).toBe(createResult.data.id);
      expect(typeof result.data.denied_at).toBe("string");
    }
  });

  it("returns denial reason when provided", () => {
    const { address } = registerTestWallet(OWNER);
    const createResult = createFundRequest(address, { amount: "5.00", reason: "test" }, OWNER);
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
    const { address } = registerTestWallet(OWNER);
    const createResult = createFundRequest(address, { amount: "5.00", reason: "test" }, OWNER);
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
    const { address } = registerTestWallet(OWNER);
    const createResult = createFundRequest(address, { amount: "5.00", reason: "test" }, OWNER);
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;
    const id = createResult.data.id;

    const first = denyFundRequest(id, OWNER);
    expect(first.ok).toBe(true);

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
