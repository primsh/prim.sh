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
  createDomainPrincipal: vi.fn(),
  deleteDomainPrincipal: vi.fn(),
  generateDkim: vi.fn(),
  getDnsRecords: vi.fn(() => []),
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
      apiUrl: "https://mail.prim.sh/jmap/",
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

vi.mock("../src/expiry", () => ({
  expireMailbox: vi.fn(async (row: Record<string, unknown>) => {
    // Simulate marking the row as expired in the mock store
    if (row.status === "active" && (row.expires_at as number) < Date.now()) {
      row.status = "expired";
    }
  }),
}));

vi.mock("../src/webhook-delivery", () => ({
  verifySignature: vi.fn(() => true),
  dispatchWebhookDeliveries: vi.fn(),
}));

vi.mock("../src/dns-check", () => ({
  verifyDns: vi.fn(),
}));

vi.mock("../src/db", () => {
  const rows = new Map<string, Record<string, unknown>>();
  const webhooks = new Map<string, Record<string, unknown>>();
  return {
    insertMailbox: vi.fn((params: Record<string, unknown>) => {
      rows.set(params.id as string, { ...params, status: "active", stalwart_cleanup_failed: 0, cleanup_attempts: 0 });
    }),
    getMailboxById: vi.fn((id: string) => rows.get(id) ?? null),
    getMailboxByAddress: vi.fn((address: string) => {
      return [...rows.values()].find((r) => r.address === address) ?? null;
    }),
    getMailboxesByOwner: vi.fn((owner: string, limit: number, _offset: number) => {
      return [...rows.values()]
        .filter((r) => r.owner_wallet === owner && r.status === "active")
        .slice(0, limit);
    }),
    getMailboxesByOwnerAll: vi.fn((owner: string, limit: number, _offset: number) => {
      return [...rows.values()]
        .filter((r) => r.owner_wallet === owner && (r.status === "active" || r.status === "expired"))
        .slice(0, limit);
    }),
    countMailboxesByOwner: vi.fn((owner: string) => {
      return [...rows.values()].filter((r) => r.owner_wallet === owner && r.status === "active")
        .length;
    }),
    countMailboxesByOwnerAll: vi.fn((owner: string) => {
      return [...rows.values()].filter((r) => r.owner_wallet === owner && (r.status === "active" || r.status === "expired"))
        .length;
    }),
    deleteMailboxRow: vi.fn((id: string) => {
      rows.delete(id);
    }),
    updateExpiresAt: vi.fn((id: string, expiresAt: number | null) => {
      const row = rows.get(id);
      if (row) row.expires_at = expiresAt;
    }),
    insertWebhook: vi.fn((params: Record<string, unknown>) => {
      webhooks.set(params.id as string, { ...params, status: "active", consecutive_failures: 0 });
    }),
    getWebhooksByMailbox: vi.fn((mailboxId: string) => {
      return [...webhooks.values()].filter((w) => w.mailbox_id === mailboxId && w.status === "active");
    }),
    getWebhookById: vi.fn((id: string) => webhooks.get(id) ?? null),
    deleteWebhookRow: vi.fn((id: string) => { webhooks.delete(id); }),
    getDomainByName: vi.fn(() => null),
    getDomainById: vi.fn(() => null),
    insertDomain: vi.fn(),
    getDomainsByOwner: vi.fn(() => []),
    countDomainsByOwner: vi.fn(() => 0),
    updateDomainVerification: vi.fn(),
    updateDomainProvisioned: vi.fn(),
    deleteDomainRow: vi.fn(),
    countMailboxesByDomain: vi.fn(() => 0),
    _rows: rows,
    _webhooks: webhooks,
  };
});

import { createMailbox, listMailboxes, getMailbox, deleteMailbox, listMessages, getMessage, sendMessage, renewMailbox, registerWebhook, listWebhooks, deleteWebhook, handleIngestEvent } from "../src/service";
import { verifySignature, dispatchWebhookDeliveries } from "../src/webhook-delivery";
import { createPrincipal, deletePrincipal, StalwartError } from "../src/stalwart";
import { JmapError, queryEmails, getEmail, sendEmail } from "../src/jmap";
import { getJmapContext } from "../src/context";
import * as dbMock from "../src/db";

const WALLET_A = "0xaaa";
const WALLET_B = "0xbbb";

/** Seed a mock mailbox row directly in the DB mock store */
function seedRow(id: string, wallet: string, overrides: Record<string, unknown> = {}) {
  // biome-ignore lint/suspicious/noExplicitAny: accessing mock internals
  ((dbMock as any)._rows as Map<string, Record<string, unknown>>).set(id, {
    id,
    stalwart_name: "testuser",
    address: "[email protected]",
    domain: "email.prim.sh",
    owner_wallet: wallet,
    status: "active",
    password_hash: "fakehash",
    password_enc: "encrypted",
    quota: 0,
    created_at: Date.now(),
    expires_at: Date.now() + 86_400_000,
    jmap_api_url: null,
    jmap_account_id: null,
    jmap_identity_id: null,
    jmap_inbox_id: null,
    jmap_drafts_id: null,
    jmap_sent_id: null,
    stalwart_cleanup_failed: 0,
    cleanup_attempts: 0,
    ...overrides,
  });
}

describe("email service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // biome-ignore lint/suspicious/noExplicitAny: accessing mock internals
    ((dbMock as any)._rows as Map<string, unknown>).clear();
    // biome-ignore lint/suspicious/noExplicitAny: accessing mock internals
    ((dbMock as any)._webhooks as Map<string, unknown>).clear();
    process.env.EMAIL_DEFAULT_DOMAIN = "email.prim.sh";
    process.env.NODE_ENV = "test";
  });

  describe("createMailbox", () => {
    it("creates mailbox with valid request", async () => {
      (createPrincipal as ReturnType<typeof vi.fn>).mockResolvedValue(42);

      const result = await createMailbox({}, WALLET_A);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.data.id).toMatch(/^mbx_[0-9a-f]{8}$/);
      expect(result.data.address).toMatch(/^[0-9a-f]{8}@email\.prim\.sh$/);
      expect(result.data.username).toMatch(/^[0-9a-f]{8}$/);
      expect(result.data.domain).toBe("email.prim.sh");
      expect(result.data.status).toBe("active");
      expect(result.data.created_at).toBeTruthy();
      expect(result.data.expires_at).toBeNull();

      expect(createPrincipal).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "individual",
          roles: ["user"],
        }),
      );
    });

    it("defaults domain to email.prim.sh when not specified", async () => {
      (createPrincipal as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      const result = await createMailbox({}, WALLET_A);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.domain).toBe("email.prim.sh");
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

  describe("createMailbox with custom username", () => {
    it("creates mailbox with valid custom username", async () => {
      (createPrincipal as ReturnType<typeof vi.fn>).mockResolvedValue(42);

      const result = await createMailbox({ username: "my-agent" }, WALLET_A);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.address).toBe("my-agent@email.prim.sh");
      expect(result.data.username).toBe("my-agent");
      expect(createPrincipal).toHaveBeenCalledTimes(1);
    });

    it("normalizes username to lowercase", async () => {
      (createPrincipal as ReturnType<typeof vi.fn>).mockResolvedValue(42);

      const result = await createMailbox({ username: "MyAgent" }, WALLET_A);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.username).toBe("myagent");
    });

    it("rejects username shorter than 3 chars", async () => {
      const result = await createMailbox({ username: "ab" }, WALLET_A);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("invalid_request");
        expect(result.message).toContain("3-32");
      }
    });

    it("rejects username longer than 32 chars", async () => {
      const result = await createMailbox({ username: "a".repeat(33) }, WALLET_A);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("invalid_request");
        expect(result.message).toContain("3-32");
      }
    });

    it("rejects username starting with hyphen", async () => {
      const result = await createMailbox({ username: "-agent" }, WALLET_A);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("invalid_request");
    });

    it("rejects username with consecutive dots", async () => {
      const result = await createMailbox({ username: "my..agent" }, WALLET_A);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("invalid_request");
        expect(result.message).toContain("consecutive");
      }
    });

    it("rejects username with invalid characters", async () => {
      const result = await createMailbox({ username: "my agent!" }, WALLET_A);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("invalid_request");
    });

    it("returns username_taken on conflict (no retry)", async () => {
      (createPrincipal as ReturnType<typeof vi.fn>).mockRejectedValue(
        new StalwartError(409, "conflict", "Exists"),
      );

      const result = await createMailbox({ username: "taken-name" }, WALLET_A);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("username_taken");
        expect(result.status).toBe(409);
      }
      // Custom username path should NOT retry
      expect(createPrincipal).toHaveBeenCalledTimes(1);
    });

    it("random username still works with retry loop", async () => {
      (createPrincipal as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new StalwartError(409, "conflict", "Exists"))
        .mockResolvedValueOnce(42);

      const result = await createMailbox({}, WALLET_A);
      expect(result.ok).toBe(true);
      expect(createPrincipal).toHaveBeenCalledTimes(2);
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

      const result = await getMailbox(created.data.id, WALLET_A);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.id).toBe(created.data.id);
      }
    });

    it("returns not_found for different wallet", async () => {
      (createPrincipal as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      const created = await createMailbox({}, WALLET_A);
      if (!created.ok) return;

      const result = await getMailbox(created.data.id, WALLET_B);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("not_found");
      }
    });

    it("returns not_found for nonexistent mailbox", async () => {
      const result = await getMailbox("mbx_00000000", WALLET_A);
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

      const getResult = await getMailbox(created.data.id, WALLET_A);
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
      apiUrl: "https://mail.prim.sh/jmap/",
      accountId: "acc_1",
      identityId: "id_1",
      inboxId: "mb_inbox",
      draftsId: "mb_drafts",
      sentId: "mb_sent",
      authHeader: "Basic mock",
      address: "[email protected]",
    };

    it("returns messages for valid mailbox and wallet", async () => {
      seedRow("mbx_test", WALLET_A);
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
      seedRow("mbx_test", WALLET_A);
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
      seedRow("mbx_test", WALLET_A);
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
      seedRow("mbx_test", WALLET_A);
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
      seedRow("mbx_test", WALLET_A);
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
      apiUrl: "https://mail.prim.sh/jmap/",
      accountId: "acc_1",
      identityId: "id_1",
      inboxId: "mb_inbox",
      draftsId: "mb_drafts",
      sentId: "mb_sent",
      authHeader: "Basic mock",
      address: "[email protected]",
    };

    it("returns full message with body", async () => {
      seedRow("mbx_test", WALLET_A);
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
      seedRow("mbx_test", WALLET_A);
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
      apiUrl: "https://mail.prim.sh/jmap/",
      accountId: "acc_1",
      identityId: "id_1",
      inboxId: "mb_inbox",
      draftsId: "mb_drafts",
      sentId: "mb_sent",
      authHeader: "Basic mock",
      address: "[email protected]",
    };

    it("returns message_id and status sent for valid request", async () => {
      seedRow("mbx_test", WALLET_A);
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
      seedRow("mbx_test", WALLET_A);
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
      seedRow("mbx_test", WALLET_A);
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

  describe("createMailbox with ttl_ms (R-8)", () => {
    it("uses custom ttl_ms when provided", async () => {
      (createPrincipal as ReturnType<typeof vi.fn>).mockResolvedValue(42);

      const before = Date.now();
      const result = await createMailbox({ ttl_ms: 3_600_000 }, WALLET_A);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const expiresAt = new Date(result.data.expires_at as string).getTime();
      expect(expiresAt).toBeGreaterThanOrEqual(before + 3_600_000);
      expect(expiresAt).toBeLessThan(before + 3_600_000 + 5_000);
    });

    it("rejects ttl_ms below minimum", async () => {
      const result = await createMailbox({ ttl_ms: 100 }, WALLET_A);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("invalid_request");
        expect(result.message).toContain("ttl_ms");
      }
    });

    it("accepts large ttl_ms (no max limit)", async () => {
      (createPrincipal as ReturnType<typeof vi.fn>).mockResolvedValue(42);

      const result = await createMailbox({ ttl_ms: 999_999_999 }, WALLET_A);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.expires_at).not.toBeNull();
    });

    it("creates permanent mailbox (null expires_at) when ttl_ms not provided", async () => {
      (createPrincipal as ReturnType<typeof vi.fn>).mockResolvedValue(42);

      const result = await createMailbox({}, WALLET_A);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.expires_at).toBeNull();
    });
  });

  describe("renewMailbox (R-8)", () => {
    it("extends expires_at on active mailbox", async () => {
      (createPrincipal as ReturnType<typeof vi.fn>).mockResolvedValue(1);
      const created = await createMailbox({}, WALLET_A);
      if (!created.ok) return;

      const before = Date.now();
      const result = await renewMailbox(created.data.id, WALLET_A, { ttl_ms: 3_600_000 });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const newExpiry = new Date(result.data.expires_at as string).getTime();
      expect(newExpiry).toBeGreaterThanOrEqual(before + 3_600_000);
    });

    it("returns expired for expired mailbox", async () => {
      (createPrincipal as ReturnType<typeof vi.fn>).mockResolvedValue(1);
      const created = await createMailbox({}, WALLET_A);
      if (!created.ok) return;

      // Manually expire the row in mock store
      // biome-ignore lint/suspicious/noExplicitAny: accessing mock internals
      const row = ((dbMock as any)._rows as Map<string, Record<string, unknown>>).get(created.data.id);
      if (row) {
        row.expires_at = Date.now() - 1_000;
      }

      const result = await renewMailbox(created.data.id, WALLET_A, {});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("expired");
        expect(result.status).toBe(410);
      }
    });

    it("returns not_found for non-owned mailbox", async () => {
      const result = await renewMailbox("mbx_nonexist", WALLET_A, {});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("not_found");
      }
    });

    it("rejects invalid ttl_ms", async () => {
      (createPrincipal as ReturnType<typeof vi.fn>).mockResolvedValue(1);
      const created = await createMailbox({}, WALLET_A);
      if (!created.ok) return;

      const result = await renewMailbox(created.data.id, WALLET_A, { ttl_ms: 100 });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("invalid_request");
      }
    });

    it("makes ephemeral mailbox permanent when no ttl_ms", async () => {
      (createPrincipal as ReturnType<typeof vi.fn>).mockResolvedValue(1);
      const created = await createMailbox({ ttl_ms: 3_600_000 }, WALLET_A);
      if (!created.ok) return;
      expect(created.data.expires_at).not.toBeNull();

      const result = await renewMailbox(created.data.id, WALLET_A, {});

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.expires_at).toBeNull();
    });

    it("is no-op when permanent mailbox renewed with no ttl_ms", async () => {
      (createPrincipal as ReturnType<typeof vi.fn>).mockResolvedValue(1);
      const created = await createMailbox({}, WALLET_A);
      if (!created.ok) return;
      expect(created.data.expires_at).toBeNull();

      const result = await renewMailbox(created.data.id, WALLET_A, {});

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.expires_at).toBeNull();
    });
  });

  describe("registerWebhook (R-7)", () => {
    it("creates webhook with wh_ prefix ID", async () => {
      seedRow("mbx_test", WALLET_A);

      const result = await registerWebhook("mbx_test", WALLET_A, {
        url: "http://localhost:3000/hook",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.id).toMatch(/^wh_[0-9a-f]{8}$/);
      expect(result.data.url).toBe("http://localhost:3000/hook");
      expect(result.data.events).toEqual(["message.received"]);
      expect(result.data.status).toBe("active");
    });

    it("returns not_found for wrong wallet", async () => {
      seedRow("mbx_test", WALLET_A);

      const result = await registerWebhook("mbx_test", WALLET_B, {
        url: "http://localhost:3000/hook",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("not_found");
    });

    it("rejects non-HTTPS URLs in production", async () => {
      seedRow("mbx_test", WALLET_A);
      process.env.NODE_ENV = "";
      process.env.EMAIL_ALLOW_HTTP_WEBHOOKS = "0";

      const result = await registerWebhook("mbx_test", WALLET_A, {
        url: "http://example.com/hook",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("invalid_request");

      // Restore
      process.env.NODE_ENV = "test";
    });

    it("rejects unsupported event types", async () => {
      seedRow("mbx_test", WALLET_A);

      const result = await registerWebhook("mbx_test", WALLET_A, {
        url: "http://localhost:3000/hook",
        events: ["message.bounced"],
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toContain("message.bounced");
    });

    it("encrypts secret when provided", async () => {
      seedRow("mbx_test", WALLET_A);

      const result = await registerWebhook("mbx_test", WALLET_A, {
        url: "http://localhost:3000/hook",
        secret: "my-secret",
      });

      expect(result.ok).toBe(true);
      // Secret should be encrypted in the DB (mock encrypts as "encrypted:...")
      // biome-ignore lint/suspicious/noExplicitAny: accessing mock internals
      const webhookStore = (dbMock as any)._webhooks as Map<string, Record<string, unknown>>;
      const stored = [...webhookStore.values()][0];
      expect(stored?.secret_enc).toBe("encrypted:my-secret");
    });

    it("defaults events to message.received", async () => {
      seedRow("mbx_test", WALLET_A);

      const result = await registerWebhook("mbx_test", WALLET_A, {
        url: "http://localhost:3000/hook",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.events).toEqual(["message.received"]);
    });
  });

  describe("listWebhooks (R-7)", () => {
    it("returns webhooks for owned mailbox", async () => {
      seedRow("mbx_test", WALLET_A);
      await registerWebhook("mbx_test", WALLET_A, { url: "http://localhost:3000/hook1" });
      await registerWebhook("mbx_test", WALLET_A, { url: "http://localhost:3000/hook2" });

      const result = listWebhooks("mbx_test", WALLET_A);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.webhooks).toHaveLength(2);
      expect(result.data.total).toBe(2);
    });

    it("returns not_found for wrong wallet", () => {
      seedRow("mbx_test", WALLET_A);

      const result = listWebhooks("mbx_test", WALLET_B);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("not_found");
    });
  });

  describe("deleteWebhook (R-7)", () => {
    it("deletes webhook and returns success", async () => {
      seedRow("mbx_test", WALLET_A);
      const created = await registerWebhook("mbx_test", WALLET_A, {
        url: "http://localhost:3000/hook",
      });
      if (!created.ok) return;

      const result = deleteWebhook("mbx_test", WALLET_A, created.data.id);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.id).toBe(created.data.id);
      expect(result.data.deleted).toBe(true);
    });

    it("returns not_found for wrong wallet", async () => {
      seedRow("mbx_test", WALLET_A);
      const created = await registerWebhook("mbx_test", WALLET_A, {
        url: "http://localhost:3000/hook",
      });
      if (!created.ok) return;

      const result = deleteWebhook("mbx_test", WALLET_B, created.data.id);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("not_found");
    });

    it("returns not_found for non-existent webhook ID", () => {
      seedRow("mbx_test", WALLET_A);

      const result = deleteWebhook("mbx_test", WALLET_A, "wh_nonexist");

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("not_found");
    });
  });

  describe("handleIngestEvent (R-7)", () => {
    it("rejects invalid HMAC signature", async () => {
      process.env.STALWART_WEBHOOK_SECRET = "test-secret";
      (verifySignature as ReturnType<typeof vi.fn>).mockReturnValue(false);

      const result = await handleIngestEvent('{"type":"message-ingest.ham"}', "bad-sig");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(401);
        expect(result.code).toBe("forbidden");
      }

      process.env.STALWART_WEBHOOK_SECRET = "";
    });

    it("ignores events for unknown addresses", async () => {
      const event = JSON.stringify({
        type: "message-ingest.ham",
        data: { rcptTo: ["[email protected]"] },
      });

      const result = await handleIngestEvent(event, null);

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.accepted).toBe(true);
      expect(dispatchWebhookDeliveries).not.toHaveBeenCalled();
    });

    it("dispatches delivery for active webhooks", async () => {
      seedRow("mbx_test", WALLET_A, { address: "[email protected]" });
      await registerWebhook("mbx_test", WALLET_A, { url: "http://localhost:3000/hook" });

      const event = JSON.stringify({
        type: "message-ingest.ham",
        data: { rcptTo: ["[email protected]"], subject: "Hello", from: "[email protected]" },
      });

      const result = await handleIngestEvent(event, null);

      expect(result.ok).toBe(true);
      expect(dispatchWebhookDeliveries).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ url: "http://localhost:3000/hook" })]),
        expect.objectContaining({ event: "message.received", mailbox_id: "mbx_test" }),
      );
    });

    it("does nothing if no webhooks registered", async () => {
      seedRow("mbx_test", WALLET_A, { address: "[email protected]" });

      const event = JSON.stringify({
        type: "message-ingest.ham",
        data: { rcptTo: ["[email protected]"] },
      });

      const result = await handleIngestEvent(event, null);

      expect(result.ok).toBe(true);
      expect(dispatchWebhookDeliveries).not.toHaveBeenCalled();
    });
  });

  describe("permanent mailboxes", () => {
    it("permanent mailbox is never expired", async () => {
      seedRow("mbx_perm", WALLET_A, { expires_at: null });

      const result = await getMailbox("mbx_perm", WALLET_A);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.status).toBe("active");
      expect(result.data.expires_at).toBeNull();
    });

    it("listMessages works on permanent mailbox", async () => {
      seedRow("mbx_perm", WALLET_A, { expires_at: null });
      (getJmapContext as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        data: {
          apiUrl: "https://mail.prim.sh/jmap/",
          accountId: "acc_1",
          identityId: "id_1",
          inboxId: "mb_inbox",
          draftsId: "mb_drafts",
          sentId: "mb_sent",
          authHeader: "Basic mock",
          address: "[email protected]",
        },
      });
      (queryEmails as ReturnType<typeof vi.fn>).mockResolvedValue({
        messages: [],
        total: 0,
        position: 0,
      });

      const result = await listMessages("mbx_perm", WALLET_A, {});

      expect(result.ok).toBe(true);
    });
  });

  describe("lazy expiry (R-8)", () => {
    it("getMailbox returns expired status for past-expiry active row", async () => {
      (createPrincipal as ReturnType<typeof vi.fn>).mockResolvedValue(1);
      const created = await createMailbox({}, WALLET_A);
      if (!created.ok) return;

      // Manually set expires_at to past
      // biome-ignore lint/suspicious/noExplicitAny: accessing mock internals
      const row = ((dbMock as any)._rows as Map<string, Record<string, unknown>>).get(created.data.id);
      if (row) {
        row.expires_at = Date.now() - 1_000;
      }

      const result = await getMailbox(created.data.id, WALLET_A);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.status).toBe("expired");
    });

    it("listMessages returns 410 for expired mailbox", async () => {
      (createPrincipal as ReturnType<typeof vi.fn>).mockResolvedValue(1);
      const created = await createMailbox({}, WALLET_A);
      if (!created.ok) return;

      // biome-ignore lint/suspicious/noExplicitAny: accessing mock internals
      const row = ((dbMock as any)._rows as Map<string, Record<string, unknown>>).get(created.data.id);
      if (row) {
        row.expires_at = Date.now() - 1_000;
      }

      const result = await listMessages(created.data.id, WALLET_A, {});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("expired");
        expect(result.status).toBe(410);
      }
    });

    it("sendMessage returns 410 for expired mailbox", async () => {
      (createPrincipal as ReturnType<typeof vi.fn>).mockResolvedValue(1);
      const created = await createMailbox({}, WALLET_A);
      if (!created.ok) return;

      // biome-ignore lint/suspicious/noExplicitAny: accessing mock internals
      const row = ((dbMock as any)._rows as Map<string, Record<string, unknown>>).get(created.data.id);
      if (row) {
        row.expires_at = Date.now() - 1_000;
      }

      const result = await sendMessage(created.data.id, WALLET_A, {
        to: "[email protected]",
        subject: "Hello",
        body: "Hi",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("expired");
        expect(result.status).toBe(410);
      }
    });
  });
});
