import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../src/stalwart", () => ({
  StalwartError: class StalwartError extends Error {
    statusCode: number;
    code: string;
    constructor(statusCode: number, code: string, message: string) {
      super(message);
      this.name = "StalwartError";
      this.statusCode = statusCode;
      this.code = code;
    }
  },
  createPrincipal: vi.fn(),
  deletePrincipal: vi.fn(),
}));

vi.mock("../src/db", () => {
  const rows = new Map<string, Record<string, unknown>>();
  return {
    insertMailbox: vi.fn((params: Record<string, unknown>) => {
      rows.set(params.id as string, { ...params, status: "active" });
    }),
    getMailboxById: vi.fn((id: string) => rows.get(id) ?? null),
    getMailboxesByOwner: vi.fn((owner: string, limit: number, _offset: number) => {
      return [...rows.values()]
        .filter((r) => r.owner_wallet === owner && r.status === "active")
        .slice(0, limit);
    }),
    countMailboxesByOwner: vi.fn((owner: string) => {
      return [...rows.values()].filter((r) => r.owner_wallet === owner && r.status === "active")
        .length;
    }),
    deleteMailboxRow: vi.fn((id: string) => {
      rows.delete(id);
    }),
    _rows: rows,
  };
});

import { createMailbox, listMailboxes, getMailbox, deleteMailbox } from "../src/service";
import { createPrincipal, deletePrincipal, StalwartError } from "../src/stalwart";
import * as dbMock from "../src/db";

const WALLET_A = "0xaaa";
const WALLET_B = "0xbbb";

describe("relay service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // biome-ignore lint/suspicious/noExplicitAny: accessing mock internals
    ((dbMock as any)._rows as Map<string, unknown>).clear();
    process.env.RELAY_DEFAULT_DOMAIN = "relay.prim.sh";
  });

  describe("createMailbox", () => {
    it("creates mailbox with valid request", async () => {
      (createPrincipal as ReturnType<typeof vi.fn>).mockResolvedValue(42);

      const result = await createMailbox({}, WALLET_A);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.data.id).toMatch(/^mbx_[0-9a-f]{8}$/);
      expect(result.data.address).toMatch(/^[0-9a-f]{8}@relay\.prim\.sh$/);
      expect(result.data.username).toMatch(/^[0-9a-f]{8}$/);
      expect(result.data.domain).toBe("relay.prim.sh");
      expect(result.data.status).toBe("active");
      expect(result.data.created_at).toBeTruthy();
      expect(result.data.expires_at).toBeTruthy();

      expect(createPrincipal).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "individual",
          roles: ["user"],
        }),
      );
    });

    it("defaults domain to relay.prim.sh when not specified", async () => {
      (createPrincipal as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      const result = await createMailbox({}, WALLET_A);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.domain).toBe("relay.prim.sh");
      }
    });

    it("rejects invalid domain", async () => {
      const result = await createMailbox({ domain: "other.com" }, WALLET_A);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("invalid_request");
      }
    });

    it("returns stalwart error on upstream failure", async () => {
      (createPrincipal as ReturnType<typeof vi.fn>).mockRejectedValue(
        new StalwartError(500, "stalwart_error", "Internal server error"),
      );

      const result = await createMailbox({}, WALLET_A);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("stalwart_error");
      }
    });

    it("retries on username collision", async () => {
      (createPrincipal as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new StalwartError(409, "conflict", "Exists"))
        .mockResolvedValueOnce(42);

      const result = await createMailbox({}, WALLET_A);
      expect(result.ok).toBe(true);
      expect(createPrincipal).toHaveBeenCalledTimes(2);
    });

    it("fails after max collision retries", async () => {
      (createPrincipal as ReturnType<typeof vi.fn>).mockRejectedValue(
        new StalwartError(409, "conflict", "Exists"),
      );

      const result = await createMailbox({}, WALLET_A);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("conflict");
      }
      expect(createPrincipal).toHaveBeenCalledTimes(3);
    });
  });

  describe("listMailboxes", () => {
    it("returns only caller's mailboxes", async () => {
      (createPrincipal as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      await createMailbox({}, WALLET_A);
      await createMailbox({}, WALLET_A);
      await createMailbox({}, WALLET_B);

      const resultA = listMailboxes(WALLET_A, 1, 25);
      expect(resultA.total).toBe(2);
      expect(resultA.mailboxes.length).toBe(2);

      const resultB = listMailboxes(WALLET_B, 1, 25);
      expect(resultB.total).toBe(1);
    });

    it("paginates correctly", async () => {
      (createPrincipal as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      await createMailbox({}, WALLET_A);
      await createMailbox({}, WALLET_A);
      await createMailbox({}, WALLET_A);

      const result = listMailboxes(WALLET_A, 1, 2);
      expect(result.mailboxes.length).toBe(2);
      expect(result.total).toBe(3);
      expect(result.page).toBe(1);
      expect(result.per_page).toBe(2);
    });
  });

  describe("getMailbox", () => {
    it("returns mailbox owned by caller", async () => {
      (createPrincipal as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      const created = await createMailbox({}, WALLET_A);
      if (!created.ok) return;

      const result = getMailbox(created.data.id, WALLET_A);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.id).toBe(created.data.id);
      }
    });

    it("returns not_found for different wallet", async () => {
      (createPrincipal as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      const created = await createMailbox({}, WALLET_A);
      if (!created.ok) return;

      const result = getMailbox(created.data.id, WALLET_B);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("not_found");
      }
    });

    it("returns not_found for nonexistent mailbox", async () => {
      const result = getMailbox("mbx_00000000", WALLET_A);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("not_found");
      }
    });
  });

  describe("deleteMailbox", () => {
    it("deletes mailbox owned by caller", async () => {
      (createPrincipal as ReturnType<typeof vi.fn>).mockResolvedValue(1);
      (deletePrincipal as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const created = await createMailbox({}, WALLET_A);
      if (!created.ok) return;

      const result = await deleteMailbox(created.data.id, WALLET_A);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.id).toBe(created.data.id);
        expect(result.data.deleted).toBe(true);
      }

      expect(deletePrincipal).toHaveBeenCalled();

      const getResult = getMailbox(created.data.id, WALLET_A);
      expect(getResult.ok).toBe(false);
    });

    it("returns not_found for different wallet", async () => {
      (createPrincipal as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      const created = await createMailbox({}, WALLET_A);
      if (!created.ok) return;

      const result = await deleteMailbox(created.data.id, WALLET_B);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("not_found");
      }

      expect(deletePrincipal).not.toHaveBeenCalled();
    });

    it("returns stalwart error on upstream failure", async () => {
      (createPrincipal as ReturnType<typeof vi.fn>).mockResolvedValue(1);
      (deletePrincipal as ReturnType<typeof vi.fn>).mockRejectedValue(
        new StalwartError(500, "stalwart_error", "Failed"),
      );

      const created = await createMailbox({}, WALLET_A);
      if (!created.ok) return;

      const result = await deleteMailbox(created.data.id, WALLET_A);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("stalwart_error");
      }
    });
  });
});
