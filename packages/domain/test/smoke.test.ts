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
}));

describe("domain.sh app", () => {
  it("exposes a default export", async () => {
    const mod = await import("../src/index");
    expect(mod.default).toBeDefined();
  });
});
