import { describe, expect, it, vi } from "vitest";

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
}));

describe("domain.sh app", () => {
  it("exposes a default export", async () => {
    const mod = await import("../src/index");
    expect(mod.default).toBeDefined();
  });
});
