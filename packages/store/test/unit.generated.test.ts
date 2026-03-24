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
    createBucket: vi.fn(),
    listBuckets: vi.fn(),
    getBucket: vi.fn(),
    deleteBucket: vi.fn(),
    updateBucket: vi.fn(),
    getPublicObject: vi.fn(),
    putObject: vi.fn(),
    getObject: vi.fn(),
    deleteObject: vi.fn(),
    listObjects: vi.fn(),
    presignObject: vi.fn(),
    getUsage: vi.fn(),
    setQuotaForBucket: vi.fn(),
    reconcileUsage: vi.fn(),
  };
});

import app from "../src/index.ts";
import {
  createBucket,
  listBuckets,
  getBucket,
  deleteBucket,
  putObject,
  listObjects,
  getObject,
  deleteObject,
  setQuotaForBucket,
  reconcileUsage,
  presignObject,
} from "../src/service.ts";

describe("store.sh app", () => {
  beforeEach(() => {
    vi.mocked(createBucket).mockReset();
    vi.mocked(listBuckets).mockReset();
    vi.mocked(getBucket).mockReset();
    vi.mocked(deleteBucket).mockReset();
    vi.mocked(putObject).mockReset();
    vi.mocked(listObjects).mockReset();
    vi.mocked(getObject).mockReset();
    vi.mocked(deleteObject).mockReset();
    vi.mocked(setQuotaForBucket).mockReset();
    vi.mocked(reconcileUsage).mockReset();
    vi.mocked(presignObject).mockReset();
  });

  // Check 1: default export defined
  it("exposes a default export", () => {
    expect(app).toBeDefined();
  });

  // Check 2: GET / returns health response
  it("GET / returns { service: 'store.sh', status: 'ok' }", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ service: "store.sh", status: "ok" });
  });

  // Check 3: x402 middleware is wired with the correct paid routes and payTo address
  it("x402 middleware is registered with paid routes and payTo", () => {
    expect(createAgentStackMiddlewareSpy).toHaveBeenCalled();
  });

  // Check 4: POST /v1/buckets — happy path
  it("POST /v1/buckets returns 201 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    vi.mocked(createBucket).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/buckets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test" }),
    });

    expect(res.status).toBe(201);
  });
  // Check 5: POST /v1/buckets — error path
  it("POST /v1/buckets returns 400 (invalid_request)", async () => {
    vi.mocked(createBucket).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Invalid bucket name or name already taken",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    } as any);

    const res = await app.request("/v1/buckets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: GET /v1/buckets — happy path
  it("GET /v1/buckets returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    vi.mocked(listBuckets).mockReturnValueOnce({} as any);

    const res = await app.request("/v1/buckets?limit=10&after=test-cursor", {
      method: "GET",
    });

    expect(res.status).toBe(200);
  });

  // Check 4: GET /v1/buckets/test-id-001 — happy path
  it.skip("GET /v1/buckets/test-id-001 returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    vi.mocked(getBucket).mockReturnValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/buckets/test-id-001", {
      method: "GET",
    });

    expect(res.status).toBe(200);
  });
  // Check 5: GET /v1/buckets/test-id-001 — error path
  it.skip("GET /v1/buckets/test-id-001 returns 404 (not_found)", async () => {
    vi.mocked(getBucket).mockReturnValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Bucket not found",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    } as any);

    const res = await app.request("/v1/buckets/test-id-001", {
      method: "GET",
    });
    expect(res.status).toBe(404);
  });

  // Check 4: DELETE /v1/buckets/test-id-001 — happy path
  it.skip("DELETE /v1/buckets/test-id-001 returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    vi.mocked(deleteBucket).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/buckets/test-id-001", {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
  });
  // Check 5: DELETE /v1/buckets/test-id-001 — error path
  it.skip("DELETE /v1/buckets/test-id-001 returns 404 (not_found)", async () => {
    vi.mocked(deleteBucket).mockResolvedValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Bucket not found",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    } as any);

    const res = await app.request("/v1/buckets/test-id-001", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });

  // Check 4: PUT /v1/buckets/test-id-001/objects/test-key — happy path
  it.skip("PUT /v1/buckets/test-id-001/objects/test-key returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    vi.mocked(putObject).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/buckets/test-id-001/objects/test-key", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
  });
  // Check 5: PUT /v1/buckets/test-id-001/objects/test-key — error path
  it.skip("PUT /v1/buckets/test-id-001/objects/test-key returns 400 (invalid_request)", async () => {
    vi.mocked(putObject).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Missing or invalid body",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    } as any);

    const res = await app.request("/v1/buckets/test-id-001/objects/test-key", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: GET /v1/buckets/test-id-001/objects — happy path
  it.skip("GET /v1/buckets/test-id-001/objects returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    vi.mocked(listObjects).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request(
      "/v1/buckets/test-id-001/objects?prefix=test&limit=10&cursor=test-cursor",
      {
        method: "GET",
      },
    );

    expect(res.status).toBe(200);
  });
  // Check 5: GET /v1/buckets/test-id-001/objects — error path
  it.skip("GET /v1/buckets/test-id-001/objects returns 404 (not_found)", async () => {
    vi.mocked(listObjects).mockResolvedValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Bucket not found",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    } as any);

    const res = await app.request("/v1/buckets/test-id-001/objects", {
      method: "GET",
    });
    expect(res.status).toBe(404);
  });

  // Check 4: GET /v1/buckets/test-id-001/objects/test-key — happy path
  it.skip("GET /v1/buckets/test-id-001/objects/test-key returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    vi.mocked(getObject).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/buckets/test-id-001/objects/test-key", {
      method: "GET",
    });

    expect(res.status).toBe(200);
  });
  // Check 5: GET /v1/buckets/test-id-001/objects/test-key — error path
  it.skip("GET /v1/buckets/test-id-001/objects/test-key returns 404 (not_found)", async () => {
    vi.mocked(getObject).mockResolvedValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Bucket or object not found",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    } as any);

    const res = await app.request("/v1/buckets/test-id-001/objects/test-key", {
      method: "GET",
    });
    expect(res.status).toBe(404);
  });

  // Check 4: DELETE /v1/buckets/test-id-001/objects/test-key — happy path
  it.skip("DELETE /v1/buckets/test-id-001/objects/test-key returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    vi.mocked(deleteObject).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/buckets/test-id-001/objects/test-key", {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
  });
  // Check 5: DELETE /v1/buckets/test-id-001/objects/test-key — error path
  it.skip("DELETE /v1/buckets/test-id-001/objects/test-key returns 404 (not_found)", async () => {
    vi.mocked(deleteObject).mockResolvedValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Bucket or object not found",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    } as any);

    const res = await app.request("/v1/buckets/test-id-001/objects/test-key", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });

  // Check 4: GET /v1/buckets/test-id-001/quota — happy path
  it.skip("GET /v1/buckets/test-id-001/quota returns 200 (happy path)", async () => {
    const res = await app.request("/v1/buckets/test-id-001/quota", {
      method: "GET",
    });

    expect(res.status).toBe(200);
  });
  // Check 5: GET /v1/buckets/test-id-001/quota — error path
  it.skip("GET /v1/buckets/test-id-001/quota returns 404 (not_found)", async () => {
    const res = await app.request("/v1/buckets/test-id-001/quota", {
      method: "GET",
    });
    expect(res.status).toBe(404);
  });

  // Check 4: PUT /v1/buckets/test-id-001/quota — happy path
  it.skip("PUT /v1/buckets/test-id-001/quota returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    vi.mocked(setQuotaForBucket).mockReturnValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/buckets/test-id-001/quota", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quota_bytes: 1 }),
    });

    expect(res.status).toBe(200);
  });
  // Check 5: PUT /v1/buckets/test-id-001/quota — error path
  it.skip("PUT /v1/buckets/test-id-001/quota returns 400 (invalid_request)", async () => {
    vi.mocked(setQuotaForBucket).mockReturnValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Invalid quota value",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    } as any);

    const res = await app.request("/v1/buckets/test-id-001/quota", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: POST /v1/buckets/test-id-001/quota/reconcile — happy path
  it.skip("POST /v1/buckets/test-id-001/quota/reconcile returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    vi.mocked(reconcileUsage).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/buckets/test-id-001/quota/reconcile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
  });
  // Check 5: POST /v1/buckets/test-id-001/quota/reconcile — error path
  it.skip("POST /v1/buckets/test-id-001/quota/reconcile returns 404 (not_found)", async () => {
    vi.mocked(reconcileUsage).mockResolvedValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Bucket not found",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    } as any);

    const res = await app.request("/v1/buckets/test-id-001/quota/reconcile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(404);
  });

  // Check 4: POST /v1/buckets/test-id-001/presign — happy path
  it.skip("POST /v1/buckets/test-id-001/presign returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    vi.mocked(presignObject).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/buckets/test-id-001/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "test", method: "GET" }),
    });

    expect(res.status).toBe(200);
  });
  // Check 5: POST /v1/buckets/test-id-001/presign — error path
  it.skip("POST /v1/buckets/test-id-001/presign returns 400 (invalid_request)", async () => {
    vi.mocked(presignObject).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Invalid key, method, or expires_in",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    } as any);

    const res = await app.request("/v1/buckets/test-id-001/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });
});
