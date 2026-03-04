// SPDX-License-Identifier: Apache-2.0
/**
 * stdin.ts unit tests — shared readStdin() helper.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { readStdin } from "../src/stdin.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

function mockStdin(chunks: Buffer[]): void {
  let index = 0;
  const mock = {
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<{ value: Buffer | undefined; done: boolean }> {
          if (index < chunks.length) {
            return { value: chunks[index++], done: false };
          }
          return { value: undefined, done: true };
        },
      };
    },
  };
  Object.defineProperty(process, "stdin", { value: mock, configurable: true });
}

describe("readStdin", () => {
  it("concatenates multiple chunks into a single Buffer", async () => {
    mockStdin([Buffer.from("hello "), Buffer.from("world")]);
    const result = await readStdin();
    expect(result.toString("utf-8")).toBe("hello world");
  });

  it("returns empty buffer when stdin has no data", async () => {
    mockStdin([]);
    const result = await readStdin();
    expect(result.length).toBe(0);
  });

  it("handles binary data", async () => {
    const binary = Buffer.from([0x00, 0xff, 0x80, 0x7f]);
    mockStdin([binary]);
    const result = await readStdin();
    expect(result).toEqual(binary);
  });
});
