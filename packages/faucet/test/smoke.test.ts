import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.PRIM_NETWORK = "eip155:84532"; // testnet for free service
});

// Stub bun:sqlite so db.ts doesn't fail in vitest (Node runtime)
vi.mock("bun:sqlite", () => {
  class MockDatabase {
    run() {}
    query() {
      return { get: () => null, all: () => [], run: () => {} };
    }
  }
  return { Database: MockDatabase };
});

// Bypass x402 middleware for unit tests.
vi.mock("@primsh/x402-middleware", async (importOriginal) => {
  const original = await importOriginal<typeof import("@primsh/x402-middleware")>();
  return {
    ...original,
    createWalletAllowlistChecker: vi.fn(() => () => Promise.resolve(true)),
  };
});

// Mock the service so smoke tests don't need a real API key
vi.mock("../src/service.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/service.ts")>();
  return {
    ...original,
    dripUsdc: vi.fn(),
    dripEth: vi.fn(),
  };
});

import app from "../src/index.ts";
import { dripUsdc } from "../src/service.ts";
// BEGIN:GENERATED:SMOKE
describe("faucet.sh app", () => {
  beforeEach(() => {
    vi.mocked(dripUsdc).mockReset();
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

  // Check 4: happy path — handler returns 200 with mocked service response
  it("POST /v1/faucet/usdc returns 200 with valid response", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock shape — smoke test only checks status code
    vi.mocked(dripUsdc).mockResolvedValueOnce({} as any);

    const res = await app.request("/v1/faucet/usdc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: "0x0000000000000000000000000000000000000001" }),
    });

    expect(res.status).toBe(200);
  });

  // Check 5: 400 on missing/invalid input — service returns invalid_request → handler maps to 400
  it("POST /v1/faucet/usdc with missing/invalid input returns 400", async () => {
    const res = await app.request("/v1/faucet/usdc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });
});
// END:GENERATED:SMOKE
