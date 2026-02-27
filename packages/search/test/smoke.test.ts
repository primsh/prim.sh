import { describe, expect, it } from "vitest";

process.env.PRIM_NETWORK = "eip155:8453";
process.env.PRIM_PAY_TO = "0x0000000000000000000000000000000000000001";

import app from "../src/index.ts";

describe("search.sh app", () => {
  it("exposes a default export", () => {
    expect(app).toBeDefined();
  });
});
