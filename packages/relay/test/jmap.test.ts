import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { discoverSession, buildBasicAuth, JmapError } from "../src/jmap";

const MOCK_BASE_URL = "https://mail.test.com";
const AUTH_HEADER = buildBasicAuth("[email protected]", "password123");

function mockSessionResponse() {
  return {
    apiUrl: "https://mail.test.com/jmap/",
    primaryAccounts: {
      "urn:ietf:params:jmap:mail": "acc_123",
      "urn:ietf:params:jmap:submission": "acc_123",
    },
    accounts: {
      acc_123: { name: "[email protected]" },
    },
  };
}

function mockBatchResponse() {
  return {
    methodResponses: [
      [
        "Mailbox/get",
        {
          list: [
            { id: "mb_inbox", role: "inbox", name: "Inbox" },
            { id: "mb_drafts", role: "drafts", name: "Drafts" },
            { id: "mb_sent", role: "sent", name: "Sent" },
            { id: "mb_trash", role: "trash", name: "Trash" },
          ],
        },
        "mb",
      ],
      [
        "Identity/get",
        {
          list: [{ id: "id_1", email: "[email protected]", name: "Test User" }],
        },
        "id",
      ],
    ],
  };
}

describe("jmap client", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("discovers session with correct apiUrl and accountId", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockSessionResponse(),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockBatchResponse(),
      });

    const session = await discoverSession(AUTH_HEADER, MOCK_BASE_URL);

    expect(session.apiUrl).toBe("https://mail.test.com/jmap/");
    expect(session.accountId).toBe("acc_123");
  });

  it("extracts mailbox IDs by role", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockSessionResponse(),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockBatchResponse(),
      });

    const session = await discoverSession(AUTH_HEADER, MOCK_BASE_URL);

    expect(session.inboxId).toBe("mb_inbox");
    expect(session.draftsId).toBe("mb_drafts");
    expect(session.sentId).toBe("mb_sent");
  });

  it("extracts identityId from first identity", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockSessionResponse(),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockBatchResponse(),
      });

    const session = await discoverSession(AUTH_HEADER, MOCK_BASE_URL);

    expect(session.identityId).toBe("id_1");
  });

  it("throws JmapError on auth failure", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({}),
    });

    try {
      await discoverSession(AUTH_HEADER, MOCK_BASE_URL);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(JmapError);
      expect((err as JmapError).code).toBe("forbidden");
      expect((err as JmapError).statusCode).toBe(401);
    }
  });

  it("throws when inbox role is missing", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockSessionResponse(),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          methodResponses: [
            ["Mailbox/get", { list: [{ id: "mb_trash", role: "trash", name: "Trash" }] }, "mb"],
            ["Identity/get", { list: [{ id: "id_1", email: "[email protected]", name: "Test" }] }, "id"],
          ],
        }),
      });

    try {
      await discoverSession(AUTH_HEADER, MOCK_BASE_URL);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(JmapError);
      expect((err as JmapError).message).toContain("Inbox");
    }
  });

  it("handles missing drafts/sent gracefully", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockSessionResponse(),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          methodResponses: [
            ["Mailbox/get", { list: [{ id: "mb_inbox", role: "inbox", name: "Inbox" }] }, "mb"],
            ["Identity/get", { list: [{ id: "id_1", email: "[email protected]", name: "Test" }] }, "id"],
          ],
        }),
      });

    const session = await discoverSession(AUTH_HEADER, MOCK_BASE_URL);

    expect(session.inboxId).toBe("mb_inbox");
    expect(session.draftsId).toBe("");
    expect(session.sentId).toBe("");
  });

  describe("buildBasicAuth", () => {
    it("encodes email:password as Base64", () => {
      const header = buildBasicAuth("[email protected]", "secret");
      const expected = `Basic ${Buffer.from("[email protected]:secret").toString("base64")}`;
      expect(header).toBe(expected);
    });
  });
});
