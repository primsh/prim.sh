import { describe, expect, it } from "vitest";

process.env.PRIM_NETWORK = "eip155:8453";

import app from "../src/index.ts";

describe("search.sh app", () => {
  it("exposes a default export", () => {
    expect(app).toBeDefined();
  });
});
