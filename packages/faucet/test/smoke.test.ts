// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Regenerate: pnpm gen:tests
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.PRIM_NETWORK = "eip155:84532"; // testnet for free service
});

// Stub bun:sqlite so db.ts doesn't fail in vitest (Node runtime)
import { mockBunSqlite, mockX402Middleware } from "@primsh/x402-middleware/testing";
vi.mock("bun:sqlite", () => mockBunSqlite());

vi.mock("@primsh/x402-middleware", async (importOriginal) => {
  const original = await importOriginal<typeof import("@primsh/x402-middleware")>();
  const mocks = mockX402Middleware();
  return {
    ...original,
    createAgentStackMiddleware: vi.fn(mocks.createAgentStackMiddleware),
    createWalletAllowlistChecker: vi.fn(mocks.createWalletAllowlistChecker),
  };
});

// Mock the service so smoke tests don't need a real API key
vi.mock("../src/service.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/service.ts")>();
  return {
    ...original,
    getTreasuryBalance: vi.fn(),
    refillTreasury: vi.fn(),
    dripUsdc: vi.fn(),
    dripEth: vi.fn(),
  };
});

import app from "../src/index.ts";
import { dripUsdc, dripEth, getTreasuryBalance, refillTreasury } from "../src/service.ts";

describe("faucet.sh app", () => {
  beforeEach(() => {
    vi.mocked(dripUsdc).mockReset();
    vi.mocked(dripEth).mockReset();
    vi.mocked(getTreasuryBalance).mockReset();
    vi.mocked(refillTreasury).mockReset();
  });

  // Check 1: default export defined
  it("exposes a default export", () => {
    expect(app).toBeDefined();
  });

  // Check 2: GET / returns health response
  it("GET / returns { service: 'faucet.sh', status: 'ok' }", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ service: "faucet.sh", status: "ok" });
  });

  // Check 4: POST /v1/faucet/usdc — happy path
  it("POST /v1/faucet/usdc returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(dripUsdc).mockResolvedValueOnce({} as any);

    const res = await app.request("/v1/faucet/usdc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: "0x0000000000000000000000000000000000000001" }),
    });

    expect(res.status).toBe(200);
  });

  // Check 5: POST /v1/faucet/usdc — error path
  it("POST /v1/faucet/usdc returns 400 (invalid_request)", async () => {
    const res = await app.request("/v1/faucet/usdc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: POST /v1/faucet/eth — happy path
  it("POST /v1/faucet/eth returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(dripEth).mockResolvedValueOnce({} as any);

    const res = await app.request("/v1/faucet/eth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: "0x0000000000000000000000000000000000000001" }),
    });

    expect(res.status).toBe(200);
  });

  // Check 5: POST /v1/faucet/eth — error path
  it("POST /v1/faucet/eth returns 400 (invalid_request)", async () => {
    const res = await app.request("/v1/faucet/eth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: GET /v1/faucet/status — happy path
  it("GET /v1/faucet/status returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(getTreasuryBalance).mockResolvedValueOnce({} as any);

    const res = await app.request(
      "/v1/faucet/status?address=0x0000000000000000000000000000000000000001",
      {
        method: "GET",
      },
    );

    expect(res.status).toBe(200);
  });

  // Check 5: GET /v1/faucet/status — error path
  it("GET /v1/faucet/status returns 400 (invalid_request)", async () => {
    const res = await app.request("/v1/faucet/status", {
      method: "GET",
    });
    expect(res.status).toBe(400);
  });

  // Check 4: GET /v1/faucet/treasury — happy path
  it("GET /v1/faucet/treasury returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(getTreasuryBalance).mockResolvedValueOnce({} as any);

    const res = await app.request("/v1/faucet/treasury", {
      method: "GET",
    });

    expect(res.status).toBe(200);
  });

  // Check 4: POST /v1/faucet/refill — happy path
  it("POST /v1/faucet/refill returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(refillTreasury).mockResolvedValueOnce({} as any);

    const res = await app.request("/v1/faucet/refill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
  });
});
