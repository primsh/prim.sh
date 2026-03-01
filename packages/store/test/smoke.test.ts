import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.PRIM_NETWORK = "eip155:8453";
  process.env.PRIM_PAY_TO = "0x0000000000000000000000000000000000000001";
});

import { mockX402Middleware } from "@primsh/x402-middleware/testing";

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

// Mock the service layer so smoke tests don't need real Cloudflare/S3 creds
vi.mock("../src/service.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/service.ts")>();
  return {
    ...original,
    createBucket: vi.fn(),
    listBuckets: vi.fn(),
    getBucket: vi.fn(),
    deleteBucket: vi.fn(),
    putObject: vi.fn(),
    getObject: vi.fn(),
    deleteObject: vi.fn(),
    listObjects: vi.fn(),
    getUsage: vi.fn(),
    setQuotaForBucket: vi.fn(),
    reconcileUsage: vi.fn(),
  };
});

import type { CreateBucketResponse } from "../src/api.ts";
import app from "../src/index.ts";
import { createBucket } from "../src/service.ts";

const MOCK_BUCKET: CreateBucketResponse = {
  bucket: {
    id: "b_abcd1234",
    name: "my-test-bucket",
    location: "us-east-1",
    owner_wallet: "0x0000000000000000000000000000000000000001",
    quota_bytes: 104857600,
    usage_bytes: 0,
    created_at: "2026-02-26T00:00:00.000Z",
  },
};

describe("store.sh app", () => {
  beforeEach(() => {
    vi.mocked(createBucket).mockReset();
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

  // Check 3: x402 middleware is wired with correct paid routes and payTo address
  it("x402 middleware is registered with paid routes and payTo", () => {
    expect(createAgentStackMiddlewareSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        payTo: expect.any(String),
        freeRoutes: expect.arrayContaining(["GET /"]),
      }),
      expect.objectContaining({ "POST /v1/buckets": expect.any(String) }),
    );
  });

  // Check 4: happy path — POST /v1/buckets returns 201 with bucket data
  it("POST /v1/buckets with valid data returns 201 with bucket", async () => {
    vi.mocked(createBucket).mockResolvedValueOnce({ ok: true, data: MOCK_BUCKET });

    const res = await app.request("/v1/buckets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "my-test-bucket" }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as CreateBucketResponse;
    expect(body.bucket.id).toBe("b_abcd1234");
    expect(body.bucket.name).toBe("my-test-bucket");
    expect(typeof body.bucket.usage_bytes).toBe("number");
  });

  // Check 5: 400 on invalid bucket name — service returns invalid_request → handler maps to 400
  it("POST /v1/buckets with invalid bucket name returns 400", async () => {
    vi.mocked(createBucket).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Invalid bucket name.",
    });

    const res = await app.request("/v1/buckets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "INVALID NAME!" }),
    });

    expect(res.status).toBe(400);
  });
});
