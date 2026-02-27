import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Context, Next } from "hono";

process.env.PRIM_NETWORK = "eip155:8453";
process.env.PRIM_PAY_TO = "0x0000000000000000000000000000000000000001";

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
    scaffold: vi.fn(),
    validate: vi.fn(),
    schema: vi.fn(),
    ports: vi.fn()
  };
});

import app from "../src/index.ts";
import { scaffold, schema, ports } from "../src/service.ts";
import { createAgentStackMiddleware } from "@primsh/x402-middleware";
import type { ScaffoldResponse } from "../src/api.ts";

const MOCK_SCAFFOLD_RESPONSE: ScaffoldResponse = {
  id: "test-prim",
  files: [
    { path: "packages/test-prim/package.json", content: '{"name":"@primsh/test-prim"}' },
    { path: "packages/test-prim/src/index.ts", content: "// index" },
  ],
};

describe("create.sh app", () => {
  beforeEach(() => {
    vi.mocked(scaffold).mockReset();
    vi.mocked(schema).mockReset();
    vi.mocked(ports).mockReset();
  });

  // Check 1: default export defined
  it("exposes a default export", () => {
    expect(app).toBeDefined();
  });

  // Check 2: GET / returns health response
  it("GET / returns { service: 'create.sh', status: 'ok' }", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ service: "create.sh", status: "ok" });
  });

  // Check 3: x402 middleware is wired with the correct paid routes and payTo address
  it("x402 middleware is registered with paid routes and payTo", () => {
    expect(vi.mocked(createAgentStackMiddleware)).toHaveBeenCalledWith(
      expect.objectContaining({
        payTo: expect.any(String),
        freeRoutes: expect.arrayContaining(["GET /"]),
      }),
      expect.objectContaining({
        "POST /v1/scaffold": expect.any(String),
        "POST /v1/validate": expect.any(String),
        "GET /v1/schema": expect.any(String),
        "GET /v1/ports": expect.any(String)
      }),
    );
  });

  // Check 4: happy path — handler returns 200 with mocked service response
  it("POST /v1/scaffold with valid input returns 200", async () => {
    vi.mocked(scaffold).mockResolvedValueOnce({ ok: true, data: MOCK_SCAFFOLD_RESPONSE });

    const res = await app.request("/v1/scaffold", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spec: "id: test" }),
    });

    expect(res.status).toBe(200);
  });

  // Check 5: 400 on invalid input — service returns invalid_request → handler maps to 400
  it("POST /v1/scaffold with invalid input returns 400", async () => {
    vi.mocked(scaffold).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Invalid request",
    });

    const res = await app.request("/v1/scaffold", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  // Check 6: GET /v1/schema returns 200 without needing a JSON body
  it("GET /v1/schema returns 200 with schema", async () => {
    vi.mocked(schema).mockResolvedValueOnce({ ok: true, data: { schema: { type: "object" } } });
    const res = await app.request("/v1/schema");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("schema");
  });

  // Check 7: GET /v1/ports returns 200 without needing a JSON body
  it("GET /v1/ports returns 200 with port data", async () => {
    vi.mocked(ports).mockResolvedValueOnce({ ok: true, data: { allocated: [], next_available: 3020 } });
    const res = await app.request("/v1/ports");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("allocated");
    expect(body).toHaveProperty("next_available");
  });
});
