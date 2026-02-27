import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Context, Next } from "hono";

vi.hoisted(() => {
  process.env.PRIM_NETWORK = "eip155:8453";
  process.env.PRIM_PAY_TO = "0x0000000000000000000000000000000000000001";
});

// Bypass x402 so the handler is reachable in unit tests.
// Middleware wiring is verified via check 3 (spy on createAgentStackMiddleware).
vi.mock("@primsh/x402-middleware", async (importOriginal) => {
  const original = await importOriginal<typeof import("@primsh/x402-middleware")>();
  return {
    ...original,
    createAgentStackMiddleware: vi.fn(
      () => async (_c: Context, next: Next) => { await next(); },
    ),
    createWalletAllowlistChecker: vi.fn(() => () => Promise.resolve(true)),
  };
});

// Mock the service so smoke tests don't need a real API key
vi.mock("../src/service.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/service.ts")>();
  return {
    ...original,
    generate: vi.fn(),
    describe: vi.fn(),
    upscale: vi.fn(),
    models: vi.fn()
  };
});

import app from "../src/index.ts";
import { generate } from "../src/service.ts";
import { createAgentStackMiddleware } from "@primsh/x402-middleware";
import type { GenerateResponse } from "../src/api.ts";

// TODO: Fill in a realistic mock response for GenerateResponse
const MOCK_RESPONSE: GenerateResponse = {} as GenerateResponse;

describe("imagine.sh app", () => {
  beforeEach(() => {
    vi.mocked(generate).mockReset();
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
    expect(vi.mocked(createAgentStackMiddleware)).toHaveBeenCalledWith(
      expect.objectContaining({
        payTo: expect.any(String),
        freeRoutes: expect.arrayContaining(["GET /"]),
      }),
      expect.objectContaining({
        "POST /v1/generate": expect.any(String),
        "POST /v1/describe": expect.any(String),
        "POST /v1/upscale": expect.any(String),
        "GET /v1/models": expect.any(String)
      }),
    );
  });

  // Check 4: happy path — handler returns 200 with mocked service response
  it("POST /v1/generate with valid input returns 200", async () => {
    vi.mocked(generate).mockResolvedValueOnce({ ok: true, data: MOCK_RESPONSE });

    const res = await app.request("/v1/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
  });

  // Check 5: 400 on invalid input — service returns invalid_request → handler maps to 400
  it("POST /v1/generate with invalid input returns 400", async () => {
    vi.mocked(generate).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Invalid request",
    });

    const res = await app.request("/v1/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
