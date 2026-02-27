import { describe, expect, it } from "vitest";

// Fail-fast guard requires PRIM_PAY_TO to be set
process.env.PRIM_PAY_TO = "0x0000000000000000000000000000000000000001";

import app from "../src/index";

describe("spawn.sh app", () => {
  it("exposes a default export", () => {
    expect(app).toBeDefined();
  });
});
