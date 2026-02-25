/**
 * ST-1 store.sh tests: bucket CRUD with ownership enforcement.
 *
 * Tests the service layer directly (same pattern as dns.sh).
 * x402 middleware is tested separately in @agentstack/x402-middleware.
 *
 * IMPORTANT: env vars must be set before any module import that touches db/cloudflare.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

// Set env before imports
process.env.STORE_DB_PATH = ":memory:";
process.env.CLOUDFLARE_API_TOKEN = "test-cf-token";
process.env.CLOUDFLARE_ACCOUNT_ID = "test-cf-account";
process.env.R2_ACCESS_KEY_ID = "test-r2-key";
process.env.R2_SECRET_ACCESS_KEY = "test-r2-secret";

// ─── Cloudflare API mock helpers ─────────────────────────────────────────

function makeCfBucket(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    name: "my-bucket",
    creation_date: "2024-01-01T00:00:00Z",
    location: "enam",
    ...overrides,
  };
}

// Mock fetch: intercepts Cloudflare R2 API calls
const mockFetch = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof Request
        ? input.url
        : (input as URL).toString();
  const method = _init?.method ?? "GET";

  // CF: POST /accounts/.*/r2/buckets — create bucket
  if (url.match(/\/accounts\/[^/]+\/r2\/buckets$/) && method === "POST") {
    const body = JSON.parse(_init?.body as string);
    return new Response(
      JSON.stringify({ success: true, errors: [], result: makeCfBucket({ name: body.name, location: body.locationHint ?? "enam" }) }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // CF: GET /accounts/.*/r2/buckets/<name> — get bucket
  if (url.match(/\/accounts\/[^/]+\/r2\/buckets\/[^/]+$/) && method === "GET") {
    const name = url.split("/").pop();
    return new Response(
      JSON.stringify({ success: true, errors: [], result: makeCfBucket({ name }) }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // CF: DELETE /accounts/.*/r2/buckets/<name> — delete bucket
  if (url.match(/\/accounts\/[^/]+\/r2\/buckets\/[^/]+$/) && method === "DELETE") {
    return new Response(
      JSON.stringify({ success: true, errors: [], result: {} }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // CF: GET /accounts/.*/r2/buckets — list buckets
  if (url.match(/\/accounts\/[^/]+\/r2\/buckets$/) && method === "GET") {
    return new Response(
      JSON.stringify({ success: true, errors: [], result: { buckets: [] } }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // ─── S3-compatible API mocks ──────────────────────────────────────────
  const s3Match = url.match(/^https:\/\/test-cf-account\.r2\.cloudflarestorage\.com\/([^/?]+)(\/(.+?))?(\?.*)?$/);
  if (s3Match) {
    const _bucketName = s3Match[1];
    const objectKey = s3Match[3];

    // S3: PUT /{bucket}/{key} — upload object
    if (method === "PUT" && objectKey) {
      return new Response(null, {
        status: 200,
        headers: { ETag: '"abc123etag"', "Content-Length": "42" },
      });
    }

    // S3: GET /{bucket}?list-type=2 — list objects
    if (method === "GET" && !objectKey && url.includes("list-type=2")) {
      const prefix = new URL(url).searchParams.get("prefix") ?? "";
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult>
  <IsTruncated>false</IsTruncated>
  <Contents>
    <Key>${prefix}file1.txt</Key>
    <Size>100</Size>
    <ETag>"etag1"</ETag>
    <LastModified>2024-01-01T00:00:00Z</LastModified>
  </Contents>
  <Contents>
    <Key>${prefix}file2.txt</Key>
    <Size>200</Size>
    <ETag>"etag2"</ETag>
    <LastModified>2024-01-02T00:00:00Z</LastModified>
  </Contents>
</ListBucketResult>`;
      return new Response(xml, {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      });
    }

    // S3: GET /{bucket}/{key} — download object
    if (method === "GET" && objectKey) {
      return new Response("file-content-here", {
        status: 200,
        headers: {
          "Content-Type": "text/plain",
          "Content-Length": "17",
          ETag: '"abc123etag"',
        },
      });
    }

    // S3: DELETE /{bucket}/{key} — delete object
    if (method === "DELETE" && objectKey) {
      return new Response(null, { status: 204 });
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

vi.stubGlobal("fetch", mockFetch);

// Import after env + fetch stub
import { resetDb, getBucketById } from "../src/db.ts";
import {
  createBucket,
  listBuckets,
  getBucket,
  deleteBucket,
  isValidBucketName,
  putObject,
  getObject,
  deleteObject,
  listObjects,
  isValidObjectKey,
} from "../src/service.ts";

// ─── Fixtures ────────────────────────────────────────────────────────────

const CALLER = "0xCa11e900000000000000000000000000000000001";
const OTHER = "0xCa11e900000000000000000000000000000000002";

// ─── Tests ───────────────────────────────────────────────────────────────

describe("store.sh", () => {
  beforeEach(() => {
    resetDb();
    mockFetch.mockClear();
  });

  afterEach(() => {
    resetDb();
  });

  // ─── Bucket name validation ─────────────────────────────────────────

  describe("bucket name validation", () => {
    it("valid names pass", () => {
      expect(isValidBucketName("my-bucket")).toBe(true);
      expect(isValidBucketName("abc")).toBe(true);
      expect(isValidBucketName("bucket123")).toBe(true);
      expect(isValidBucketName("a0b")).toBe(true);
    });

    it("too short (<3 chars) fails", () => {
      expect(isValidBucketName("ab")).toBe(false);
      expect(isValidBucketName("a")).toBe(false);
      expect(isValidBucketName("")).toBe(false);
    });

    it("too long (>63 chars) fails", () => {
      expect(isValidBucketName("a".repeat(64))).toBe(false);
    });

    it("uppercase fails", () => {
      expect(isValidBucketName("MyBucket")).toBe(false);
      expect(isValidBucketName("ABC")).toBe(false);
    });

    it("consecutive hyphens fail", () => {
      expect(isValidBucketName("my--bucket")).toBe(false);
    });

    it("leading hyphen fails", () => {
      expect(isValidBucketName("-bucket")).toBe(false);
    });

    it("trailing hyphen fails", () => {
      expect(isValidBucketName("bucket-")).toBe(false);
    });

    it("underscore fails", () => {
      expect(isValidBucketName("my_bucket")).toBe(false);
    });

    it("special characters fail", () => {
      expect(isValidBucketName("my.bucket")).toBe(false);
      expect(isValidBucketName("my bucket")).toBe(false);
    });
  });

  // ─── Bucket CRUD ───────────────────────────────────────────────────

  describe("buckets", () => {
    it("create bucket — returns bucket with id", async () => {
      const result = await createBucket({ name: "my-bucket" }, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.bucket.id).toMatch(/^b_/);
      expect(result.data.bucket.name).toBe("my-bucket");
      expect(result.data.bucket.owner_wallet).toBe(CALLER);
    });

    it("create bucket — persists to DB", async () => {
      const result = await createBucket({ name: "my-bucket" }, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const row = getBucketById(result.data.bucket.id);
      expect(row).not.toBeNull();
      expect(row?.cf_name).toBe("my-bucket");
      expect(row?.name).toBe("my-bucket");
    });

    it("create bucket — cf_name not in response", async () => {
      const result = await createBucket({ name: "my-bucket" }, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const response = result.data.bucket as unknown as Record<string, unknown>;
      expect(response.cf_name).toBeUndefined();
    });

    it("create bucket — with location hint", async () => {
      const result = await createBucket({ name: "my-bucket", location: "weur" }, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.bucket.location).toBeDefined();
    });

    it("create bucket — invalid name (too short) returns error", async () => {
      const result = await createBucket({ name: "ab" }, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
      expect(result.code).toBe("invalid_request");
    });

    it("create bucket — invalid name (uppercase) returns error", async () => {
      const result = await createBucket({ name: "MyBucket" }, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
      expect(result.code).toBe("invalid_request");
    });

    it("create bucket — invalid name (consecutive hyphens) returns error", async () => {
      const result = await createBucket({ name: "my--bucket" }, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
      expect(result.code).toBe("invalid_request");
    });

    it("create bucket — duplicate name returns bucket_name_taken", async () => {
      await createBucket({ name: "my-bucket" }, CALLER);
      const result = await createBucket({ name: "my-bucket" }, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(400);
      expect(result.code).toBe("bucket_name_taken");
    });

    it("create bucket — CF error propagation", async () => {
      mockFetch.mockImplementationOnce(async () => {
        return new Response(
          JSON.stringify({ success: false, errors: [{ code: 500, message: "R2 internal error" }] }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      });

      const result = await createBucket({ name: "cf-error-bucket" }, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("r2_error");
    });

    it("list buckets — returns only caller's buckets", async () => {
      await createBucket({ name: "caller-bucket" }, CALLER);
      await createBucket({ name: "other-bucket" }, OTHER);

      const list = listBuckets(CALLER, 20, 1);
      expect(list.buckets).toHaveLength(1);
      expect(list.buckets[0].name).toBe("caller-bucket");
      expect(list.meta.total).toBe(1);
    });

    it("list buckets — pagination works", async () => {
      await createBucket({ name: "bucket-aaa" }, CALLER);
      await createBucket({ name: "bucket-bbb" }, CALLER);
      await createBucket({ name: "bucket-ccc" }, CALLER);

      const page1 = listBuckets(CALLER, 2, 1);
      expect(page1.buckets).toHaveLength(2);
      expect(page1.meta.total).toBe(3);

      const page2 = listBuckets(CALLER, 2, 2);
      expect(page2.buckets).toHaveLength(1);
    });

    it("get bucket — owner can access", async () => {
      const created = await createBucket({ name: "my-bucket" }, CALLER);
      if (!created.ok) return;

      const result = getBucket(created.data.bucket.id, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.name).toBe("my-bucket");
    });

    it("get bucket — non-owner gets 403", async () => {
      const created = await createBucket({ name: "my-bucket" }, CALLER);
      if (!created.ok) return;

      const result = getBucket(created.data.bucket.id, OTHER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(403);
    });

    it("get bucket — nonexistent returns 404", () => {
      const result = getBucket("b_nonexist", CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(404);
    });

    it("delete bucket — owner can delete", async () => {
      const created = await createBucket({ name: "my-bucket" }, CALLER);
      if (!created.ok) return;

      const result = await deleteBucket(created.data.bucket.id, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.status).toBe("deleted");

      // Verify gone from DB
      const row = getBucketById(created.data.bucket.id);
      expect(row).toBeNull();
    });

    it("delete bucket — CF delete is called", async () => {
      const created = await createBucket({ name: "my-bucket" }, CALLER);
      if (!created.ok) return;
      mockFetch.mockClear();

      await deleteBucket(created.data.bucket.id, CALLER);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain("/r2/buckets/my-bucket");
      expect(init?.method).toBe("DELETE");
    });

    it("delete bucket — non-owner gets 403", async () => {
      const created = await createBucket({ name: "my-bucket" }, CALLER);
      if (!created.ok) return;

      const result = await deleteBucket(created.data.bucket.id, OTHER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(403);
    });

    it("delete bucket — nonexistent returns 404", async () => {
      const result = await deleteBucket("b_nonexist", CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(404);
    });

    it("delete bucket — CF error propagation", async () => {
      const created = await createBucket({ name: "my-bucket" }, CALLER);
      if (!created.ok) return;

      mockFetch.mockImplementationOnce(async () => {
        return new Response(
          JSON.stringify({ success: false, errors: [{ code: 500, message: "R2 delete failed" }] }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      });

      const result = await deleteBucket(created.data.bucket.id, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("r2_error");
    });
  });

  // ─── Object key validation ──────────────────────────────────────────

  describe("object key validation", () => {
    it("valid keys pass", () => {
      expect(isValidObjectKey("file.txt")).toBe(true);
      expect(isValidObjectKey("folder/file.txt")).toBe(true);
      expect(isValidObjectKey("a")).toBe(true);
    });

    it("empty key fails", () => {
      expect(isValidObjectKey("")).toBe(false);
    });

    it("leading slash fails", () => {
      expect(isValidObjectKey("/leading-slash")).toBe(false);
    });

    it("key > 1024 chars fails", () => {
      expect(isValidObjectKey("a".repeat(1025))).toBe(false);
    });

    it("key exactly 1024 chars passes", () => {
      expect(isValidObjectKey("a".repeat(1024))).toBe(true);
    });
  });

  // ─── Object CRUD ──────────────────────────────────────────────────────

  describe("objects", () => {
    async function createTestBucket(): Promise<string> {
      const result = await createBucket({ name: `obj-test-${Date.now()}` }, CALLER);
      if (!result.ok) throw new Error("Setup failed: could not create bucket");
      return result.data.bucket.id;
    }

    it("putObject — upload succeeds", async () => {
      const bucketId = await createTestBucket();
      const result = await putObject(bucketId, "hello.txt", "hello world", "text/plain", CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.key).toBe("hello.txt");
      expect(result.data.etag).toBe('"abc123etag"');
    });

    it("putObject — nested key with slashes", async () => {
      const bucketId = await createTestBucket();
      const result = await putObject(bucketId, "folder/sub/file.txt", "data", "text/plain", CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.key).toBe("folder/sub/file.txt");
    });

    it("putObject — invalid key (empty) returns invalid_request", async () => {
      const bucketId = await createTestBucket();
      const result = await putObject(bucketId, "", "data", "text/plain", CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("invalid_request");
    });

    it("putObject — invalid key (leading slash) returns invalid_request", async () => {
      const bucketId = await createTestBucket();
      const result = await putObject(bucketId, "/bad-key", "data", "text/plain", CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("invalid_request");
    });

    it("putObject — invalid key (too long) returns invalid_request", async () => {
      const bucketId = await createTestBucket();
      const result = await putObject(bucketId, "a".repeat(1025), "data", "text/plain", CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("invalid_request");
    });

    it("putObject — non-owner gets 403", async () => {
      const bucketId = await createTestBucket();
      const result = await putObject(bucketId, "hello.txt", "data", "text/plain", OTHER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(403);
    });

    it("putObject — nonexistent bucket returns 404", async () => {
      const result = await putObject("b_nonexist", "hello.txt", "data", "text/plain", CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(404);
    });

    it("getObject — download succeeds with correct content-type", async () => {
      const bucketId = await createTestBucket();
      const result = await getObject(bucketId, "hello.txt", CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.contentType).toBe("text/plain");
      expect(result.data.etag).toBe('"abc123etag"');
    });

    it("getObject — non-owner gets 403", async () => {
      const bucketId = await createTestBucket();
      const result = await getObject(bucketId, "hello.txt", OTHER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(403);
    });

    it("getObject — nonexistent key returns 404", async () => {
      const bucketId = await createTestBucket();
      mockFetch.mockImplementationOnce(async () => {
        return new Response("<Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message></Error>", {
          status: 404,
          headers: { "Content-Type": "application/xml" },
        });
      });
      const result = await getObject(bucketId, "missing.txt", CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(404);
      expect(result.code).toBe("not_found");
    });

    it("deleteObject — owner can delete", async () => {
      const bucketId = await createTestBucket();
      const result = await deleteObject(bucketId, "hello.txt", CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.status).toBe("deleted");
    });

    it("deleteObject — non-owner gets 403", async () => {
      const bucketId = await createTestBucket();
      const result = await deleteObject(bucketId, "hello.txt", OTHER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(403);
    });

    it("deleteObject — nonexistent bucket returns 404", async () => {
      const result = await deleteObject("b_nonexist", "hello.txt", CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(404);
    });

    it("deleteObject — S3 error propagation", async () => {
      const bucketId = await createTestBucket();
      mockFetch.mockImplementationOnce(async () => {
        return new Response("<Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>", {
          status: 403,
          headers: { "Content-Type": "application/xml" },
        });
      });
      const result = await deleteObject(bucketId, "hello.txt", CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("forbidden");
    });

    it("listObjects — returns objects for bucket", async () => {
      const bucketId = await createTestBucket();
      const result = await listObjects(bucketId, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.objects).toHaveLength(2);
      expect(result.data.objects[0].key).toBe("file1.txt");
      expect(result.data.objects[1].key).toBe("file2.txt");
    });

    it("listObjects — with prefix filter", async () => {
      const bucketId = await createTestBucket();
      const result = await listObjects(bucketId, CALLER, "docs/");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.meta.prefix).toBe("docs/");
    });

    it("listObjects — non-owner gets 403", async () => {
      const bucketId = await createTestBucket();
      const result = await listObjects(bucketId, OTHER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(403);
    });

    it("listObjects — pagination cursor", async () => {
      const bucketId = await createTestBucket();
      const result = await listObjects(bucketId, CALLER, undefined, 10, "some-cursor");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.is_truncated).toBe(false);
    });
  });

  // ─── Cloudflare error propagation ────────────────────────────────────

  describe("cloudflare errors", () => {
    it("CF 429 → service returns rate_limited", async () => {
      mockFetch.mockImplementationOnce(async () => {
        return new Response(
          JSON.stringify({ success: false, errors: [{ code: 429, message: "Rate limited" }] }),
          { status: 429, headers: { "Content-Type": "application/json" } },
        );
      });

      const result = await createBucket({ name: "ratelimited" }, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("rate_limited");
    });

    it("CF 409 → service returns bucket_name_taken", async () => {
      mockFetch.mockImplementationOnce(async () => {
        return new Response(
          JSON.stringify({ success: false, errors: [{ code: 409, message: "Bucket already exists" }] }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        );
      });

      const result = await createBucket({ name: "conflict-bucket" }, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("bucket_name_taken");
    });
  });
});
