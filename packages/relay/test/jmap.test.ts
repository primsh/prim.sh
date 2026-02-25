import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { discoverSession, buildBasicAuth, JmapError, queryEmails, getEmail } from "../src/jmap";

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

  describe("queryEmails", () => {
    const ctx = {
      apiUrl: "https://mail.test.com/jmap/",
      accountId: "acc_123",
      authHeader: AUTH_HEADER,
      identityId: "id_1",
      inboxId: "mb_inbox",
      draftsId: "mb_drafts",
      sentId: "mb_sent",
    };

    it("returns messages with correct fields", async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          methodResponses: [
            [
              "Email/query",
              { ids: ["e1", "e2"], total: 42, position: 0 },
              "q",
            ],
            [
              "Email/get",
              {
                list: [
                  {
                    id: "e1",
                    from: [{ name: "Alice", email: "[email protected]" }],
                    to: [{ name: null, email: "[email protected]" }],
                    subject: "Hello",
                    receivedAt: "2026-02-25T10:00:00Z",
                    size: 1234,
                    hasAttachment: false,
                    preview: "Hey there...",
                  },
                  {
                    id: "e2",
                    from: [{ name: "Bob", email: "[email protected]" }],
                    to: [{ name: null, email: "[email protected]" }],
                    subject: "Re: Hello",
                    receivedAt: "2026-02-25T11:00:00Z",
                    size: 567,
                    hasAttachment: true,
                    preview: "Thanks...",
                  },
                ],
              },
              "e",
            ],
          ],
        }),
      });

      const result = await queryEmails(ctx, { mailboxId: "mb_inbox", limit: 20, position: 0 });

      expect(result.total).toBe(42);
      expect(result.position).toBe(0);
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].id).toBe("e1");
      expect(result.messages[0].from[0].email).toBe("[email protected]");
      expect(result.messages[1].hasAttachment).toBe(true);
    });

    it("returns empty list for empty inbox", async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          methodResponses: [
            ["Email/query", { ids: [], total: 0, position: 0 }, "q"],
            ["Email/get", { list: [] }, "e"],
          ],
        }),
      });

      const result = await queryEmails(ctx, { mailboxId: "mb_inbox", limit: 20, position: 0 });

      expect(result.messages).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it("throws JmapError on HTTP 401", async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      try {
        await queryEmails(ctx, { mailboxId: "mb_inbox", limit: 20, position: 0 });
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(JmapError);
        expect((err as JmapError).code).toBe("forbidden");
      }
    });

    it("throws JmapError on JMAP method error", async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          methodResponses: [
            ["error", { type: "serverFail" }, "q"],
          ],
        }),
      });

      try {
        await queryEmails(ctx, { mailboxId: "mb_inbox", limit: 20, position: 0 });
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(JmapError);
        expect((err as JmapError).message).toContain("serverFail");
      }
    });

    it("omits inMailbox filter when mailboxId is undefined", async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          methodResponses: [
            ["Email/query", { ids: [], total: 0, position: 0 }, "q"],
            ["Email/get", { list: [] }, "e"],
          ],
        }),
      });

      await queryEmails(ctx, { limit: 20, position: 0 });

      const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
      const queryArgs = body.methodCalls[0][1];
      expect(queryArgs.filter).toEqual({});
    });
  });

  describe("getEmail", () => {
    const ctx = {
      apiUrl: "https://mail.test.com/jmap/",
      accountId: "acc_123",
      authHeader: AUTH_HEADER,
      identityId: "id_1",
      inboxId: "mb_inbox",
      draftsId: "mb_drafts",
      sentId: "mb_sent",
    };

    it("returns full email with body values", async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          methodResponses: [
            [
              "Email/get",
              {
                list: [
                  {
                    id: "e1",
                    from: [{ name: "Alice", email: "[email protected]" }],
                    to: [{ name: null, email: "[email protected]" }],
                    cc: [],
                    subject: "Hello",
                    receivedAt: "2026-02-25T10:00:00Z",
                    size: 1234,
                    hasAttachment: false,
                    preview: "Hey there...",
                    textBody: [{ partId: "1" }],
                    htmlBody: [{ partId: "2" }],
                    bodyValues: {
                      "1": { value: "Hey there, how are you?" },
                      "2": { value: "<p>Hey there, how are you?</p>" },
                    },
                  },
                ],
                notFound: [],
              },
              "e",
            ],
          ],
        }),
      });

      const email = await getEmail(ctx, "e1");

      expect(email.id).toBe("e1");
      expect(email.textBody[0].partId).toBe("1");
      expect(email.bodyValues["1"].value).toBe("Hey there, how are you?");
      expect(email.bodyValues["2"].value).toBe("<p>Hey there, how are you?</p>");
    });

    it("returns email with text-only body", async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          methodResponses: [
            [
              "Email/get",
              {
                list: [
                  {
                    id: "e2",
                    from: [{ name: "Bob", email: "[email protected]" }],
                    to: [{ name: null, email: "[email protected]" }],
                    cc: [],
                    subject: "Plain text",
                    receivedAt: "2026-02-25T11:00:00Z",
                    size: 100,
                    hasAttachment: false,
                    preview: "Just text",
                    textBody: [{ partId: "1" }],
                    htmlBody: [],
                    bodyValues: {
                      "1": { value: "Just text content" },
                    },
                  },
                ],
                notFound: [],
              },
              "e",
            ],
          ],
        }),
      });

      const email = await getEmail(ctx, "e2");

      expect(email.textBody).toHaveLength(1);
      expect(email.htmlBody).toHaveLength(0);
    });

    it("throws not_found when ID is in notFound array", async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          methodResponses: [
            [
              "Email/get",
              { list: [], notFound: ["e_missing"] },
              "e",
            ],
          ],
        }),
      });

      try {
        await getEmail(ctx, "e_missing");
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(JmapError);
        expect((err as JmapError).code).toBe("not_found");
        expect((err as JmapError).statusCode).toBe(404);
      }
    });

    it("throws not_found when list is empty", async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          methodResponses: [
            ["Email/get", { list: [], notFound: [] }, "e"],
          ],
        }),
      });

      try {
        await getEmail(ctx, "e_gone");
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(JmapError);
        expect((err as JmapError).code).toBe("not_found");
      }
    });
  });
});
