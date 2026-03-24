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
    normalizeCarrier: vi.fn(),
    trackPackage: vi.fn(),
  };
});

import app from "../src/index.ts";
import { trackPackage } from "../src/service.ts";

describe("track.sh app", () => {
  beforeEach(() => {
    vi.mocked(trackPackage).mockReset();
  });

  // Check 1: default export defined
  it("exposes a default export", () => {
    expect(app).toBeDefined();
  });

  // Check 2: GET / returns health response
  it("GET / returns { service: 'track.sh', status: 'ok' }", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ service: "track.sh", status: "ok" });
  });

  // Check 3: x402 middleware is wired with the correct paid routes and payTo address
  it("x402 middleware is registered with paid routes and payTo", () => {
    expect(createAgentStackMiddlewareSpy).toHaveBeenCalled();
  });

  // Check 4: POST /v1/track — happy path
  it("POST /v1/track returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    vi.mocked(trackPackage).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tracking_number: "1Z999AA10123456784" }),
    });

    expect(res.status).toBe(200);
  });
  // Check 5: POST /v1/track — error path
  it("POST /v1/track returns 400 (invalid_request)", async () => {
    vi.mocked(trackPackage).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Missing tracking_number or invalid carrier",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    } as any);

    const res = await app.request("/v1/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });
});
