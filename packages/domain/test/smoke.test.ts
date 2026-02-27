import { describe, expect, it, vi } from "vitest";

process.env.PRIM_PAY_TO = "0x0000000000000000000000000000000000000001";

vi.mock("hono", () => {
  class MockHono {
    use() {}
    get() {}
    post() {}
    put() {}
    delete() {}
  }
  return { Hono: MockHono };
});

vi.mock("@primsh/x402-middleware", () => ({
  createAgentStackMiddleware:
    () =>
    async (_c: unknown, next: () => Promise<void>): Promise<void> => {
      await next();
    },
  createWalletAllowlistChecker: () => async (_address: string) => true,
  requestIdMiddleware: () => async (_c: unknown, next: () => Promise<void>) => { await next(); },
  createLogger: () => ({ info() {}, warn() {}, error() {}, debug() {}, child() { return this; } }),
  getNetworkConfig: () => ({ network: "eip155:8453", chainId: 8453, rpcUrl: "https://mainnet.base.org", usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", isTestnet: false }),
  forbidden: (message: string) => ({ error: { code: "forbidden", message } }),
  notFound: (message: string) => ({ error: { code: "not_found", message } }),
  invalidRequest: (message: string) => ({ error: { code: "invalid_request", message } }),
  serviceError: (message: string) => ({ error: { code: "service_error", message } }),
}));

describe("domain.sh app", () => {
  it("exposes a default export", async () => {
    const mod = await import("../src/index");
    expect(mod.default).toBeDefined();
  });
});
