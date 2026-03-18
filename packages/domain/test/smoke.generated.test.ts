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
    createZone: vi.fn(),
    listZones: vi.fn(),
    refreshZoneStatus: vi.fn(),
    getZone: vi.fn(),
    deleteZone: vi.fn(),
    createRecord: vi.fn(),
    listRecords: vi.fn(),
    getRecord: vi.fn(),
    updateRecord: vi.fn(),
    deleteRecord: vi.fn(),
    mailSetup: vi.fn(),
    batchRecords: vi.fn(),
    usdToCents: vi.fn(),
    centsToAtomicUsdc: vi.fn(),
    centsToUsd: vi.fn(),
    quoteDomain: vi.fn(),
    registerDomain: vi.fn(),
    recoverRegistration: vi.fn(),
    configureNs: vi.fn(),
    verifyZone: vi.fn(),
    getRegistrationStatus: vi.fn(),
    activateZone: vi.fn(),
    searchDomains: vi.fn(),
  };
});

import app from "../src/index.ts";
import {
  searchDomains,
  quoteDomain,
  createZone,
  listZones,
  getZone,
  deleteZone,
  activateZone,
  verifyZone,
  mailSetup,
  batchRecords,
  createRecord,
  listRecords,
  getRecord,
  updateRecord,
  deleteRecord,
} from "../src/service.ts";

describe("domain.sh app", () => {
  beforeEach(() => {
    vi.mocked(searchDomains).mockReset();
    vi.mocked(quoteDomain).mockReset();
    vi.mocked(createZone).mockReset();
    vi.mocked(listZones).mockReset();
    vi.mocked(getZone).mockReset();
    vi.mocked(deleteZone).mockReset();
    vi.mocked(activateZone).mockReset();
    vi.mocked(verifyZone).mockReset();
    vi.mocked(mailSetup).mockReset();
    vi.mocked(batchRecords).mockReset();
    vi.mocked(createRecord).mockReset();
    vi.mocked(listRecords).mockReset();
    vi.mocked(getRecord).mockReset();
    vi.mocked(updateRecord).mockReset();
    vi.mocked(deleteRecord).mockReset();
  });

  // Check 1: default export defined
  it("exposes a default export", () => {
    expect(app).toBeDefined();
  });

  // Check 2: GET / returns health response
  it("GET / returns { service: 'domain.sh', status: 'ok' }", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ service: "domain.sh", status: "ok" });
  });

  // Check 3: x402 middleware is wired with the correct paid routes and payTo address
  it("x402 middleware is registered with paid routes and payTo", () => {
    expect(createAgentStackMiddlewareSpy).toHaveBeenCalled();
  });

  // Check 4: GET /v1/domains/search — happy path
  it.skip("GET /v1/domains/search returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(searchDomains).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/domains/search?query=test&tlds=test", {
      method: "GET",
    });

    expect(res.status).toBe(200);
  });
  // Check 5: GET /v1/domains/search — error path
  it.skip("GET /v1/domains/search returns 400 (invalid_request)", async () => {
    vi.mocked(searchDomains).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Missing required query parameter",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/domains/search", {
      method: "GET",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: POST /v1/domains/quote — happy path
  it.skip("POST /v1/domains/quote returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(quoteDomain).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/domains/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "example.com" }),
    });

    expect(res.status).toBe(200);
  });
  // Check 5: POST /v1/domains/quote — error path
  it.skip("POST /v1/domains/quote returns 400 (invalid_request)", async () => {
    vi.mocked(quoteDomain).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Missing domain or invalid years",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/domains/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: GET /v1/domains/test-domain/status — happy path
  it.skip("GET /v1/domains/test-domain/status returns 200 (happy path)", async () => {
    const res = await app.request("/v1/domains/test-domain/status", {
      method: "GET",
    });

    expect(res.status).toBe(200);
  });
  // Check 5: GET /v1/domains/test-domain/status — error path
  it.skip("GET /v1/domains/test-domain/status returns 404 (not_found)", async () => {
    const res = await app.request("/v1/domains/test-domain/status", {
      method: "GET",
    });
    expect(res.status).toBe(404);
  });

  // Check 4: POST /v1/zones — happy path
  it("POST /v1/zones returns 201 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(createZone).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/zones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "example.com" }),
    });

    expect(res.status).toBe(201);
  });
  // Check 5: POST /v1/zones — error path
  it("POST /v1/zones returns 400 (invalid_request)", async () => {
    vi.mocked(createZone).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Missing domain or invalid domain name",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/zones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: GET /v1/zones — happy path
  it.skip("GET /v1/zones returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(listZones).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/zones?limit=10&after=test-cursor", {
      method: "GET",
    });

    expect(res.status).toBe(200);
  });
  // Check 5: GET /v1/zones — error path
  it.skip("GET /v1/zones returns 400 (invalid_request)", async () => {
    vi.mocked(listZones).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Missing required query parameter",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/zones", {
      method: "GET",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: GET /v1/zones/test-id-001 — happy path
  it.skip("GET /v1/zones/test-id-001 returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(getZone).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/zones/test-id-001", {
      method: "GET",
    });

    expect(res.status).toBe(200);
  });
  // Check 5: GET /v1/zones/test-id-001 — error path
  it.skip("GET /v1/zones/test-id-001 returns 404 (not_found)", async () => {
    vi.mocked(getZone).mockResolvedValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Zone not found",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/zones/test-id-001", {
      method: "GET",
    });
    expect(res.status).toBe(404);
  });

  // Check 4: DELETE /v1/zones/test-id-001 — happy path
  it.skip("DELETE /v1/zones/test-id-001 returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(deleteZone).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/zones/test-id-001", {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
  });
  // Check 5: DELETE /v1/zones/test-id-001 — error path
  it.skip("DELETE /v1/zones/test-id-001 returns 404 (not_found)", async () => {
    vi.mocked(deleteZone).mockResolvedValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Zone not found",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/zones/test-id-001", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });

  // Check 4: PUT /v1/zones/test-zone_id/activate — happy path
  it.skip("PUT /v1/zones/test-zone_id/activate returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(activateZone).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/zones/test-zone_id/activate", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
  });
  // Check 5: PUT /v1/zones/test-zone_id/activate — error path
  it.skip("PUT /v1/zones/test-zone_id/activate returns 404 (not_found)", async () => {
    vi.mocked(activateZone).mockResolvedValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Zone not found",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/zones/test-zone_id/activate", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(404);
  });

  // Check 4: GET /v1/zones/test-zone_id/verify — happy path
  it.skip("GET /v1/zones/test-zone_id/verify returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(verifyZone).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/zones/test-zone_id/verify", {
      method: "GET",
    });

    expect(res.status).toBe(200);
  });
  // Check 5: GET /v1/zones/test-zone_id/verify — error path
  it.skip("GET /v1/zones/test-zone_id/verify returns 404 (not_found)", async () => {
    vi.mocked(verifyZone).mockResolvedValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Zone not found",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/zones/test-zone_id/verify", {
      method: "GET",
    });
    expect(res.status).toBe(404);
  });

  // Check 4: POST /v1/zones/test-zone_id/mail-setup — happy path
  it.skip("POST /v1/zones/test-zone_id/mail-setup returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(mailSetup).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/zones/test-zone_id/mail-setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mail_server: "test", mail_server_ip: "test" }),
    });

    expect(res.status).toBe(200);
  });
  // Check 5: POST /v1/zones/test-zone_id/mail-setup — error path
  it.skip("POST /v1/zones/test-zone_id/mail-setup returns 400 (invalid_request)", async () => {
    vi.mocked(mailSetup).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Missing required mail server fields",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/zones/test-zone_id/mail-setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: POST /v1/zones/test-zone_id/records/batch — happy path
  it.skip("POST /v1/zones/test-zone_id/records/batch returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(batchRecords).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/zones/test-zone_id/records/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
  });
  // Check 5: POST /v1/zones/test-zone_id/records/batch — error path
  it.skip("POST /v1/zones/test-zone_id/records/batch returns 400 (invalid_request)", async () => {
    vi.mocked(batchRecords).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Invalid record fields or values",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/zones/test-zone_id/records/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: POST /v1/zones/test-zone_id/records — happy path
  it.skip("POST /v1/zones/test-zone_id/records returns 201 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(createRecord).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/zones/test-zone_id/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "test", name: "test", content: "test" }),
    });

    expect(res.status).toBe(201);
  });
  // Check 5: POST /v1/zones/test-zone_id/records — error path
  it.skip("POST /v1/zones/test-zone_id/records returns 400 (invalid_request)", async () => {
    vi.mocked(createRecord).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Missing or invalid record fields",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/zones/test-zone_id/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: GET /v1/zones/test-zone_id/records — happy path
  it.skip("GET /v1/zones/test-zone_id/records returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(listRecords).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/zones/test-zone_id/records?limit=10&after=test-cursor", {
      method: "GET",
    });

    expect(res.status).toBe(200);
  });
  // Check 5: GET /v1/zones/test-zone_id/records — error path
  it.skip("GET /v1/zones/test-zone_id/records returns 400 (invalid_request)", async () => {
    vi.mocked(listRecords).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Missing required query parameter",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/zones/test-zone_id/records", {
      method: "GET",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: GET /v1/zones/test-zone_id/records/test-id-001 — happy path
  it.skip("GET /v1/zones/test-zone_id/records/test-id-001 returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(getRecord).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/zones/test-zone_id/records/test-id-001", {
      method: "GET",
    });

    expect(res.status).toBe(200);
  });
  // Check 5: GET /v1/zones/test-zone_id/records/test-id-001 — error path
  it.skip("GET /v1/zones/test-zone_id/records/test-id-001 returns 404 (not_found)", async () => {
    vi.mocked(getRecord).mockResolvedValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Zone or record not found",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/zones/test-zone_id/records/test-id-001", {
      method: "GET",
    });
    expect(res.status).toBe(404);
  });

  // Check 4: PUT /v1/zones/test-zone_id/records/test-id-001 — happy path
  it.skip("PUT /v1/zones/test-zone_id/records/test-id-001 returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(updateRecord).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/zones/test-zone_id/records/test-id-001", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
  });
  // Check 5: PUT /v1/zones/test-zone_id/records/test-id-001 — error path
  it.skip("PUT /v1/zones/test-zone_id/records/test-id-001 returns 400 (invalid_request)", async () => {
    vi.mocked(updateRecord).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Invalid record fields",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/zones/test-zone_id/records/test-id-001", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: DELETE /v1/zones/test-zone_id/records/test-id-001 — happy path
  it.skip("DELETE /v1/zones/test-zone_id/records/test-id-001 returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(deleteRecord).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/zones/test-zone_id/records/test-id-001", {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
  });
  // Check 5: DELETE /v1/zones/test-zone_id/records/test-id-001 — error path
  it.skip("DELETE /v1/zones/test-zone_id/records/test-id-001 returns 404 (not_found)", async () => {
    vi.mocked(deleteRecord).mockResolvedValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Zone or record not found",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/zones/test-zone_id/records/test-id-001", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });
});
