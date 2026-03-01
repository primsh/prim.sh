/**
 * Shared test mocks for primitive smoke tests.
 *
 * Exported via "@primsh/x402-middleware/testing" so test files can import
 * without pulling in the full middleware at runtime.
 */

/** Mock bun:sqlite for vitest (Node runtime). */
export function mockBunSqlite() {
  return {
    Database: class MockDatabase {
      run() {}
      query() {
        return { get: () => null, all: () => [], run: () => {} };
      }
    },
  };
}

/**
 * Mock x402 middleware passthrough for smoke tests.
 *
 * Returns plain functions (not vi.fn()) since vitest isn't available in the library.
 * Tests that need spy assertions should wrap with vi.fn() at call site.
 */
export function mockX402Middleware(walletAddress = "0x0000000000000000000000000000000000000001") {
  return {
    createAgentStackMiddleware: () =>
      async (c: { set: (key: string, value: string) => void }, next: () => Promise<void>) => {
        c.set("walletAddress", walletAddress);
        await next();
      },
    createWalletAllowlistChecker: () => () => Promise.resolve(true),
  };
}
