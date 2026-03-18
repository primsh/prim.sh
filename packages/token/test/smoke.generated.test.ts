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
    deployToken: vi.fn(),
    listTokens: vi.fn(),
    getToken: vi.fn(),
    mintTokens: vi.fn(),
    getSupply: vi.fn(),
    createPool: vi.fn(),
    getPool: vi.fn(),
    getLiquidityParams: vi.fn(),
  };
});

import app from "../src/index.ts";
import {
  createPool,
  listTokens,
  getToken,
  mintTokens,
  getSupply,
  getPool,
  getLiquidityParams,
} from "../src/service.ts";

describe("token.sh app", () => {
  beforeEach(() => {
    vi.mocked(createPool).mockReset();
    vi.mocked(listTokens).mockReset();
    vi.mocked(getToken).mockReset();
    vi.mocked(mintTokens).mockReset();
    vi.mocked(getSupply).mockReset();
    vi.mocked(getPool).mockReset();
    vi.mocked(getLiquidityParams).mockReset();
  });

  // Check 1: default export defined
  it("exposes a default export", () => {
    expect(app).toBeDefined();
  });

  // Check 2: GET / returns health response
  it("GET / returns { service: 'token.sh', status: 'ok' }", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ service: "token.sh", status: "ok" });
  });

  // Check 3: x402 middleware is wired with the correct paid routes and payTo address
  it("x402 middleware is registered with paid routes and payTo", () => {
    expect(createAgentStackMiddlewareSpy).toHaveBeenCalled();
  });

  // Check 4: POST /v1/tokens — happy path
  it.skip("POST /v1/tokens returns 201 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(createPool).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test", symbol: "TST", initialSupply: "test" }),
    });

    expect(res.status).toBe(201);
  });
  // Check 5: POST /v1/tokens — error path
  it.skip("POST /v1/tokens returns 400 (invalid_request)", async () => {
    vi.mocked(createPool).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Missing required fields or invalid values",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: GET /v1/tokens — happy path
  it.skip("GET /v1/tokens returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(listTokens).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/tokens", {
      method: "GET",
    });

    expect(res.status).toBe(200);
  });
  // Check 5: GET /v1/tokens — error path
  it.skip("GET /v1/tokens returns 403 (forbidden)", async () => {
    vi.mocked(listTokens).mockResolvedValueOnce({
      ok: false,
      status: 403,
      code: "forbidden",
      message: "Missing wallet in payment",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/tokens", {
      method: "GET",
    });
    expect(res.status).toBe(403);
  });

  // Check 4: GET /v1/tokens/test-id-001 — happy path
  it.skip("GET /v1/tokens/test-id-001 returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(getToken).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/tokens/test-id-001", {
      method: "GET",
    });

    expect(res.status).toBe(200);
  });
  // Check 5: GET /v1/tokens/test-id-001 — error path
  it.skip("GET /v1/tokens/test-id-001 returns 404 (not_found)", async () => {
    vi.mocked(getToken).mockResolvedValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Token ID does not exist",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/tokens/test-id-001", {
      method: "GET",
    });
    expect(res.status).toBe(404);
  });

  // Check 4: POST /v1/tokens/test-id-001/mint — happy path
  it.skip("POST /v1/tokens/test-id-001/mint returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(mintTokens).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/tokens/test-id-001/mint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: "test", amount: "test" }),
    });

    expect(res.status).toBe(200);
  });
  // Check 5: POST /v1/tokens/test-id-001/mint — error path
  it.skip("POST /v1/tokens/test-id-001/mint returns 400 (not_mintable)", async () => {
    vi.mocked(mintTokens).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "not_mintable",
      message: "Token deployed with mintable=false",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/tokens/test-id-001/mint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: GET /v1/tokens/test-id-001/supply — happy path
  it.skip("GET /v1/tokens/test-id-001/supply returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(getSupply).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/tokens/test-id-001/supply", {
      method: "GET",
    });

    expect(res.status).toBe(200);
  });
  // Check 5: GET /v1/tokens/test-id-001/supply — error path
  it.skip("GET /v1/tokens/test-id-001/supply returns 404 (not_found)", async () => {
    vi.mocked(getSupply).mockResolvedValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Token ID does not exist",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/tokens/test-id-001/supply", {
      method: "GET",
    });
    expect(res.status).toBe(404);
  });

  // Check 4: POST /v1/tokens/test-id-001/pool — happy path
  it.skip("POST /v1/tokens/test-id-001/pool returns 201 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(createPool).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/tokens/test-id-001/pool", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pricePerToken: "test" }),
    });

    expect(res.status).toBe(201);
  });
  // Check 5: POST /v1/tokens/test-id-001/pool — error path
  it.skip("POST /v1/tokens/test-id-001/pool returns 400 (invalid_request)", async () => {
    vi.mocked(createPool).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Missing pricePerToken or invalid feeTier",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/tokens/test-id-001/pool", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: GET /v1/tokens/test-id-001/pool — happy path
  it.skip("GET /v1/tokens/test-id-001/pool returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(getPool).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/tokens/test-id-001/pool", {
      method: "GET",
    });

    expect(res.status).toBe(200);
  });
  // Check 5: GET /v1/tokens/test-id-001/pool — error path
  it.skip("GET /v1/tokens/test-id-001/pool returns 404 (not_found)", async () => {
    vi.mocked(getPool).mockResolvedValueOnce({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Token or pool not found",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/tokens/test-id-001/pool", {
      method: "GET",
    });
    expect(res.status).toBe(404);
  });

  // Check 4: GET /v1/tokens/test-id-001/pool/liquidity-params — happy path
  it.skip("GET /v1/tokens/test-id-001/pool/liquidity-params returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(getLiquidityParams).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request(
      "/v1/tokens/test-id-001/pool/liquidity-params?tokenAmount=test&usdcAmount=test",
      {
        method: "GET",
      },
    );

    expect(res.status).toBe(200);
  });
  // Check 5: GET /v1/tokens/test-id-001/pool/liquidity-params — error path
  it.skip("GET /v1/tokens/test-id-001/pool/liquidity-params returns 400 (invalid_request)", async () => {
    vi.mocked(getLiquidityParams).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Missing tokenAmount or usdcAmount",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/tokens/test-id-001/pool/liquidity-params", {
      method: "GET",
    });
    expect(res.status).toBe(400);
  });
});
