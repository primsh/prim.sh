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
