// SPDX-License-Identifier: Apache-2.0
/**
 * Verify generated CLI command files contain stdin fallback code
 * when stdin_field is declared in prim.yaml.
 *
 * This is a structural test — it reads the generated source and checks
 * for expected patterns. If gen-cli regresses, these tests catch it.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CLI_SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../src");

describe("infer-commands.ts (generated)", () => {
  const source = readFileSync(resolve(CLI_SRC, "infer-commands.ts"), "utf-8");

  it("imports readStdin", () => {
    expect(source).toContain('import { readStdin } from "./stdin.ts"');
  });

  it("uses let for messages (stdin-enabled field)", () => {
    expect(source).toContain('let messages = getFlag("messages", argv)');
  });

  it("has stdin fallback for messages", () => {
    expect(source).toContain("if (!messages && !process.stdin.isTTY)");
    expect(source).toContain('messages = (await readStdin()).toString("utf-8").trimEnd()');
  });

  it("uses let for input (stdin-enabled field)", () => {
    expect(source).toContain('let input = getFlag("input", argv)');
  });

  it("has stdin fallback for input", () => {
    expect(source).toContain("if (!input && !process.stdin.isTTY)");
    expect(source).toContain('input = (await readStdin()).toString("utf-8").trimEnd()');
  });

  it("shows stdin in usage strings", () => {
    expect(source).toContain("| stdin");
  });
});

describe("imagine-commands.ts (generated, no body props)", () => {
  const source = readFileSync(resolve(CLI_SRC, "imagine-commands.ts"), "utf-8");

  it("does NOT import readStdin when stdin_field has no matching body prop", () => {
    expect(source).not.toContain("readStdin");
  });
});
