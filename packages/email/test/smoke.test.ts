import { describe, expect, it, vi } from "vitest";

// Fail-fast guard requires PRIM_PAY_TO to be set
process.env.PRIM_PAY_TO = "0x0000000000000000000000000000000000000001";

vi.mock("bun:sqlite", () => {
  class MockDatabase {
    run() {}
    query() {
      return { get: () => null, all: () => [], run: () => {} };
    }
  }
  return { Database: MockDatabase };
});

describe("email.sh app", () => {
  it("exposes a default export", async () => {
    const mod = await import("../src/index");
    expect(mod.default).toBeDefined();
  });
});
