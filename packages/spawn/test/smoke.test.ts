import { describe, expect, it } from "vitest";
import app from "../src/index";

describe("spawn.sh app", () => {
  it("exposes a default export", () => {
    expect(app).toBeDefined();
  });
});

