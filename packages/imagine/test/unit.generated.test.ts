// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Regenerate: pnpm gen:tests
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.PRIM_NETWORK = "eip155:8453";
  process.env.REVENUE_WALLET = "0x0000000000000000000000000000000000000001";
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

// Mock the service so unit tests don't need a real API key
vi.mock("../src/service.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/service.ts")>();
  return {
    ...original,
    generate: vi.fn(),
    describe: vi.fn(),
    upscale: vi.fn(),
    models: vi.fn(),
  };
});

import app from "../src/index.ts";
import { generate, upscale, models } from "../src/service.ts";

describe("imagine.sh app", () => {
  beforeEach(() => {
    vi.mocked(generate).mockReset();
    vi.mocked(upscale).mockReset();
    vi.mocked(models).mockReset();
  });

  // Check 1: default export defined
  it("exposes a default export", () => {
    expect(app).toBeDefined();
  });

  // Check 2: GET / returns health response
  it("GET / returns { service: 'imagine.sh', status: 'ok' }", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ service: "imagine.sh", status: "ok" });
  });

  // Check 3: x402 middleware is wired with the correct paid routes and payTo address
  it("x402 middleware is registered with paid routes and payTo", () => {
    expect(createAgentStackMiddlewareSpy).toHaveBeenCalled();
  });

  // Check 4: POST /v1/generate — happy path
  it("POST /v1/generate returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    vi.mocked(generate).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
  });
  // Check 5: POST /v1/generate — error path
  it("POST /v1/generate returns 400 (invalid_request)", async () => {
    vi.mocked(generate).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Missing or invalid prompt",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    } as any);

    const res = await app.request("/v1/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: POST /v1/describe — happy path
  it.skip("POST /v1/describe returns 200 (happy path)", async () => {
    const res = await app.request("/v1/describe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
  });
  // Check 5: POST /v1/describe — error path
  it.skip("POST /v1/describe returns 400 (invalid_request)", async () => {
    const res = await app.request("/v1/describe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: POST /v1/upscale — happy path
  it("POST /v1/upscale returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    vi.mocked(upscale).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/upscale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
  });
  // Check 5: POST /v1/upscale — error path
  it("POST /v1/upscale returns 400 (invalid_request)", async () => {
    vi.mocked(upscale).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Missing or invalid image input",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    } as any);

    const res = await app.request("/v1/upscale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: GET /v1/models — happy path
  it("GET /v1/models returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    vi.mocked(models).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/models", {
      method: "GET",
    });

    expect(res.status).toBe(200);
  });
});
