import { describe, expect, it, vi } from "vitest";

vi.mock("bun:sqlite", () => {
  class MockDatabase {
    run() {}
    query() {
      return { get: () => null, all: () => [], run: () => {} };
    }
  }
  return { Database: MockDatabase };
});

describe("relay.sh app", () => {
  it("exposes a default export", async () => {
    const mod = await import("../src/index");
    expect(mod.default).toBeDefined();
  });
});
