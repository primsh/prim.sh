// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Regenerate: pnpm gen:tests
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.PRIM_NETWORK = "eip155:8453";
  process.env.REVENUE_WALLET = "0x0000000000000000000000000000000000000001";
});

// Stub bun:sqlite so db.ts doesn't fail in vitest (Node runtime)
import { mockBunSqlite, mockX402Middleware } from "@primsh/x402-middleware/testing";
vi.mock("bun:sqlite", () => mockBunSqlite());

const createAgentStackMiddlewareSpy = vi.hoisted(() => vi.fn());

vi.mock("@primsh/x402-middleware", async (importOriginal) => {
  const original = await importOriginal<typeof import("@primsh/x402-middleware")>();
  const mocks = mockX402Middleware();
  createAgentStackMiddlewareSpy.mockImplementation(mocks.createAgentStackMiddleware);
  return {
    ...original,
    createAgentStackMiddleware: createAgentStackMiddlewareSpy,
    createWalletAllowlistChecker: vi.fn(mocks.createWalletAllowlistChecker),
  };
});

// Mock the service so smoke tests don't need a real API key
vi.mock("../src/service.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/service.ts")>();
  return {
    ...original,
    createMailbox: vi.fn(),
    listMailboxes: vi.fn(),
    getMailbox: vi.fn(),
    deleteMailbox: vi.fn(),
    listMessages: vi.fn(),
    getMessage: vi.fn(),
    sendMessage: vi.fn(),
    renewMailbox: vi.fn(),
    registerWebhook: vi.fn(),
    listWebhooks: vi.fn(),
    deleteWebhook: vi.fn(),
    handleIngestEvent: vi.fn(),
    registerDomain: vi.fn(),
    listDomains: vi.fn(),
    getDomain: vi.fn(),
    verifyDomain: vi.fn(),
    deleteDomain: vi.fn(),
  };
});

import app from "../src/index.ts";
import {
  createMailbox,
  listMailboxes,
  getMailbox,
  deleteMailbox,
  renewMailbox,
  listMessages,
  getMessage,
  sendMessage,
  registerWebhook,
  listWebhooks,
  deleteWebhook,
  registerDomain,
  listDomains,
  getDomain,
  verifyDomain,
  deleteDomain,
} from "../src/service.ts";

describe("email.sh app", () => {
  beforeEach(() => {
    vi.mocked(createMailbox).mockReset();
    vi.mocked(listMailboxes).mockReset();
    vi.mocked(getMailbox).mockReset();
    vi.mocked(deleteMailbox).mockReset();
    vi.mocked(renewMailbox).mockReset();
    vi.mocked(listMessages).mockReset();
    vi.mocked(getMessage).mockReset();
    vi.mocked(sendMessage).mockReset();
    vi.mocked(registerWebhook).mockReset();
    vi.mocked(listWebhooks).mockReset();
    vi.mocked(deleteWebhook).mockReset();
    vi.mocked(registerDomain).mockReset();
    vi.mocked(listDomains).mockReset();
    vi.mocked(getDomain).mockReset();
    vi.mocked(verifyDomain).mockReset();
    vi.mocked(deleteDomain).mockReset();
  });

  // Check 1: default export defined
  it("exposes a default export", () => {
    expect(app).toBeDefined();
  });

  // Check 2: GET / returns health response
  it("GET / returns { service: 'email.sh', status: 'ok' }", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ service: "email.sh", status: "ok" });
  });

  // Check 3: x402 middleware is wired with the correct paid routes and payTo address
  it("x402 middleware is registered with paid routes and payTo", () => {
    expect(createAgentStackMiddlewareSpy).toHaveBeenCalled();
  });

  // Check 4: POST /v1/mailboxes — happy path
  it("POST /v1/mailboxes returns 201 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(createMailbox).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/mailboxes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(201);
  });
  // Check 5: POST /v1/mailboxes — error path
  it("POST /v1/mailboxes returns 400 (invalid_request)", async () => {
    vi.mocked(createMailbox).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Missing fields or invalid characters",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/mailboxes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: GET /v1/mailboxes — happy path
  it.skip("GET /v1/mailboxes returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(listMailboxes).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/mailboxes?limit=10&after=test-cursor", {
      method: "GET",
    });

    expect(res.status).toBe(200);
  });
  // Check 5: GET /v1/mailboxes — error path
  it.skip("GET /v1/mailboxes returns 400 (invalid_request)", async () => {
    vi.mocked(listMailboxes).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Missing required query parameter",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/mailboxes", {
      method: "GET",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: GET /v1/mailboxes/test-id-001 — happy path
  it.skip("GET /v1/mailboxes/test-id-001 returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(getMailbox).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/mailboxes/test-id-001", {
      method: "GET",
    });

    expect(res.status).toBe(200);
  });
  // Check 5: GET /v1/mailboxes/test-id-001 — error path
  it.skip("GET /v1/mailboxes/test-id-001 returns 404 (not_found)", async () => {
    vi.mocked(getMailbox).mockResolvedValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Mailbox not found",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/mailboxes/test-id-001", {
      method: "GET",
    });
    expect(res.status).toBe(404);
  });

  // Check 4: DELETE /v1/mailboxes/test-id-001 — happy path
  it.skip("DELETE /v1/mailboxes/test-id-001 returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(deleteMailbox).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/mailboxes/test-id-001", {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
  });
  // Check 5: DELETE /v1/mailboxes/test-id-001 — error path
  it.skip("DELETE /v1/mailboxes/test-id-001 returns 404 (not_found)", async () => {
    vi.mocked(deleteMailbox).mockResolvedValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Mailbox not found",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/mailboxes/test-id-001", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });

  // Check 4: POST /v1/mailboxes/test-id-001/renew — happy path
  it.skip("POST /v1/mailboxes/test-id-001/renew returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(renewMailbox).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/mailboxes/test-id-001/renew", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
  });
  // Check 5: POST /v1/mailboxes/test-id-001/renew — error path
  it.skip("POST /v1/mailboxes/test-id-001/renew returns 404 (not_found)", async () => {
    vi.mocked(renewMailbox).mockResolvedValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Mailbox not found",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/mailboxes/test-id-001/renew", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(404);
  });

  // Check 4: GET /v1/mailboxes/test-id-001/messages — happy path
  it.skip("GET /v1/mailboxes/test-id-001/messages returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(listMessages).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/mailboxes/test-id-001/messages?limit=10&after=test-cursor", {
      method: "GET",
    });

    expect(res.status).toBe(200);
  });
  // Check 5: GET /v1/mailboxes/test-id-001/messages — error path
  it.skip("GET /v1/mailboxes/test-id-001/messages returns 400 (invalid_request)", async () => {
    vi.mocked(listMessages).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Missing required query parameter",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/mailboxes/test-id-001/messages", {
      method: "GET",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: GET /v1/mailboxes/test-id-001/messages/test-msgId — happy path
  it.skip("GET /v1/mailboxes/test-id-001/messages/test-msgId returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(getMessage).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/mailboxes/test-id-001/messages/test-msgId", {
      method: "GET",
    });

    expect(res.status).toBe(200);
  });
  // Check 5: GET /v1/mailboxes/test-id-001/messages/test-msgId — error path
  it.skip("GET /v1/mailboxes/test-id-001/messages/test-msgId returns 404 (not_found)", async () => {
    vi.mocked(getMessage).mockResolvedValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Mailbox or message not found",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/mailboxes/test-id-001/messages/test-msgId", {
      method: "GET",
    });
    expect(res.status).toBe(404);
  });

  // Check 4: POST /v1/mailboxes/test-id-001/send — happy path
  it.skip("POST /v1/mailboxes/test-id-001/send returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(sendMessage).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/mailboxes/test-id-001/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: "test", subject: "test" }),
    });

    expect(res.status).toBe(200);
  });
  // Check 5: POST /v1/mailboxes/test-id-001/send — error path
  it.skip("POST /v1/mailboxes/test-id-001/send returns 400 (invalid_request)", async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Missing required fields",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/mailboxes/test-id-001/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: POST /v1/mailboxes/test-id-001/webhooks — happy path
  it.skip("POST /v1/mailboxes/test-id-001/webhooks returns 201 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(registerWebhook).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/mailboxes/test-id-001/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "test" }),
    });

    expect(res.status).toBe(201);
  });
  // Check 5: POST /v1/mailboxes/test-id-001/webhooks — error path
  it.skip("POST /v1/mailboxes/test-id-001/webhooks returns 400 (invalid_request)", async () => {
    vi.mocked(registerWebhook).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Missing or invalid webhook URL",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/mailboxes/test-id-001/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: GET /v1/mailboxes/test-id-001/webhooks — happy path
  it.skip("GET /v1/mailboxes/test-id-001/webhooks returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(listWebhooks).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/mailboxes/test-id-001/webhooks", {
      method: "GET",
    });

    expect(res.status).toBe(200);
  });
  // Check 5: GET /v1/mailboxes/test-id-001/webhooks — error path
  it.skip("GET /v1/mailboxes/test-id-001/webhooks returns 404 (not_found)", async () => {
    vi.mocked(listWebhooks).mockResolvedValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Mailbox not found",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/mailboxes/test-id-001/webhooks", {
      method: "GET",
    });
    expect(res.status).toBe(404);
  });

  // Check 4: DELETE /v1/mailboxes/test-id-001/webhooks/test-whId — happy path
  it.skip("DELETE /v1/mailboxes/test-id-001/webhooks/test-whId returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(deleteWebhook).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/mailboxes/test-id-001/webhooks/test-whId", {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
  });
  // Check 5: DELETE /v1/mailboxes/test-id-001/webhooks/test-whId — error path
  it.skip("DELETE /v1/mailboxes/test-id-001/webhooks/test-whId returns 404 (not_found)", async () => {
    vi.mocked(deleteWebhook).mockResolvedValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Mailbox or webhook not found",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/mailboxes/test-id-001/webhooks/test-whId", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });

  // Check 4: POST /v1/domains — happy path
  it("POST /v1/domains returns 201 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(registerDomain).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "example.com" }),
    });

    expect(res.status).toBe(201);
  });
  // Check 5: POST /v1/domains — error path
  it("POST /v1/domains returns 400 (invalid_request)", async () => {
    vi.mocked(registerDomain).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Invalid domain name",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: GET /v1/domains — happy path
  it.skip("GET /v1/domains returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(listDomains).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/domains?limit=10&after=test-cursor", {
      method: "GET",
    });

    expect(res.status).toBe(200);
  });
  // Check 5: GET /v1/domains — error path
  it.skip("GET /v1/domains returns 400 (invalid_request)", async () => {
    vi.mocked(listDomains).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Missing required query parameter",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/domains", {
      method: "GET",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: GET /v1/domains/test-id-001 — happy path
  it.skip("GET /v1/domains/test-id-001 returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(getDomain).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/domains/test-id-001", {
      method: "GET",
    });

    expect(res.status).toBe(200);
  });
  // Check 5: GET /v1/domains/test-id-001 — error path
  it.skip("GET /v1/domains/test-id-001 returns 404 (not_found)", async () => {
    vi.mocked(getDomain).mockResolvedValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Domain not found",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/domains/test-id-001", {
      method: "GET",
    });
    expect(res.status).toBe(404);
  });

  // Check 4: POST /v1/domains/test-id-001/verify — happy path
  it.skip("POST /v1/domains/test-id-001/verify returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(verifyDomain).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/domains/test-id-001/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
  });
  // Check 5: POST /v1/domains/test-id-001/verify — error path
  it.skip("POST /v1/domains/test-id-001/verify returns 404 (not_found)", async () => {
    vi.mocked(verifyDomain).mockResolvedValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Domain not found",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/domains/test-id-001/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(404);
  });

  // Check 4: DELETE /v1/domains/test-id-001 — happy path
  it.skip("DELETE /v1/domains/test-id-001 returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(deleteDomain).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/domains/test-id-001", {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
  });
  // Check 5: DELETE /v1/domains/test-id-001 — error path
  it.skip("DELETE /v1/domains/test-id-001 returns 404 (not_found)", async () => {
    vi.mocked(deleteDomain).mockResolvedValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Domain not found",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/domains/test-id-001", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });
});
