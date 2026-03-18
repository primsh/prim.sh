// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Regenerate: pnpm gen:tests
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.PRIM_NETWORK = "eip155:84532"; // testnet for free service
  process.env.REVENUE_WALLET = "0x0000000000000000000000000000000000000001";
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
    redeemInvite: vi.fn(),
    createCodes: vi.fn(),
    getCodes: vi.fn(),
    deleteCode: vi.fn(),
  };
});

import app from "../src/index.ts";
import { redeemInvite } from "../src/service.ts";

describe("gate.sh app", () => {
  beforeEach(() => {
    vi.mocked(redeemInvite).mockReset();
  });

  // Check 1: default export defined
  it("exposes a default export", () => {
    expect(app).toBeDefined();
  });

  // Check 2: GET / returns health response
  it("GET / returns { service: 'gate.sh', status: 'ok' }", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ service: "gate.sh", status: "ok" });
  });

  // Check 4: POST /v1/redeem — happy path
  it.skip("POST /v1/redeem returns 200 (happy path)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(redeemInvite).mockResolvedValueOnce({ ok: true, data: {} } as any);

    const res = await app.request("/v1/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "test", wallet: "test" }),
    });

    expect(res.status).toBe(200);
  });
  // Check 5: POST /v1/redeem — error path
  it.skip("POST /v1/redeem returns 400 (invalid_request)", async () => {
    vi.mocked(redeemInvite).mockResolvedValueOnce({
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Missing or invalid wallet address",
      // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    } as any);

    const res = await app.request("/v1/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });
});
