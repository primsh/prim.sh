import { describe, expect, it, vi, beforeEach } from "vitest";
import { randomBytes } from "node:crypto";

const TEST_KEY = randomBytes(32).toString("hex");

// Must set env before importing modules that use it
process.env.RELAY_ENCRYPTION_KEY = TEST_KEY;

vi.mock("../src/jmap", () => ({
  JmapError: class JmapError extends Error {
    statusCode: number;
    code: string;
    constructor(statusCode: number, code: string, message: string) {
      super(message);
      this.name = "JmapError";
      this.statusCode = statusCode;
      this.code = code;
    }
  },
  discoverSession: vi.fn(),
  buildBasicAuth: vi.fn((email: string, password: string) =>
    `Basic ${Buffer.from(`${email}:${password}`).toString("base64")}`,
  ),
}));

vi.mock("../src/db", () => {
  const rows = new Map<string, Record<string, unknown>>();
  return {
    getMailboxById: vi.fn((id: string) => rows.get(id) ?? null),
    updateMailboxJmap: vi.fn(),
    _rows: rows,
  };
});

import { getJmapContext } from "../src/context";
import { encryptPassword } from "../src/crypto";
import { discoverSession, JmapError } from "../src/jmap";
import * as dbMock from "../src/db";

const WALLET = "0xaaa";

function seedMailbox(overrides: Record<string, unknown> = {}) {
  const id = "mbx_test0001";
  const row = {
    id,
    stalwart_name: "test0001",
    address: "[email protected]",
    domain: "relay.prim.sh",
    owner_wallet: WALLET,
    status: "active",
    password_hash: "fakehash",
    password_enc: encryptPassword("test-password"),
    quota: 0,
    created_at: Date.now(),
    expires_at: Date.now() + 86400000,
    jmap_api_url: "https://mail.relay.prim.sh/jmap/",
    jmap_account_id: "acc_1",
    jmap_identity_id: "id_1",
    jmap_inbox_id: "mb_inbox",
    jmap_drafts_id: "mb_drafts",
    jmap_sent_id: "mb_sent",
    ...overrides,
  };
  // biome-ignore lint/suspicious/noExplicitAny: accessing mock internals
  ((dbMock as any)._rows as Map<string, unknown>).set(id, row);
  return id;
}

describe("getJmapContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // biome-ignore lint/suspicious/noExplicitAny: accessing mock internals
    ((dbMock as any)._rows as Map<string, unknown>).clear();
  });

  it("returns cached context without calling discoverSession", async () => {
    const id = seedMailbox();

    const result = await getJmapContext(id, WALLET);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.apiUrl).toBe("https://mail.relay.prim.sh/jmap/");
      expect(result.data.accountId).toBe("acc_1");
      expect(result.data.identityId).toBe("id_1");
      expect(result.data.inboxId).toBe("mb_inbox");
      expect(result.data.authHeader).toContain("Basic ");
      expect(result.data.address).toBe("[email protected]");
    }
    expect(discoverSession).not.toHaveBeenCalled();
  });

  it("discovers session when JMAP data is null", async () => {
    const id = seedMailbox({
      jmap_api_url: null,
      jmap_account_id: null,
      jmap_identity_id: null,
      jmap_inbox_id: null,
      jmap_drafts_id: null,
      jmap_sent_id: null,
    });

    (discoverSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      apiUrl: "https://mail.relay.prim.sh/jmap/",
      accountId: "acc_new",
      identityId: "id_new",
      inboxId: "mb_inbox_new",
      draftsId: "mb_drafts_new",
      sentId: "mb_sent_new",
    });

    const result = await getJmapContext(id, WALLET);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.accountId).toBe("acc_new");
      expect(result.data.address).toBe("[email protected]");
    }
    expect(discoverSession).toHaveBeenCalledOnce();
    expect(dbMock.updateMailboxJmap).toHaveBeenCalledOnce();
  });

  it("returns not_found for wrong wallet", async () => {
    const id = seedMailbox();

    const result = await getJmapContext(id, "0xbbb");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("not_found");
    }
  });

  it("returns not_found for nonexistent mailbox", async () => {
    const result = await getJmapContext("mbx_nonexist", WALLET);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("not_found");
    }
  });

  it("returns error when password_enc is null", async () => {
    const id = seedMailbox({ password_enc: null });

    const result = await getJmapContext(id, WALLET);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("internal_error");
    }
  });

  it("returns error on JMAP discovery failure", async () => {
    const id = seedMailbox({
      jmap_api_url: null,
      jmap_account_id: null,
      jmap_identity_id: null,
      jmap_inbox_id: null,
    });

    (discoverSession as ReturnType<typeof vi.fn>).mockRejectedValue(
      new JmapError(401, "forbidden", "Auth failed"),
    );

    const result = await getJmapContext(id, WALLET);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("forbidden");
    }
  });
});
