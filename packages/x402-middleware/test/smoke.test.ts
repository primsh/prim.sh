import { describe, expect, it } from "vitest";
import { createX402Middleware } from "../src/middleware";

describe("x402 middleware", () => {
  it("creates a middleware function", () => {
    const middleware = createX402Middleware(
      { facilitatorUrl: "https://x402.example", network: "eip155:8453" },
      [],
    );

    expect(typeof middleware).toBe("function");
  });
});

