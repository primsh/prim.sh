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

vi.mock("../src/crypto", () => ({
  encryptPassword: vi.fn((p: string) => `encrypted:${p}`),
}));

vi.mock("../src/jmap", () => {
  class JmapError extends Error {
    statusCode: number;
    code: string;
    constructor(statusCode: number, code: string, message: string) {
      super(message);
      this.name = "JmapError";
      this.statusCode = statusCode;
      this.code = code;
    }
  }
  return {
    JmapError,
    discoverSession: vi.fn().mockResolvedValue({
      apiUrl: "https://mail.relay.prim.sh/jmap/",
      accountId: "acc_1",
      identityId: "id_1",
      inboxId: "mb_inbox",
      draftsId: "mb_drafts",
      sentId: "mb_sent",
    }),
    buildBasicAuth: vi.fn(() => "Basic mock"),
    queryEmails: vi.fn(),
    getEmail: vi.fn(),
    sendEmail: vi.fn(),
  };
});

vi.mock("../src/context", () => ({
  getJmapContext: vi.fn(),
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

import { createMailbox, listMailboxes, getMailbox, deleteMailbox, listMessages, getMessage, sendMessage } from "../src/service";
import { createPrincipal, deletePrincipal, StalwartError } from "../src/stalwart";
import { JmapError, queryEmails, getEmail, sendEmail } from "../src/jmap";
import { getJmapContext } from "../src/context";
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

  describe("listMessages", () => {
    const MOCK_CTX = {
      apiUrl: "https://mail.relay.prim.sh/jmap/",
      accountId: "acc_1",
      identityId: "id_1",
      inboxId: "mb_inbox",
      draftsId: "mb_drafts",
      sentId: "mb_sent",
      authHeader: "Basic mock",
    };

    it("returns messages for valid mailbox and wallet", async () => {
      (getJmapContext as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        data: MOCK_CTX,
      });
      (queryEmails as ReturnType<typeof vi.fn>).mockResolvedValue({
        messages: [
          {
            id: "e1",
            from: [{ name: "Alice", email: "[email protected]" }],
            to: [{ name: null, email: "[email protected]" }],
            subject: "Hello",
            receivedAt: "2026-02-25T10:00:00Z",
            size: 1234,
            hasAttachment: false,
            preview: "Hey...",
          },
        ],
        total: 1,
        position: 0,
      });

      const result = await listMessages("mbx_test", WALLET_A, {});

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.messages).toHaveLength(1);
      expect(result.data.messages[0].from.email).toBe("[email protected]");
      expect(result.data.total).toBe(1);
    });

    it("returns not_found for wrong wallet", async () => {
      (getJmapContext as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 404,
        code: "not_found",
        message: "Mailbox not found",
      });

      const result = await listMessages("mbx_test", WALLET_B, {});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("not_found");
      }
    });

    it("passes sentId when folder=sent", async () => {
      (getJmapContext as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        data: MOCK_CTX,
      });
      (queryEmails as ReturnType<typeof vi.fn>).mockResolvedValue({
        messages: [],
        total: 0,
        position: 0,
      });

      await listMessages("mbx_test", WALLET_A, { folder: "sent" });

      expect(queryEmails).toHaveBeenCalledWith(
        MOCK_CTX,
        expect.objectContaining({ mailboxId: "mb_sent" }),
      );
    });

    it("omits mailboxId when folder=all", async () => {
      (getJmapContext as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        data: MOCK_CTX,
      });
      (queryEmails as ReturnType<typeof vi.fn>).mockResolvedValue({
        messages: [],
        total: 0,
        position: 0,
      });

      await listMessages("mbx_test", WALLET_A, { folder: "all" });

      expect(queryEmails).toHaveBeenCalledWith(
        MOCK_CTX,
        expect.objectContaining({ mailboxId: undefined }),
      );
    });

    it("clamps limit to 100", async () => {
      (getJmapContext as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        data: MOCK_CTX,
      });
      (queryEmails as ReturnType<typeof vi.fn>).mockResolvedValue({
        messages: [],
        total: 0,
        position: 0,
      });

      await listMessages("mbx_test", WALLET_A, { limit: 200 });

      expect(queryEmails).toHaveBeenCalledWith(
        MOCK_CTX,
        expect.objectContaining({ limit: 100 }),
      );
    });

    it("returns jmap_error on JMAP failure", async () => {
      (getJmapContext as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        data: MOCK_CTX,
      });
      (queryEmails as ReturnType<typeof vi.fn>).mockRejectedValue(
        new JmapError(500, "jmap_error", "Server error"),
      );

      const result = await listMessages("mbx_test", WALLET_A, {});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("jmap_error");
      }
    });
  });

  describe("getMessage", () => {
    const MOCK_CTX = {
      apiUrl: "https://mail.relay.prim.sh/jmap/",
      accountId: "acc_1",
      identityId: "id_1",
      inboxId: "mb_inbox",
      draftsId: "mb_drafts",
      sentId: "mb_sent",
      authHeader: "Basic mock",
    };

    it("returns full message with body", async () => {
      (getJmapContext as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        data: MOCK_CTX,
      });
      (getEmail as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "e1",
        from: [{ name: "Alice", email: "[email protected]" }],
        to: [{ name: null, email: "[email protected]" }],
        cc: [],
        subject: "Hello",
        receivedAt: "2026-02-25T10:00:00Z",
        size: 1234,
        hasAttachment: false,
        preview: "Hey...",
        textBody: [{ partId: "1" }],
        htmlBody: [{ partId: "2" }],
        bodyValues: {
          "1": { value: "Hey there" },
          "2": { value: "<p>Hey there</p>" },
        },
      });

      const result = await getMessage("mbx_test", WALLET_A, "e1");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.id).toBe("e1");
      expect(result.data.textBody).toBe("Hey there");
      expect(result.data.htmlBody).toBe("<p>Hey there</p>");
      expect(result.data.from.email).toBe("[email protected]");
      expect(result.data.cc).toEqual([]);
    });

    it("returns not_found for wrong wallet", async () => {
      (getJmapContext as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 404,
        code: "not_found",
        message: "Mailbox not found",
      });

      const result = await getMessage("mbx_test", WALLET_B, "e1");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("not_found");
      }
    });

    it("returns not_found when message does not exist", async () => {
      (getJmapContext as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        data: MOCK_CTX,
      });
      (getEmail as ReturnType<typeof vi.fn>).mockRejectedValue(
        new JmapError(404, "not_found", "Message not found"),
      );

      const result = await getMessage("mbx_test", WALLET_A, "e_missing");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("not_found");
      }
    });
  });

  describe("sendMessage", () => {
    const MOCK_CTX = {
      apiUrl: "https://mail.relay.prim.sh/jmap/",
      accountId: "acc_1",
      identityId: "id_1",
      inboxId: "mb_inbox",
      draftsId: "mb_drafts",
      sentId: "mb_sent",
      authHeader: "Basic mock",
      address: "[email protected]",
    };

    it("returns message_id and status sent for valid request", async () => {
      (getJmapContext as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        data: MOCK_CTX,
      });
      (sendEmail as ReturnType<typeof vi.fn>).mockResolvedValue({
        messageId: "email_abc",
        submissionId: "sub_xyz",
      });

      const result = await sendMessage("mbx_test", WALLET_A, {
        to: "[email protected]",
        subject: "Hello",
        body: "Hi there",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.message_id).toBe("email_abc");
      expect(result.data.status).toBe("sent");
    });

    it("sets from address from mailbox address, not request", async () => {
      (getJmapContext as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        data: MOCK_CTX,
      });
      (sendEmail as ReturnType<typeof vi.fn>).mockResolvedValue({
        messageId: "email_abc",
        submissionId: "sub_xyz",
      });

      await sendMessage("mbx_test", WALLET_A, {
        to: "[email protected]",
        subject: "Hello",
        body: "Hi",
      });

      expect(sendEmail).toHaveBeenCalledWith(
        MOCK_CTX,
        expect.objectContaining({
          from: { name: null, email: "[email protected]" },
        }),
      );
    });

    it("returns not_found for wrong wallet", async () => {
      (getJmapContext as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 404,
        code: "not_found",
        message: "Mailbox not found",
      });

      const result = await sendMessage("mbx_test", WALLET_B, {
        to: "[email protected]",
        subject: "Hello",
        body: "Hi",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("not_found");
      }
    });

    it("returns invalid_request when to is empty", async () => {
      const result = await sendMessage("mbx_test", WALLET_A, {
        to: "",
        subject: "Hello",
        body: "Hi",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("invalid_request");
        expect(result.message).toContain("to");
      }
    });

    it("returns invalid_request when both body and html are missing", async () => {
      const result = await sendMessage("mbx_test", WALLET_A, {
        to: "[email protected]",
        subject: "Hello",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("invalid_request");
        expect(result.message).toContain("body");
      }
    });

    it("returns jmap_error when JMAP call fails", async () => {
      (getJmapContext as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        data: MOCK_CTX,
      });
      (sendEmail as ReturnType<typeof vi.fn>).mockRejectedValue(
        new JmapError(502, "jmap_error", "Submission failed"),
      );

      const result = await sendMessage("mbx_test", WALLET_A, {
        to: "[email protected]",
        subject: "Hello",
        body: "Hi",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("jmap_error");
      }
    });
  });
});
