import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.PRIM_NETWORK = "eip155:8453";
  process.env.PRIM_PAY_TO = "0x0000000000000000000000000000000000000001";
});

// Stub bun:sqlite so the DB module doesn't fail in vitest (Node runtime)
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

// Mock the service layer so smoke tests don't need real Stalwart / JMAP
vi.mock("../src/service.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/service.ts")>();
  return {
    ...original,
    createMailbox: vi.fn(),
    sendMessage: vi.fn(),
    registerDomain: vi.fn(),
  };
});

import type { MailboxResponse } from "../src/api.ts";
import app from "../src/index.ts";
import { createMailbox } from "../src/service.ts";

const MOCK_MAILBOX: MailboxResponse = {
  id: "mbx_abc123",
  address: "abc123@email.prim.sh",
  username: "abc123",
  domain: "email.prim.sh",
  status: "active",
  created_at: "2026-02-26T00:00:00.000Z",
  expires_at: null,
};

describe("email.sh app", () => {
  beforeEach(() => {
    vi.mocked(createMailbox).mockReset();
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
    expect(createAgentStackMiddlewareSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        payTo: expect.any(String),
        freeRoutes: expect.arrayContaining(["GET /"]),
      }),
      expect.objectContaining({ "POST /v1/mailboxes": expect.any(String) }),
    );
  });

  // Check 4: happy path — handler returns 201 with mocked mailbox response
  it("POST /v1/mailboxes with valid data returns 201 with mailbox data", async () => {
    vi.mocked(createMailbox).mockResolvedValueOnce({ ok: true, data: MOCK_MAILBOX });

    const res = await app.request("/v1/mailboxes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "abc123" }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as MailboxResponse;
    expect(body.id).toBe("mbx_abc123");
    expect(body.address).toBe("abc123@email.prim.sh");
    expect(body.status).toBe("active");
  });

  // Check 5: 400 on invalid_request — service returns invalid_request → handler maps to 400
  it("POST /v1/mailboxes with invalid username returns 400", async () => {
    vi.mocked(createMailbox).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Username must be 3-32 characters",
    });

    const res = await app.request("/v1/mailboxes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "x" }),
    });
    expect(res.status).toBe(400);
  });
});
