// SPDX-License-Identifier: Apache-2.0
/**
 * store-commands.ts unit tests.
 *
 * createPrimFetch is fully mocked — no network, no keystore, no x402 payments.
 * getConfig is mocked to return empty config (no network override).
 * node:fs is partially mocked for statSync + readFileSync.
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
    statSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    writeFile: vi.fn().mockResolvedValue(undefined),
  };
});

import { readFileSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createPrimFetch } from "@primsh/x402-client";
import { getConfig } from "@primsh/keystore";
import { resolveStoreUrl, runStoreCommand } from "../src/store-commands.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function okBucket(id = "bkt_123") {
  return jsonResponse(200, {
    bucket: {
      id,
      name: "test-bucket",
      location: null,
      owner_wallet: "0xABC",
      quota_bytes: null,
      usage_bytes: 0,
      created_at: "2026-01-01T00:00:00Z",
    },
  });
}

function okBucketList(ids = ["bkt_1", "bkt_2"]) {
  return jsonResponse(200, {
    data: ids.map((id) => ({
      id,
      name: id,
      location: null,
      owner_wallet: "0xABC",
      quota_bytes: null,
      usage_bytes: 0,
      created_at: "2026-01-01T00:00:00Z",
    })),
    meta: { page: 1, per_page: 20, total: ids.length },
  });
}

function okPut(key = "notes.txt") {
  return jsonResponse(200, { key, size: 13, etag: "abc123" });
}

function okBinaryGet(content: Buffer) {
  return new Response(content as unknown as BodyInit, { status: 200 });
}

function okDeleted() {
  return jsonResponse(200, { status: "deleted" });
}

function okQuota(usageBytes = 512) {
  return jsonResponse(200, {
    bucket_id: "bkt_123",
    quota_bytes: null,
    usage_bytes: usageBytes,
    usage_pct: null,
  });
}

function okObjectList(keys = ["file1.txt", "file2.txt"]) {
  return jsonResponse(200, {
    objects: keys.map((key) => ({
      key,
      size: 100,
      etag: "abc",
      last_modified: "2026-01-01T00:00:00Z",
    })),
    meta: { page: 1, per_page: 20, total: keys.length },
  });
}

function errorResponse(code: string, message: string, status = 404) {
  return jsonResponse(status, { error: { code, message } });
}

// ─── Setup ────────────────────────────────────────────────────────────────────

let mockFetch: ReturnType<typeof vi.fn>;
// biome-ignore lint/suspicious/noExplicitAny: spy types vary per target
let consoleLogSpy: MockInstance<any[], any>;
// biome-ignore lint/suspicious/noExplicitAny: spy types vary per target
let stderrSpy: MockInstance<any[], any>;
// biome-ignore lint/suspicious/noExplicitAny: spy types vary per target
let stdoutSpy: MockInstance<any[], any>;
// biome-ignore lint/suspicious/noExplicitAny: spy types vary per target
let exitSpy: MockInstance<any[], never>;

beforeEach(() => {
  mockFetch = vi.fn();
  vi.mocked(createPrimFetch).mockReturnValue(mockFetch as typeof fetch);
  // Re-set getConfig mock every test since vi.restoreAllMocks() clears vi.fn() impls
  vi.mocked(getConfig).mockResolvedValue({});
  vi.mocked(writeFile).mockResolvedValue(undefined);
  consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  exitSpy = vi.spyOn(process, "exit").mockImplementation((_code) => {
    throw new Error(`process.exit(${_code})`);
  });
  // biome-ignore lint/performance/noDelete: env var must be absent, not the string "undefined"
  delete process.env.PRIM_STORE_URL;
});

afterEach(() => {
  vi.restoreAllMocks();
  // biome-ignore lint/performance/noDelete: env var must be absent, not the string "undefined"
  delete process.env.PRIM_STORE_URL;
});

// ─── 1. create-bucket ─────────────────────────────────────────────────────────

describe("create-bucket", () => {
  it("POSTs to /v1/buckets with name body and prints JSON", async () => {
    mockFetch.mockResolvedValue(okBucket());
    await runStoreCommand("create-bucket", ["store", "create-bucket", "--name=my-bucket"]);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://store.prim.sh/v1/buckets",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "my-bucket" }),
      }),
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("bkt_123"));
  });

  it("includes location when --location flag is provided", async () => {
    mockFetch.mockResolvedValue(okBucket());
    await runStoreCommand("create-bucket", [
      "store",
      "create-bucket",
      "--name=my-bucket",
      "--location=us-east-1",
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: JSON.stringify({ name: "my-bucket", location: "us-east-1" }),
      }),
    );
  });

  it("--quiet prints only the bucket ID", async () => {
    mockFetch.mockResolvedValue(okBucket("bkt_abc"));
    await runStoreCommand("create-bucket", ["store", "create-bucket", "--name=x", "--quiet"]);
    expect(consoleLogSpy).toHaveBeenCalledWith("bkt_abc");
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
  });

  it("exits 1 when --name is missing", async () => {
    await expect(runStoreCommand("create-bucket", ["store", "create-bucket"])).rejects.toThrow(
      "process.exit(1)",
    );
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("--name NAME"));
  });
});

// ─── 2. ls ────────────────────────────────────────────────────────────────────

describe("ls", () => {
  it("GETs /v1/buckets with default pagination and prints JSON", async () => {
    mockFetch.mockResolvedValue(okBucketList());
    await runStoreCommand("ls", ["store", "ls"]);
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain("/v1/buckets");
    expect(url).toContain("page=1");
    expect(url).toContain("per_page=20");
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("bkt_1"));
  });

  it("passes --page and --per-page to query string", async () => {
    mockFetch.mockResolvedValue(okBucketList());
    await runStoreCommand("ls", ["store", "ls", "--page=2", "--per-page=5"]);
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain("page=2");
    expect(url).toContain("per_page=5");
  });

  it("--quiet prints one bucket ID per line", async () => {
    mockFetch.mockResolvedValue(okBucketList(["bkt_1", "bkt_2", "bkt_3"]));
    await runStoreCommand("ls", ["store", "ls", "--quiet"]);
    expect(consoleLogSpy).toHaveBeenCalledTimes(3);
    expect(consoleLogSpy).toHaveBeenCalledWith("bkt_1");
    expect(consoleLogSpy).toHaveBeenCalledWith("bkt_2");
    expect(consoleLogSpy).toHaveBeenCalledWith("bkt_3");
  });
});

// ─── 2b. ls BUCKET_ID (objects) ──────────────────────────────────────────────

describe("ls BUCKET_ID", () => {
  it("GETs /v1/buckets/:id/objects and prints JSON", async () => {
    mockFetch.mockResolvedValue(okObjectList(["a.txt", "b.txt"]));
    await runStoreCommand("ls", ["store", "ls", "bkt_123"]);
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain("/v1/buckets/bkt_123/objects");
    expect(url).toContain("page=1");
    expect(url).toContain("per_page=20");
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("a.txt"));
  });

  it("--quiet prints one object key per line", async () => {
    mockFetch.mockResolvedValue(okObjectList(["x.txt", "y.txt", "z.txt"]));
    await runStoreCommand("ls", ["store", "ls", "bkt_123", "--quiet"]);
    expect(consoleLogSpy).toHaveBeenCalledTimes(3);
    expect(consoleLogSpy).toHaveBeenCalledWith("x.txt");
    expect(consoleLogSpy).toHaveBeenCalledWith("y.txt");
    expect(consoleLogSpy).toHaveBeenCalledWith("z.txt");
  });

  it("--prefix passes prefix param to query string", async () => {
    mockFetch.mockResolvedValue(okObjectList(["docs/readme.md"]));
    await runStoreCommand("ls", ["store", "ls", "bkt_123", "--prefix=docs/"]);
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain("prefix=docs%2F");
  });

  it("resolves bucket name to ID before listing objects", async () => {
    // First call: resolveBucket fetches /v1/buckets to find name→id mapping
    // okBucketList uses id as both id and name, so the bucket name "bkt_resolved" matches
    mockFetch.mockResolvedValueOnce(
      jsonResponse(200, {
        data: [{ id: "bkt_resolved", name: "my-bucket", owner_wallet: "0xABC" }],
        meta: { page: 1, per_page: 20, total: 1 },
      }),
    );
    // Second call: actual objects list
    mockFetch.mockResolvedValueOnce(okObjectList(["obj.txt"]));

    await runStoreCommand("ls", ["store", "ls", "my-bucket"]);

    // resolveBucket should have called /v1/buckets first
    const [firstUrl] = mockFetch.mock.calls[0] as [string];
    expect(firstUrl).toContain("/v1/buckets");
    // Then objects list uses the resolved ID
    const [secondUrl] = mockFetch.mock.calls[1] as [string];
    expect(secondUrl).toContain("/v1/buckets/bkt_resolved/objects");
  });
});

// ─── 3. put (file) ────────────────────────────────────────────────────────────

describe("put from file", () => {
  it("PUTs to /v1/buckets/:id/objects/:key with file body + Content-Length + Content-Type", async () => {
    const fileContents = Buffer.from("hello world!!");
    vi.mocked(statSync).mockReturnValue({ size: fileContents.length } as ReturnType<
      typeof statSync
    >);
    vi.mocked(readFileSync).mockReturnValue(fileContents as unknown as string);
    mockFetch.mockResolvedValue(okPut("docs/notes.txt"));

    await runStoreCommand("put", [
      "store",
      "put",
      "bkt_123",
      "docs/notes.txt",
      "--file=./notes.txt",
    ]);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://store.prim.sh/v1/buckets/bkt_123/objects/docs/notes.txt",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          "Content-Length": String(fileContents.length),
          "Content-Type": "text/plain",
        }),
      }),
    );
  });

  it("infers content type from file extension", async () => {
    vi.mocked(statSync).mockReturnValue({ size: 10 } as ReturnType<typeof statSync>);
    vi.mocked(readFileSync).mockReturnValue(Buffer.from("{}") as unknown as string);
    mockFetch.mockResolvedValue(okPut("data.json"));

    await runStoreCommand("put", ["store", "put", "bkt_123", "data.json", "--file=./data.json"]);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      }),
    );
  });

  it("--content-type flag overrides inferred type", async () => {
    // .json infers application/json; flag overrides to text/csv — proves override, not just fallback
    vi.mocked(statSync).mockReturnValue({ size: 5 } as ReturnType<typeof statSync>);
    vi.mocked(readFileSync).mockReturnValue(Buffer.from("a,b,c") as unknown as string);
    mockFetch.mockResolvedValue(okPut("report"));

    await runStoreCommand("put", [
      "store",
      "put",
      "bkt_123",
      "report",
      "--file=./data.json",
      "--content-type=text/csv",
    ]);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        headers: expect.objectContaining({ "Content-Type": "text/csv" }),
      }),
    );
  });

  it("--quiet prints only the key", async () => {
    vi.mocked(statSync).mockReturnValue({ size: 5 } as ReturnType<typeof statSync>);
    vi.mocked(readFileSync).mockReturnValue(Buffer.from("hello") as unknown as string);
    mockFetch.mockResolvedValue(okPut("my/key.txt"));

    await runStoreCommand("put", [
      "store",
      "put",
      "bkt_123",
      "my/key.txt",
      "--file=./x.txt",
      "--quiet",
    ]);

    expect(consoleLogSpy).toHaveBeenCalledWith("my/key.txt");
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
  });
});

// ─── 4. put (stdin) ───────────────────────────────────────────────────────────

describe("put from stdin", () => {
  it("buffers stdin and sends with correct Content-Length", async () => {
    const stdinData = Buffer.from("stdin content here");

    // Mock process.stdin as an async iterable (Node-compatible, no Bun APIs)
    const stdinMock = {
      isTTY: false as boolean | undefined,
      [Symbol.asyncIterator]() {
        let done = false;
        return {
          async next(): Promise<{ value: Buffer | undefined; done: boolean }> {
            if (!done) {
              done = true;
              return { value: stdinData, done: false };
            }
            return { value: undefined, done: true };
          },
        };
      },
    };
    Object.defineProperty(process, "stdin", { value: stdinMock, configurable: true });
    mockFetch.mockResolvedValue(okPut("file.txt"));

    await runStoreCommand("put", ["store", "put", "bkt_123", "file.txt"]);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://store.prim.sh/v1/buckets/bkt_123/objects/file.txt",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          "Content-Length": String(stdinData.length),
          "Content-Type": "application/octet-stream",
        }),
      }),
    );
  });

  it("exits 1 if stdin is a TTY and no --file flag", async () => {
    // Override process.stdin.isTTY to simulate interactive terminal
    Object.defineProperty(process, "stdin", {
      value: { isTTY: true },
      configurable: true,
    });

    await expect(runStoreCommand("put", ["store", "put", "bkt_123", "key"])).rejects.toThrow(
      "process.exit(1)",
    );
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("--file=PATH"));
  });
});

// ─── 5. get (stdout) ──────────────────────────────────────────────────────────

describe("get to stdout", () => {
  it("GETs object and writes raw bytes to stdout", async () => {
    const content = Buffer.from("file content bytes");
    mockFetch.mockResolvedValue(okBinaryGet(content));

    await runStoreCommand("get", ["store", "get", "bkt_123", "notes.txt"]);

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("https://store.prim.sh/v1/buckets/bkt_123/objects/notes.txt");
    expect(stdoutSpy).toHaveBeenCalledWith(expect.any(Buffer));
  });
});

// ─── 6. get (file) ────────────────────────────────────────────────────────────

describe("get to file", () => {
  it("writes response body to --out path via writeFile", async () => {
    const content = Buffer.from("file bytes");
    mockFetch.mockResolvedValue(okBinaryGet(content));

    await runStoreCommand("get", ["store", "get", "bkt_123", "photo.png", "--out=/tmp/photo.png"]);

    expect(vi.mocked(writeFile)).toHaveBeenCalledWith("/tmp/photo.png", expect.any(Buffer));
  });
});

// ─── 7. rm ────────────────────────────────────────────────────────────────────

describe("rm", () => {
  it("DELETEs /v1/buckets/:id/objects/:key and prints result", async () => {
    mockFetch.mockResolvedValue(okDeleted());

    await runStoreCommand("rm", ["store", "rm", "bkt_123", "notes.txt"]);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://store.prim.sh/v1/buckets/bkt_123/objects/notes.txt",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("deleted"));
  });

  it("--quiet suppresses output", async () => {
    mockFetch.mockResolvedValue(okDeleted());
    await runStoreCommand("rm", ["store", "rm", "bkt_123", "key", "--quiet"]);
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it("exits 1 when bucket ID or key is missing", async () => {
    await expect(runStoreCommand("rm", ["store", "rm", "bkt_123"])).rejects.toThrow(
      "process.exit(1)",
    );
  });
});

// ─── 8. rm-bucket ─────────────────────────────────────────────────────────────

describe("rm-bucket", () => {
  it("DELETEs /v1/buckets/:id and prints result", async () => {
    mockFetch.mockResolvedValue(okDeleted());

    await runStoreCommand("rm-bucket", ["store", "rm-bucket", "bkt_123"]);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://store.prim.sh/v1/buckets/bkt_123",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("deleted"));
  });

  it("exits 1 when bucket ID is missing", async () => {
    await expect(runStoreCommand("rm-bucket", ["store", "rm-bucket"])).rejects.toThrow(
      "process.exit(1)",
    );
  });
});

// ─── 9. quota ─────────────────────────────────────────────────────────────────

describe("quota", () => {
  it("GETs /v1/buckets/:id/quota and prints JSON", async () => {
    mockFetch.mockResolvedValue(okQuota(2048));

    await runStoreCommand("quota", ["store", "quota", "bkt_123"]);

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("https://store.prim.sh/v1/buckets/bkt_123/quota");
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("2048"));
  });

  it("--quiet prints only usage_bytes", async () => {
    mockFetch.mockResolvedValue(okQuota(512));
    await runStoreCommand("quota", ["store", "quota", "bkt_123", "--quiet"]);
    expect(consoleLogSpy).toHaveBeenCalledWith(512);
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
  });

  it("exits 1 when bucket ID is missing", async () => {
    await expect(runStoreCommand("quota", ["store", "quota"])).rejects.toThrow("process.exit(1)");
  });
});

// ─── 10. --quiet (cross-cutting) ──────────────────────────────────────────────

describe("--quiet flag", () => {
  it("create-bucket with --quiet returns only bucket ID", async () => {
    mockFetch.mockResolvedValue(okBucket("bkt_quiet"));
    await runStoreCommand("create-bucket", ["store", "create-bucket", "--name=q", "--quiet"]);
    expect(consoleLogSpy).toHaveBeenCalledWith("bkt_quiet");
    const output = consoleLogSpy.mock.calls.flat().join("");
    expect(output).not.toContain("owner_wallet");
  });

  it("ls with --quiet returns IDs only (no meta block)", async () => {
    mockFetch.mockResolvedValue(okBucketList(["bkt_a"]));
    await runStoreCommand("ls", ["store", "ls", "--quiet"]);
    const output = consoleLogSpy.mock.calls.flat().join("");
    expect(output).not.toContain("meta");
  });
});

// ─── 11. error handling ───────────────────────────────────────────────────────

describe("error handling", () => {
  it("non-ok response throws with error message and code", async () => {
    mockFetch.mockResolvedValue(errorResponse("not_found", "Bucket not found"));

    await expect(runStoreCommand("quota", ["store", "quota", "bkt_missing"])).rejects.toThrow(
      "Bucket not found (not_found)",
    );
  });

  it("403 forbidden error is reported correctly", async () => {
    mockFetch.mockResolvedValue(errorResponse("forbidden", "Access denied", 403));

    await expect(runStoreCommand("rm-bucket", ["store", "rm-bucket", "bkt_xyz"])).rejects.toThrow(
      "Access denied (forbidden)",
    );
  });
});

// ─── 12. URL resolution ───────────────────────────────────────────────────────

describe("URL resolution", () => {
  it("--url flag takes highest priority", () => {
    process.env.PRIM_STORE_URL = "https://env.example.com";
    const url = resolveStoreUrl(["store", "ls", "--url=https://flag.example.com"]);
    expect(url).toBe("https://flag.example.com");
  });

  it("PRIM_STORE_URL env is used when no --url flag", () => {
    process.env.PRIM_STORE_URL = "https://env.example.com";
    const url = resolveStoreUrl(["store", "ls"]);
    expect(url).toBe("https://env.example.com");
  });

  it("falls back to https://store.prim.sh", () => {
    // biome-ignore lint/performance/noDelete: env var must be absent, not the string "undefined"
    delete process.env.PRIM_STORE_URL;
    const url = resolveStoreUrl(["store", "ls"]);
    expect(url).toBe("https://store.prim.sh");
  });

  it("integration: runStoreCommand uses --url for fetch calls", async () => {
    mockFetch.mockResolvedValue(okBucketList());
    await runStoreCommand("ls", ["store", "ls", "--url=https://custom.prim.sh"]);
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain("https://custom.prim.sh/v1/buckets");
  });
});
