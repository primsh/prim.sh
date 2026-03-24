// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Regenerate: pnpm gen:tests
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.PRIM_NETWORK = "eip155:84532"; // testnet for free service
  process.env.REVENUE_WALLET = "0x0000000000000000000000000000000000000001";
});

import { mockX402Middleware } from "@primsh/x402-middleware/testing";

vi.mock("@primsh/x402-middleware", async (importOriginal) => {
  const original = await importOriginal<typeof import("@primsh/x402-middleware")>();
  const mocks = mockX402Middleware();
  return {
    ...original,
    createAgentStackMiddleware: vi.fn(mocks.createAgentStackMiddleware),
    createWalletAllowlistChecker: vi.fn(mocks.createWalletAllowlistChecker),
  };
});

// Mock the service so unit tests don't need a real API key
vi.mock("../src/service.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/service.ts")>();
  return {
    ...original,
    scaffold: vi.fn(),
    schema: vi.fn(),
    ports: vi.fn(),
  };
});

import app from "../src/index.ts";
import { scaffold, schema, ports } from "../src/service.ts";

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

  // Check 4: POST /v1/scaffold — happy path
  it("POST /v1/scaffold returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    vi.mocked(scaffold).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/scaffold", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spec: "test" }),
    });

    expect(res.status).toBe(200);
  });
  // Check 5: POST /v1/scaffold — error path
  it("POST /v1/scaffold returns 400 (invalid_request)", async () => {
    vi.mocked(scaffold).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Invalid or missing prim.yaml spec",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    } as any);

    const res = await app.request("/v1/scaffold", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: POST /v1/validate — happy path
  it.skip("POST /v1/validate returns 200 (happy path)", async () => {
    const res = await app.request("/v1/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spec: "test" }),
    });

    expect(res.status).toBe(200);
  });
  // Check 5: POST /v1/validate — error path
  it.skip("POST /v1/validate returns 400 (invalid_request)", async () => {
    const res = await app.request("/v1/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: GET /v1/schema — happy path
  it("GET /v1/schema returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    vi.mocked(schema).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/schema", {
      method: "GET",
    });

    expect(res.status).toBe(200);
  });

  // Check 4: GET /v1/ports — happy path
  it("GET /v1/ports returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — unit test only checks status code
    vi.mocked(ports).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/ports", {
      method: "GET",
    });

    expect(res.status).toBe(200);
  });
});
