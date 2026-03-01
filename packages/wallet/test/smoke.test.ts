// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest";

// Fail-fast guard requires PRIM_PAY_TO to be set — vi.hoisted runs before ES imports
vi.hoisted(() => {
  process.env.PRIM_PAY_TO = "0x0000000000000000000000000000000000000001";
});

import app from "../src/index";

describe("wallet.sh app", () => {
  it("exposes a default export", () => {
    expect(app).toBeDefined();
  });
});
