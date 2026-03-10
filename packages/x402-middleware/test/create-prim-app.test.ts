// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MiddlewareHandler } from "hono";
import { createPrimApp } from "../src/create-prim-app.ts";
import type { PrimAppConfig, PrimAppDeps } from "../src/create-prim-app.ts";
import type { CreditLedger } from "../src/types.ts";

/**
 * Passthrough deps — createAgentStackMiddleware returns a no-op middleware,
 * createWalletAllowlistChecker returns a stub. This avoids hitting real
 * facilitator/wallet endpoints while testing createPrimApp's own wiring.
 */
const passthroughDeps: PrimAppDeps = {
  createAgentStackMiddleware: (() => {
    const handler: MiddlewareHandler = async (_c, next) => next();
    return handler;
  }) as unknown as PrimAppDeps["createAgentStackMiddleware"],
  createWalletAllowlistChecker: (() => async () =>
    true) as unknown as PrimAppDeps["createWalletAllowlistChecker"],
};

function baseConfig(overrides: Partial<PrimAppConfig> = {}): PrimAppConfig {
  return {
    serviceName: "test.sh",
    routes: { "POST /v1/test": "$0.01" },
    metricsName: "test.prim.sh",
    skipAccessLog: true,
    ...overrides,
  };
}

describe("createPrimApp boot", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ── 1. llmsTxtPath undefined → no crash ────────────────────────────────
  it("boots when llmsTxtPath is undefined", () => {
    vi.stubEnv("REVENUE_WALLET", "0xPayTo");

    const app = createPrimApp(baseConfig({ llmsTxtPath: undefined }), passthroughDeps);
    expect(app).toBeDefined();
  });

  // ── 2. llmsTxtPath points to non-existent file → no crash ──────────────
  it("boots when llmsTxtPath points to a non-existent file", () => {
    vi.stubEnv("REVENUE_WALLET", "0xPayTo");

    const fakePath = join(tmpdir(), `prim-test-${Date.now()}-does-not-exist.txt`);
    const app = createPrimApp(baseConfig({ llmsTxtPath: fakePath }), passthroughDeps);
    expect(app).toBeDefined();
  });

  // ── 3. Throws when REVENUE_WALLET missing and freeService is false ────────
  it("throws when REVENUE_WALLET is not set and freeService is false", () => {
    // biome-ignore lint/performance/noDelete: env vars require delete to remove
    delete process.env.REVENUE_WALLET;

    expect(() => createPrimApp(baseConfig(), passthroughDeps)).toThrowError(
      "REVENUE_WALLET environment variable is required",
    );
  });

  // ── 4. Boots when freeService is true (no REVENUE_WALLET needed) ──────────
  it("boots when freeService is true without REVENUE_WALLET", () => {
    // biome-ignore lint/performance/noDelete: env vars require delete to remove
    delete process.env.REVENUE_WALLET;

    const app = createPrimApp(baseConfig({ freeService: true }), passthroughDeps);
    expect(app).toBeDefined();
  });

  // ── 5. GET / → 200 with correct health check response ──────────────────
  it("responds 200 on GET / with { service, status: 'ok' }", async () => {
    vi.stubEnv("REVENUE_WALLET", "0xPayTo");

    const app = createPrimApp(baseConfig(), passthroughDeps);
    const res = await app.request("/", { method: "GET" });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ service: "test.sh", status: "ok" });
    expect(body.network).toMatch(/^eip155:\d+$/);
  });
});

function createMockLedger(balance = "0.000000"): CreditLedger {
  return {
    getBalance: vi.fn().mockReturnValue(balance),
    addCredit: vi.fn(),
    deductCredit: vi.fn(),
    settle: vi.fn(),
    expireInactive: vi.fn().mockReturnValue(0),
    getHistory: vi.fn().mockReturnValue([]),
    close: vi.fn(),
  };
}

describe("createPrimApp metered billing", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("boots with metered config and creditLedger dep", () => {
    vi.stubEnv("REVENUE_WALLET", "0xPayTo");
    const ledger = createMockLedger();

    const app = createPrimApp(
      baseConfig({ metered: { dbPath: "/tmp/test-credit.db" } }),
      { ...passthroughDeps, creditLedger: ledger },
    );

    expect(app).toBeDefined();
    expect(app.creditLedger).toBe(ledger);
  });

  it("registers GET /v1/credit endpoint when creditLedger is provided", async () => {
    vi.stubEnv("REVENUE_WALLET", "0xPayTo");
    const ledger = createMockLedger("1.500000");

    const app = createPrimApp(
      baseConfig({ metered: { dbPath: "/tmp/test-credit.db" } }),
      { ...passthroughDeps, creditLedger: ledger },
    );

    const res = await app.request(
      "/v1/credit?wallet=0x1234567890abcdef1234567890abcdef12345678",
      { method: "GET" },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.balance_usdc).toBe("1.500000");
    expect(body.updated_at).toBeDefined();
    expect(ledger.getBalance).toHaveBeenCalledWith(
      "0x1234567890abcdef1234567890abcdef12345678",
    );
  });

  it("GET /v1/credit returns 400 for missing wallet param", async () => {
    vi.stubEnv("REVENUE_WALLET", "0xPayTo");
    const ledger = createMockLedger();

    const app = createPrimApp(
      baseConfig({ metered: { dbPath: "/tmp/test-credit.db" } }),
      { ...passthroughDeps, creditLedger: ledger },
    );

    const res = await app.request("/v1/credit", { method: "GET" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_request");
  });

  it("GET /v1/credit returns 400 for invalid wallet address", async () => {
    vi.stubEnv("REVENUE_WALLET", "0xPayTo");
    const ledger = createMockLedger();

    const app = createPrimApp(
      baseConfig({ metered: { dbPath: "/tmp/test-credit.db" } }),
      { ...passthroughDeps, creditLedger: ledger },
    );

    const res = await app.request("/v1/credit?wallet=not-a-wallet", { method: "GET" });
    expect(res.status).toBe(400);
  });

  it("does not register /v1/credit when no creditLedger is provided", async () => {
    vi.stubEnv("REVENUE_WALLET", "0xPayTo");

    const app = createPrimApp(baseConfig(), passthroughDeps);

    const res = await app.request(
      "/v1/credit?wallet=0x1234567890abcdef1234567890abcdef12345678",
      { method: "GET" },
    );

    expect(res.status).toBe(404);
  });

  it("passes creditLedger to createAgentStackMiddleware", () => {
    vi.stubEnv("REVENUE_WALLET", "0xPayTo");
    const ledger = createMockLedger();

    const spyMiddleware = vi.fn((_opts, _routes) => {
      const handler: MiddlewareHandler = async (_c, next) => next();
      return handler;
    });

    createPrimApp(
      baseConfig({ metered: { dbPath: "/tmp/test-credit.db" } }),
      {
        createAgentStackMiddleware: spyMiddleware as unknown as PrimAppDeps["createAgentStackMiddleware"],
        createWalletAllowlistChecker: passthroughDeps.createWalletAllowlistChecker,
        creditLedger: ledger,
      },
    );

    expect(spyMiddleware).toHaveBeenCalledTimes(1);
    const opts = spyMiddleware.mock.calls[0][0];
    expect(opts.creditLedger).toBe(ledger);
    expect(opts.freeRoutes).toContain("GET /v1/credit");
  });

  it("does not expose creditLedger on app when not provided", () => {
    vi.stubEnv("REVENUE_WALLET", "0xPayTo");

    const app = createPrimApp(baseConfig(), passthroughDeps);
    expect(app.creditLedger).toBeUndefined();
  });
});
