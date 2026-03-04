// SPDX-License-Identifier: Apache-2.0
/**
 * mem-commands.ts stdin tests.
 *
 * Tests stdin fallback for `cache put` and `upsert` commands.
 * createPrimFetch is fully mocked — no network, no keystore.
 */

import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@primsh/x402-client", () => ({
  createPrimFetch: vi.fn(),
}));

vi.mock("@primsh/keystore", () => ({
  getConfig: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    readFileSync: vi.fn(),
  };
});

import { createPrimFetch } from "@primsh/x402-client";
import { getConfig } from "@primsh/keystore";
import { runMemCommand } from "../src/mem-commands.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockStdin(data: string): void {
  const buf = Buffer.from(data);
  let done = false;
  const mock = {
    isTTY: false as boolean | undefined,
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<{ value: Buffer | undefined; done: boolean }> {
          if (!done) {
            done = true;
            return { value: buf, done: false };
          }
          return { value: undefined, done: true };
        },
      };
    },
  };
  Object.defineProperty(process, "stdin", { value: mock, configurable: true });
}

function mockTtyStdin(): void {
  Object.defineProperty(process, "stdin", {
    value: { isTTY: true },
    configurable: true,
  });
}

// ─── Setup ────────────────────────────────────────────────────────────────────

let mockFetch: ReturnType<typeof vi.fn>;
// biome-ignore lint/suspicious/noExplicitAny: spy types vary per target
let consoleLogSpy: MockInstance<any[], any>;
// biome-ignore lint/suspicious/noExplicitAny: spy types vary per target
let stderrSpy: MockInstance<any[], any>;
// biome-ignore lint/suspicious/noExplicitAny: spy types vary per target
let exitSpy: MockInstance<any[], never>;

beforeEach(() => {
  mockFetch = vi.fn();
  vi.mocked(createPrimFetch).mockReturnValue(mockFetch as typeof fetch);
  vi.mocked(getConfig).mockResolvedValue({});
  consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  exitSpy = vi.spyOn(process, "exit").mockImplementation((_code) => {
    throw new Error(`process.exit(${_code})`);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── cache put from stdin ─────────────────────────────────────────────────────

describe("cache put from stdin", () => {
  it("reads value from stdin when no --value or --file", async () => {
    mockStdin('{"key": "from-stdin"}');
    mockFetch.mockResolvedValue(jsonResponse(200, { status: "ok" }));

    await runMemCommand("cache", ["mem", "cache", "put", "ns", "mykey"]);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://mem.prim.sh/v1/cache/ns/mykey",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ value: { key: "from-stdin" } }),
      }),
    );
  });

  it("reads plain string from stdin", async () => {
    mockStdin("hello world");
    mockFetch.mockResolvedValue(jsonResponse(200, { status: "ok" }));

    await runMemCommand("cache", ["mem", "cache", "put", "ns", "mykey"]);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://mem.prim.sh/v1/cache/ns/mykey",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ value: "hello world" }),
      }),
    );
  });

  it("exits 1 if stdin is TTY and no --value/--file", async () => {
    mockTtyStdin();
    await expect(
      runMemCommand("cache", ["mem", "cache", "put", "ns", "mykey"]),
    ).rejects.toThrow("process.exit(1)");
    expect(stderrSpy).toHaveBeenCalled();
  });
});

// ─── upsert from stdin ────────────────────────────────────────────────────────

describe("upsert from stdin", () => {
  it("reads text from stdin when no --text flag", async () => {
    mockStdin("document text from stdin");
    mockFetch.mockResolvedValue(jsonResponse(200, { ids: ["doc_1"] }));

    await runMemCommand("upsert", ["mem", "upsert", "col_123"]);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://mem.prim.sh/v1/collections/col_123/upsert",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ documents: [{ text: "document text from stdin" }] }),
      }),
    );
  });

  it("prefers --text flag over stdin", async () => {
    mockStdin("should be ignored");
    mockFetch.mockResolvedValue(jsonResponse(200, { ids: ["doc_1"] }));

    await runMemCommand("upsert", ["mem", "upsert", "col_123", "--text", "from flag"]);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://mem.prim.sh/v1/collections/col_123/upsert",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ documents: [{ text: "from flag" }] }),
      }),
    );
  });

  it("exits 1 if stdin is TTY and no --text", async () => {
    mockTtyStdin();
    await expect(
      runMemCommand("upsert", ["mem", "upsert", "col_123"]),
    ).rejects.toThrow("process.exit(1)");
    expect(stderrSpy).toHaveBeenCalled();
  });
});
