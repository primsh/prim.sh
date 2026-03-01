// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MiddlewareHandler } from "hono";
import { createPrimApp } from "../src/create-prim-app.ts";
import type { PrimAppConfig, PrimAppDeps } from "../src/create-prim-app.ts";

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
  createWalletAllowlistChecker: (() =>
    async () => true) as unknown as PrimAppDeps["createWalletAllowlistChecker"],
};

function baseConfig(overrides: Partial<PrimAppConfig> = {}): PrimAppConfig {
  return {
    serviceName: "test.sh",
    routes: { "POST /v1/test": "$0.01" },
    metricsName: "test.prim.sh",
    ...overrides,
  };
}

describe("createPrimApp boot", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ── 1. llmsTxtPath undefined → no crash ────────────────────────────────
  it("boots when llmsTxtPath is undefined", () => {
    vi.stubEnv("PRIM_PAY_TO", "0xPayTo");

    const app = createPrimApp(baseConfig({ llmsTxtPath: undefined }), passthroughDeps);
    expect(app).toBeDefined();
  });

  // ── 2. llmsTxtPath points to non-existent file → no crash ──────────────
  it("boots when llmsTxtPath points to a non-existent file", () => {
    vi.stubEnv("PRIM_PAY_TO", "0xPayTo");

    const fakePath = join(tmpdir(), `prim-test-${Date.now()}-does-not-exist.txt`);
    const app = createPrimApp(baseConfig({ llmsTxtPath: fakePath }), passthroughDeps);
    expect(app).toBeDefined();
  });

  // ── 3. Throws when PRIM_PAY_TO missing and freeService is false ────────
  it("throws when PRIM_PAY_TO is not set and freeService is false", () => {
    // biome-ignore lint/performance/noDelete: env vars require delete to remove
    delete process.env.PRIM_PAY_TO;

    expect(() => createPrimApp(baseConfig(), passthroughDeps)).toThrowError(
      "PRIM_PAY_TO environment variable is required",
    );
  });

  // ── 4. Boots when freeService is true (no PRIM_PAY_TO needed) ──────────
  it("boots when freeService is true without PRIM_PAY_TO", () => {
    // biome-ignore lint/performance/noDelete: env vars require delete to remove
    delete process.env.PRIM_PAY_TO;

    const app = createPrimApp(baseConfig({ freeService: true }), passthroughDeps);
    expect(app).toBeDefined();
  });

  // ── 5. GET / → 200 with correct health check response ──────────────────
  it("responds 200 on GET / with { service, status: 'ok' }", async () => {
    vi.stubEnv("PRIM_PAY_TO", "0xPayTo");

    const app = createPrimApp(baseConfig(), passthroughDeps);
    const res = await app.request("/", { method: "GET" });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ service: "test.sh", status: "ok" });
  });
});
