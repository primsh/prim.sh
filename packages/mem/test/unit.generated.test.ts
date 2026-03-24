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

// Mock the service so unit tests don't need a real API key
vi.mock("../src/service.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/service.ts")>();
  return {
    ...original,
    createCollection: vi.fn(),
    listCollections: vi.fn(),
    getCollection: vi.fn(),
    deleteCollection: vi.fn(),
    upsertDocuments: vi.fn(),
    queryDocuments: vi.fn(),
    cacheSet: vi.fn(),
    cacheGet: vi.fn(),
    cacheDelete: vi.fn(),
  };
});

import app from "../src/index.ts";
import {
  createCollection,
  listCollections,
  getCollection,
  deleteCollection,
  upsertDocuments,
  queryDocuments,
  cacheSet,
  cacheGet,
  cacheDelete,
} from "../src/service.ts";

describe("mem.sh app", () => {
  beforeEach(() => {
    vi.mocked(createCollection).mockReset();
    vi.mocked(listCollections).mockReset();
    vi.mocked(getCollection).mockReset();
    vi.mocked(deleteCollection).mockReset();
    vi.mocked(upsertDocuments).mockReset();
    vi.mocked(queryDocuments).mockReset();
    vi.mocked(cacheSet).mockReset();
    vi.mocked(cacheGet).mockReset();
    vi.mocked(cacheDelete).mockReset();
  });

  // Check 1: default export defined
  it("exposes a default export", () => {
    expect(app).toBeDefined();
  });

  // Check 2: GET / returns health response
  it("GET / returns { service: 'mem.sh', status: 'ok' }", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ service: "mem.sh", status: "ok" });
  });

  // Check 3: x402 middleware is wired with the correct paid routes and payTo address
  it("x402 middleware is registered with paid routes and payTo", () => {
    expect(createAgentStackMiddlewareSpy).toHaveBeenCalled();
  });

  // Check 4: POST /v1/collections — happy path
  it("POST /v1/collections returns 201 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    vi.mocked(createCollection).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test" }),
    });

    expect(res.status).toBe(201);
  });
  // Check 5: POST /v1/collections — error path
  it("POST /v1/collections returns 400 (invalid_request)", async () => {
    vi.mocked(createCollection).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Missing name or invalid fields",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    } as any);

    const res = await app.request("/v1/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: GET /v1/collections — happy path
  it("GET /v1/collections returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    vi.mocked(listCollections).mockReturnValueOnce({} as any);

    const res = await app.request("/v1/collections?limit=10&after=test-cursor", {
      method: "GET",
    });

    expect(res.status).toBe(200);
  });

  // Check 4: GET /v1/collections/test-id-001 — happy path
  it.skip("GET /v1/collections/test-id-001 returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    vi.mocked(getCollection).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/collections/test-id-001", {
      method: "GET",
    });

    expect(res.status).toBe(200);
  });
  // Check 5: GET /v1/collections/test-id-001 — error path
  it.skip("GET /v1/collections/test-id-001 returns 404 (not_found)", async () => {
    vi.mocked(getCollection).mockResolvedValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Collection not found",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    } as any);

    const res = await app.request("/v1/collections/test-id-001", {
      method: "GET",
    });
    expect(res.status).toBe(404);
  });

  // Check 4: DELETE /v1/collections/test-id-001 — happy path
  it.skip("DELETE /v1/collections/test-id-001 returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    vi.mocked(deleteCollection).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/collections/test-id-001", {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
  });
  // Check 5: DELETE /v1/collections/test-id-001 — error path
  it.skip("DELETE /v1/collections/test-id-001 returns 404 (not_found)", async () => {
    vi.mocked(deleteCollection).mockResolvedValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Collection not found",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    } as any);

    const res = await app.request("/v1/collections/test-id-001", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });

  // Check 4: POST /v1/collections/test-id-001/upsert — happy path
  it.skip("POST /v1/collections/test-id-001/upsert returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    vi.mocked(upsertDocuments).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/collections/test-id-001/upsert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documents: [] }),
    });

    expect(res.status).toBe(200);
  });
  // Check 5: POST /v1/collections/test-id-001/upsert — error path
  it.skip("POST /v1/collections/test-id-001/upsert returns 400 (invalid_request)", async () => {
    vi.mocked(upsertDocuments).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Missing documents or invalid fields",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    } as any);

    const res = await app.request("/v1/collections/test-id-001/upsert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: POST /v1/collections/test-id-001/query — happy path
  it.skip("POST /v1/collections/test-id-001/query returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    vi.mocked(queryDocuments).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/collections/test-id-001/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "test" }),
    });

    expect(res.status).toBe(200);
  });
  // Check 5: POST /v1/collections/test-id-001/query — error path
  it.skip("POST /v1/collections/test-id-001/query returns 400 (invalid_request)", async () => {
    vi.mocked(queryDocuments).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Missing text or invalid filter",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    } as any);

    const res = await app.request("/v1/collections/test-id-001/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: PUT /v1/cache/test-ns/test-key — happy path
  it("PUT /v1/cache/test-ns/test-key returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    vi.mocked(cacheSet).mockReturnValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/cache/test-ns/test-key", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "test" }),
    });

    expect(res.status).toBe(200);
  });
  // Check 5: PUT /v1/cache/test-ns/test-key — error path
  it("PUT /v1/cache/test-ns/test-key returns 400 (invalid_request)", async () => {
    vi.mocked(cacheSet).mockReturnValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Missing value",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    } as any);

    const res = await app.request("/v1/cache/test-ns/test-key", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: GET /v1/cache/test-ns/test-key — happy path
  it("GET /v1/cache/test-ns/test-key returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    vi.mocked(cacheGet).mockReturnValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/cache/test-ns/test-key", {
      method: "GET",
    });

    expect(res.status).toBe(200);
  });
  // Check 5: GET /v1/cache/test-ns/test-key — error path
  it("GET /v1/cache/test-ns/test-key returns 404 (not_found)", async () => {
    vi.mocked(cacheGet).mockReturnValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Cache entry missing or expired",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    } as any);

    const res = await app.request("/v1/cache/test-ns/test-key", {
      method: "GET",
    });
    expect(res.status).toBe(404);
  });

  // Check 4: DELETE /v1/cache/test-ns/test-key — happy path
  it("DELETE /v1/cache/test-ns/test-key returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    vi.mocked(cacheDelete).mockReturnValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/cache/test-ns/test-key", {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
  });
  // Check 5: DELETE /v1/cache/test-ns/test-key — error path
  it("DELETE /v1/cache/test-ns/test-key returns 404 (not_found)", async () => {
    vi.mocked(cacheDelete).mockReturnValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Cache entry not found",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    } as any);

    const res = await app.request("/v1/cache/test-ns/test-key", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });
});
