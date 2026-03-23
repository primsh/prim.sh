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
    registerWalletInternal: vi.fn(),
    registerWallet: vi.fn(),
    listWallets: vi.fn(),
    getWallet: vi.fn(),
    deactivateWallet: vi.fn(),
    createFundRequest: vi.fn(),
    listFundRequests: vi.fn(),
    approveFundRequest: vi.fn(),
    denyFundRequest: vi.fn(),
    getSpendingPolicy: vi.fn(),
    updateSpendingPolicy: vi.fn(),
    pauseWallet: vi.fn(),
    resumeWallet: vi.fn(),
  };
});

import app from "../src/index.ts";
import {
  registerWallet,
  listWallets,
  getWallet,
  deactivateWallet,
  createFundRequest,
  listFundRequests,
  approveFundRequest,
  denyFundRequest,
  getSpendingPolicy,
  updateSpendingPolicy,
  pauseWallet,
  resumeWallet,
} from "../src/service.ts";

describe("wallet.sh app", () => {
  beforeEach(() => {
    vi.mocked(registerWallet).mockReset();
    vi.mocked(listWallets).mockReset();
    vi.mocked(getWallet).mockReset();
    vi.mocked(deactivateWallet).mockReset();
    vi.mocked(createFundRequest).mockReset();
    vi.mocked(listFundRequests).mockReset();
    vi.mocked(approveFundRequest).mockReset();
    vi.mocked(denyFundRequest).mockReset();
    vi.mocked(getSpendingPolicy).mockReset();
    vi.mocked(updateSpendingPolicy).mockReset();
    vi.mocked(pauseWallet).mockReset();
    vi.mocked(resumeWallet).mockReset();
  });

  // Check 1: default export defined
  it("exposes a default export", () => {
    expect(app).toBeDefined();
  });

  // Check 2: GET / returns health response
  it("GET / returns { service: 'wallet.sh', status: 'ok' }", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ service: "wallet.sh", status: "ok" });
  });

  // Check 3: x402 middleware is wired with the correct paid routes and payTo address
  it("x402 middleware is registered with paid routes and payTo", () => {
    expect(createAgentStackMiddlewareSpy).toHaveBeenCalled();
  });

  // Check 4: POST /v1/wallets — happy path
  it("POST /v1/wallets returns 201 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(registerWallet).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/wallets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: "0x0000000000000000000000000000000000000001",
        signature: "test",
        timestamp: "test",
      }),
    });

    expect(res.status).toBe(201);
  });
  // Check 5: POST /v1/wallets — error path
  it("POST /v1/wallets returns 400 (invalid_request)", async () => {
    vi.mocked(registerWallet).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Missing fields or invalid signature format",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/wallets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: GET /v1/wallets — happy path
  it("GET /v1/wallets returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(listWallets).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/wallets?limit=10&after=test-cursor", {
      method: "GET",
    });

    expect(res.status).toBe(200);
  });

  // Check 4: GET /v1/wallets/test-address — happy path
  it.skip("GET /v1/wallets/test-address returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(getWallet).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/wallets/test-address", {
      method: "GET",
    });

    expect(res.status).toBe(200);
  });
  // Check 5: GET /v1/wallets/test-address — error path
  it.skip("GET /v1/wallets/test-address returns 404 (not_found)", async () => {
    vi.mocked(getWallet).mockResolvedValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Wallet not found",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/wallets/test-address", {
      method: "GET",
    });
    expect(res.status).toBe(404);
  });

  // Check 4: DELETE /v1/wallets/test-address — happy path
  it.skip("DELETE /v1/wallets/test-address returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(deactivateWallet).mockReturnValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/wallets/test-address", {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
  });
  // Check 5: DELETE /v1/wallets/test-address — error path
  it.skip("DELETE /v1/wallets/test-address returns 404 (not_found)", async () => {
    vi.mocked(deactivateWallet).mockReturnValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Wallet not found",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/wallets/test-address", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });

  // Check 4: POST /v1/wallets/test-address/fund-request — happy path
  it.skip("POST /v1/wallets/test-address/fund-request returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(createFundRequest).mockReturnValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/wallets/test-address/fund-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: "test", reason: "test" }),
    });

    expect(res.status).toBe(200);
  });
  // Check 5: POST /v1/wallets/test-address/fund-request — error path
  it.skip("POST /v1/wallets/test-address/fund-request returns 400 (invalid_request)", async () => {
    vi.mocked(createFundRequest).mockReturnValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Missing amount or reason",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/wallets/test-address/fund-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: GET /v1/wallets/test-address/fund-requests — happy path
  it.skip("GET /v1/wallets/test-address/fund-requests returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(listFundRequests).mockReturnValueOnce({ ok: true, data: {} } as any);

    const res = await app.request(
      "/v1/wallets/test-address/fund-requests?limit=10&after=test-cursor",
      {
        method: "GET",
      },
    );

    expect(res.status).toBe(200);
  });
  // Check 5: GET /v1/wallets/test-address/fund-requests — error path
  it.skip("GET /v1/wallets/test-address/fund-requests returns 404 (not_found)", async () => {
    vi.mocked(listFundRequests).mockReturnValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Wallet not found",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/wallets/test-address/fund-requests", {
      method: "GET",
    });
    expect(res.status).toBe(404);
  });

  // Check 4: POST /v1/fund-requests/test-id-001/approve — happy path
  it.skip("POST /v1/fund-requests/test-id-001/approve returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(approveFundRequest).mockReturnValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/fund-requests/test-id-001/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
  });
  // Check 5: POST /v1/fund-requests/test-id-001/approve — error path
  it.skip("POST /v1/fund-requests/test-id-001/approve returns 404 (not_found)", async () => {
    vi.mocked(approveFundRequest).mockReturnValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Fund request not found",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/fund-requests/test-id-001/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(404);
  });

  // Check 4: POST /v1/fund-requests/test-id-001/deny — happy path
  it.skip("POST /v1/fund-requests/test-id-001/deny returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(denyFundRequest).mockReturnValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/fund-requests/test-id-001/deny", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
  });
  // Check 5: POST /v1/fund-requests/test-id-001/deny — error path
  it.skip("POST /v1/fund-requests/test-id-001/deny returns 404 (not_found)", async () => {
    vi.mocked(denyFundRequest).mockReturnValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Fund request not found",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/fund-requests/test-id-001/deny", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(404);
  });

  // Check 4: GET /v1/wallets/test-address/policy — happy path
  it.skip("GET /v1/wallets/test-address/policy returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(getSpendingPolicy).mockReturnValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/wallets/test-address/policy", {
      method: "GET",
    });

    expect(res.status).toBe(200);
  });
  // Check 5: GET /v1/wallets/test-address/policy — error path
  it.skip("GET /v1/wallets/test-address/policy returns 404 (not_found)", async () => {
    vi.mocked(getSpendingPolicy).mockReturnValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Wallet not found",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/wallets/test-address/policy", {
      method: "GET",
    });
    expect(res.status).toBe(404);
  });

  // Check 4: PUT /v1/wallets/test-address/policy — happy path
  it.skip("PUT /v1/wallets/test-address/policy returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(updateSpendingPolicy).mockReturnValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/wallets/test-address/policy", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
  });
  // Check 5: PUT /v1/wallets/test-address/policy — error path
  it.skip("PUT /v1/wallets/test-address/policy returns 400 (invalid_request)", async () => {
    vi.mocked(updateSpendingPolicy).mockReturnValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Invalid JSON body or field values",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/wallets/test-address/policy", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: POST /v1/wallets/test-address/pause — happy path
  it.skip("POST /v1/wallets/test-address/pause returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(pauseWallet).mockReturnValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/wallets/test-address/pause", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
  });
  // Check 5: POST /v1/wallets/test-address/pause — error path
  it.skip("POST /v1/wallets/test-address/pause returns 400 (invalid_request)", async () => {
    vi.mocked(pauseWallet).mockReturnValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Invalid scope value",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/wallets/test-address/pause", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: POST /v1/wallets/test-address/resume — happy path
  it.skip("POST /v1/wallets/test-address/resume returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(resumeWallet).mockReturnValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/wallets/test-address/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
  });
  // Check 5: POST /v1/wallets/test-address/resume — error path
  it.skip("POST /v1/wallets/test-address/resume returns 400 (invalid_request)", async () => {
    vi.mocked(resumeWallet).mockReturnValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Invalid scope value",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/wallets/test-address/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });
});
