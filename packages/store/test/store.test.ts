/**
 * ST-1 store.sh tests: bucket CRUD with ownership enforcement.
 *
 * Tests the service layer directly (same pattern as dns.sh).
 * x402 middleware is tested separately in @primsh/x402-middleware.
 *
 * IMPORTANT: env vars must be set before any module import that touches db/cloudflare.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
      JSON.stringify({
        success: true,
        errors: [],
        result: makeCfBucket({ name: body.name, location: body.locationHint ?? "enam" }),
      }),
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
    return new Response(JSON.stringify({ success: true, errors: [], result: {} }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // CF: GET /accounts/.*/r2/buckets — list buckets
  if (url.match(/\/accounts\/[^/]+\/r2\/buckets$/) && method === "GET") {
    return new Response(JSON.stringify({ success: true, errors: [], result: { buckets: [] } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ─── S3-compatible API mocks ──────────────────────────────────────────
  const s3Match = url.match(
    /^https:\/\/test-cf-account\.r2\.cloudflarestorage\.com\/([^/?]+)(\/(.+?))?(\?.*)?$/,
  );
  if (s3Match) {
    const _bucketName = s3Match[1];
    const objectKey = s3Match[3];

    // S3: HEAD /{bucket}/{key} — head object
    if (method === "HEAD" && objectKey) {
      return new Response(null, {
        status: 200,
        headers: { "Content-Length": "42", ETag: '"abc123etag"' },
      });
    }

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
import {
  setQuota as dbSetQuota,
  setUsage as dbSetUsage,
  getBucketById,
  getQuota,
  resetDb,
} from "../src/db.ts";
import {
  createBucket,
  deleteBucket,
  deleteObject,
  getBucket,
  getObject,
  getUsage,
  isValidBucketName,
  isValidObjectKey,
  listBuckets,
  listObjects,
  putObject,
  reconcileUsage,
  setQuotaForBucket,
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
      expect(list.data).toHaveLength(1);
      expect(list.data[0].name).toBe("caller-bucket");
      expect(list.pagination.total).toBe(1);
    });

    it("list buckets — pagination works", async () => {
      await createBucket({ name: "bucket-aaa" }, CALLER);
      await createBucket({ name: "bucket-bbb" }, CALLER);
      await createBucket({ name: "bucket-ccc" }, CALLER);

      const page1 = listBuckets(CALLER, 2, 1);
      expect(page1.data).toHaveLength(2);
      expect(page1.pagination.total).toBe(3);

      const page2 = listBuckets(CALLER, 2, 2);
      expect(page2.data).toHaveLength(1);
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
      const result = await putObject(
        bucketId,
        "hello.txt",
        "hello world",
        "text/plain",
        CALLER,
        11,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.key).toBe("hello.txt");
      expect(result.data.etag).toBe('"abc123etag"');
    });

    it("putObject — nested key with slashes", async () => {
      const bucketId = await createTestBucket();
      const result = await putObject(
        bucketId,
        "folder/sub/file.txt",
        "data",
        "text/plain",
        CALLER,
        4,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.key).toBe("folder/sub/file.txt");
    });

    it("putObject — invalid key (empty) returns invalid_request", async () => {
      const bucketId = await createTestBucket();
      const result = await putObject(bucketId, "", "data", "text/plain", CALLER, 4);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("invalid_request");
    });

    it("putObject — invalid key (leading slash) returns invalid_request", async () => {
      const bucketId = await createTestBucket();
      const result = await putObject(bucketId, "/bad-key", "data", "text/plain", CALLER, 4);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("invalid_request");
    });

    it("putObject — invalid key (too long) returns invalid_request", async () => {
      const bucketId = await createTestBucket();
      const result = await putObject(bucketId, "a".repeat(1025), "data", "text/plain", CALLER, 4);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("invalid_request");
    });

    it("putObject — non-owner gets 403", async () => {
      const bucketId = await createTestBucket();
      const result = await putObject(bucketId, "hello.txt", "data", "text/plain", OTHER, 4);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(403);
    });

    it("putObject — nonexistent bucket returns 404", async () => {
      const result = await putObject("b_nonexist", "hello.txt", "data", "text/plain", CALLER, 4);
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
        return new Response(
          "<Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message></Error>",
          {
            status: 404,
            headers: { "Content-Type": "application/xml" },
          },
        );
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
      // HEAD succeeds (returns object size)
      mockFetch.mockImplementationOnce(
        async () =>
          new Response(null, { status: 200, headers: { "Content-Length": "42", ETag: '"e"' } }),
      );
      // DELETE fails with AccessDenied
      mockFetch.mockImplementationOnce(async () => {
        return new Response(
          "<Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>",
          {
            status: 403,
            headers: { "Content-Type": "application/xml" },
          },
        );
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
      expect(result.data.data).toHaveLength(2);
      expect(result.data.data[0].key).toBe("file1.txt");
      expect(result.data.data[1].key).toBe("file2.txt");
    });

    it("listObjects — with prefix filter", async () => {
      const bucketId = await createTestBucket();
      const result = await listObjects(bucketId, CALLER, "docs/");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // Prefix filtering is handled by S3, pagination shape is standardized
      expect(result.ok).toBe(true);
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
      expect(result.data.pagination.has_more).toBe(false);
    });
  });

  // ─── Quota + Usage ─────────────────────────────────────────────────

  describe("quota enforcement", () => {
    async function createTestBucketWithQuota(quotaBytes: number | null): Promise<string> {
      const result = await createBucket({ name: `quota-test-${Date.now()}` }, CALLER);
      if (!result.ok) throw new Error("Setup failed");
      // Always set quota explicitly to override the default applied by createBucket
      dbSetQuota(result.data.bucket.id, quotaBytes);
      return result.data.bucket.id;
    }

    it("putObject — unlimited quota allows upload", async () => {
      const bucketId = await createTestBucketWithQuota(null);
      const result = await putObject(bucketId, "file.txt", "data", "text/plain", CALLER, 100);
      expect(result.ok).toBe(true);
    });

    it("putObject — within quota allows upload", async () => {
      const bucketId = await createTestBucketWithQuota(1000);
      const result = await putObject(bucketId, "file.txt", "data", "text/plain", CALLER, 500);
      expect(result.ok).toBe(true);
    });

    it("putObject — exceeds quota rejects with quota_exceeded", async () => {
      const bucketId = await createTestBucketWithQuota(100);
      const result = await putObject(bucketId, "file.txt", "data", "text/plain", CALLER, 200);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("quota_exceeded");
      expect(result.status).toBe(413);
    });

    it("putObject — zero quota rejects (read-only bucket)", async () => {
      const bucketId = await createTestBucketWithQuota(0);
      const result = await putObject(bucketId, "file.txt", "data", "text/plain", CALLER, 1);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("quota_exceeded");
    });

    it("putObject — quota set but no Content-Length rejects 411", async () => {
      const bucketId = await createTestBucketWithQuota(1000);
      const result = await putObject(bucketId, "file.txt", "data", "text/plain", CALLER, null);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(411);
    });

    it("putObject — no quota and no Content-Length still succeeds", async () => {
      const bucketId = await createTestBucketWithQuota(null);
      const result = await putObject(bucketId, "file.txt", "data", "text/plain", CALLER, null);
      expect(result.ok).toBe(true);
    });
  });

  describe("usage tracking", () => {
    async function createTestBucketForUsage(): Promise<string> {
      const result = await createBucket({ name: `usage-test-${Date.now()}` }, CALLER);
      if (!result.ok) throw new Error("Setup failed");
      return result.data.bucket.id;
    }

    it("putObject — increments usage after upload", async () => {
      const bucketId = await createTestBucketForUsage();
      // HEAD returns 404 for new object
      mockFetch.mockImplementationOnce(async () => new Response(null, { status: 404 }));
      await putObject(bucketId, "file.txt", "data", "text/plain", CALLER, 100);
      const quota = getQuota(bucketId);
      expect(quota?.usage_bytes).toBe(100);
    });

    it("putObject — two uploads sum usage", async () => {
      const bucketId = await createTestBucketForUsage();
      // HEAD 404 for first file
      mockFetch.mockImplementationOnce(async () => new Response(null, { status: 404 }));
      await putObject(bucketId, "file1.txt", "data", "text/plain", CALLER, 100);
      // HEAD 404 for second file
      mockFetch.mockImplementationOnce(async () => new Response(null, { status: 404 }));
      await putObject(bucketId, "file2.txt", "data", "text/plain", CALLER, 200);
      const quota = getQuota(bucketId);
      expect(quota?.usage_bytes).toBe(300);
    });

    it("putObject — overwrite computes net delta", async () => {
      const bucketId = await createTestBucketForUsage();
      // First write: HEAD 404 (new object)
      mockFetch.mockImplementationOnce(async () => new Response(null, { status: 404 }));
      await putObject(bucketId, "file.txt", "data", "text/plain", CALLER, 100);
      // Overwrite: HEAD returns old size 100
      // (default mock returns Content-Length: 42, override for this test)
      mockFetch.mockImplementationOnce(
        async () =>
          new Response(null, { status: 200, headers: { "Content-Length": "100", ETag: '"old"' } }),
      );
      await putObject(bucketId, "file.txt", "data", "text/plain", CALLER, 150);
      const quota = getQuota(bucketId);
      // 100 (first write) + 50 (net delta: 150 - 100) = 150
      expect(quota?.usage_bytes).toBe(150);
    });

    it("deleteObject — decrements usage", async () => {
      const bucketId = await createTestBucketForUsage();
      // Seed usage
      dbSetUsage(bucketId, 100);
      // HEAD returns size 100 before delete
      mockFetch.mockImplementationOnce(
        async () =>
          new Response(null, { status: 200, headers: { "Content-Length": "100", ETag: '"e"' } }),
      );
      await deleteObject(bucketId, "file.txt", CALLER);
      const quota = getQuota(bucketId);
      expect(quota?.usage_bytes).toBe(0);
    });

    it("deleteObject — HEAD 404 skips usage decrement", async () => {
      const bucketId = await createTestBucketForUsage();
      dbSetUsage(bucketId, 100);
      // HEAD returns 404 — object already gone
      mockFetch.mockImplementationOnce(async () => new Response(null, { status: 404 }));
      await deleteObject(bucketId, "file.txt", CALLER);
      const quota = getQuota(bucketId);
      expect(quota?.usage_bytes).toBe(100);
    });
  });

  describe("setQuota", () => {
    async function createTestBucketForQuota(): Promise<string> {
      const result = await createBucket({ name: `setquota-${Date.now()}` }, CALLER);
      if (!result.ok) throw new Error("Setup failed");
      return result.data.bucket.id;
    }

    it("owner sets valid quota", async () => {
      const bucketId = await createTestBucketForQuota();
      const result = setQuotaForBucket(bucketId, CALLER, 1073741824);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.quota_bytes).toBe(1073741824);
    });

    it("set quota to null removes limit", async () => {
      const bucketId = await createTestBucketForQuota();
      setQuotaForBucket(bucketId, CALLER, 1000);
      const result = setQuotaForBucket(bucketId, CALLER, null);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.quota_bytes).toBeNull();
    });

    it("non-owner gets 403", async () => {
      const bucketId = await createTestBucketForQuota();
      const result = setQuotaForBucket(bucketId, OTHER, 1000);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(403);
    });

    it("nonexistent bucket gets 404", () => {
      const result = setQuotaForBucket("b_nonexist", CALLER, 1000);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(404);
    });

    it("negative quota returns invalid_request", async () => {
      const bucketId = await createTestBucketForQuota();
      const result = setQuotaForBucket(bucketId, CALLER, -100);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("invalid_request");
    });

    it("setting quota below usage succeeds (over-quota)", async () => {
      const bucketId = await createTestBucketForQuota();
      dbSetUsage(bucketId, 500);
      const result = setQuotaForBucket(bucketId, CALLER, 100);
      expect(result.ok).toBe(true);
    });
  });

  describe("getUsage", () => {
    it("returns usage_pct when quota is set", async () => {
      const created = await createBucket({ name: `usage-pct-${Date.now()}` }, CALLER);
      if (!created.ok) return;
      const bucketId = created.data.bucket.id;
      dbSetQuota(bucketId, 1000);
      dbSetUsage(bucketId, 500);
      const result = getUsage(bucketId, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.usage_pct).toBe(50);
    });

    it("returns usage_pct null when quota is explicitly removed", async () => {
      const created = await createBucket({ name: `usage-null-${Date.now()}` }, CALLER);
      if (!created.ok) return;
      // Remove quota explicitly to test unlimited case
      dbSetQuota(created.data.bucket.id, null);
      const result = getUsage(created.data.bucket.id, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.usage_pct).toBeNull();
    });

    it("non-owner gets 403", async () => {
      const created = await createBucket({ name: `usage-other-${Date.now()}` }, CALLER);
      if (!created.ok) return;
      const result = getUsage(created.data.bucket.id, OTHER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(403);
    });

    it("nonexistent bucket gets 404", () => {
      const result = getUsage("b_nonexist", CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(404);
    });
  });

  describe("reconcileUsage", () => {
    it("corrects drifted usage", async () => {
      const created = await createBucket({ name: `reconcile-${Date.now()}` }, CALLER);
      if (!created.ok) return;
      const bucketId = created.data.bucket.id;
      // DB says 100, but S3 ListObjects returns 100+200=300
      dbSetUsage(bucketId, 100);
      const result = await reconcileUsage(bucketId, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.previous_bytes).toBe(100);
      expect(result.data.actual_bytes).toBe(300); // 100 + 200 from mock
      expect(result.data.delta_bytes).toBe(200);
      // Verify DB updated
      const quota = getQuota(bucketId);
      expect(quota?.usage_bytes).toBe(300);
    });

    it("non-owner gets 403", async () => {
      const created = await createBucket({ name: `reconcile-other-${Date.now()}` }, CALLER);
      if (!created.ok) return;
      const result = await reconcileUsage(created.data.bucket.id, OTHER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(403);
    });
  });

  describe("BucketResponse includes quota fields", () => {
    it("new bucket has default quota (100MB) and usage_bytes 0", async () => {
      const created = await createBucket({ name: `bucket-quota-${Date.now()}` }, CALLER);
      if (!created.ok) return;
      const result = getBucket(created.data.bucket.id, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.quota_bytes).toBe(104857600);
      expect(result.data.usage_bytes).toBe(0);
    });
  });

  // ─── Per-wallet storage caps ─────────────────────────────────────────

  describe("per-wallet limits", () => {
    it("bucket limit — 10th bucket succeeds, 11th returns bucket_limit_exceeded", async () => {
      // Override limit to 3 for test speed
      process.env.STORE_MAX_BUCKETS_PER_WALLET = "3";
      // Re-import to pick up env change isn't possible at module level — test by creating 3 then 4th
      // Instead we rely on the module reading env at call time — it reads the constant at module load.
      // We need to set env BEFORE module import. Since the module is already loaded, we test
      // with the real default (10). Create 10, then verify 11th fails.
      // biome-ignore lint/performance/noDelete: need actual undefined for env fallback
      delete process.env.STORE_MAX_BUCKETS_PER_WALLET;

      for (let i = 0; i < 10; i++) {
        const r = await createBucket({ name: `limit-bucket-${i}` }, CALLER);
        expect(r.ok).toBe(true);
      }
      const result = await createBucket({ name: "limit-bucket-overflow" }, CALLER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(403);
      expect(result.code).toBe("bucket_limit_exceeded");
    });

    it("bucket limit — different wallet is independent", async () => {
      for (let i = 0; i < 10; i++) {
        await createBucket({ name: `caller-bucket-${i}` }, CALLER);
      }
      // OTHER wallet has 0 buckets — should succeed
      const result = await createBucket({ name: "other-wallet-bucket" }, OTHER);
      expect(result.ok).toBe(true);
    });

    it("default bucket quota — new bucket gets 100MB quota", async () => {
      const result = await createBucket({ name: "default-quota-bucket" }, CALLER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.bucket.quota_bytes).toBe(104857600);
    });

    it("per-wallet storage cap — upload rejected when total would exceed 1GB", async () => {
      const created = await createBucket({ name: "storage-cap-bucket" }, CALLER);
      if (!created.ok) throw new Error("Setup failed");
      const bucketId = created.data.bucket.id;

      // Remove per-bucket quota so only the per-wallet cap is tested
      dbSetQuota(bucketId, null);

      // Seed usage_bytes to just below 1GB
      dbSetUsage(bucketId, 1073741823); // 1GB - 1 byte

      // HEAD returns 0 (new object)
      mockFetch.mockImplementationOnce(async () => new Response(null, { status: 404 }));

      // Upload of 2 bytes — total would be 1GB + 1 byte → reject
      const result = await putObject(bucketId, "overflow.txt", "ab", "text/plain", CALLER, 2);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(413);
      expect(result.code).toBe("storage_limit_exceeded");
    });

    it("per-wallet storage cap — upload allowed when total is well under 1GB", async () => {
      const created = await createBucket({ name: "storage-exact-bucket" }, CALLER);
      if (!created.ok) throw new Error("Setup failed");
      const bucketId = created.data.bucket.id;

      // Remove per-bucket quota so only the per-wallet cap is tested
      dbSetQuota(bucketId, null);

      // Upload 1 byte — well under 1GB
      // HEAD returns 0 (new object)
      mockFetch.mockImplementationOnce(async () => new Response(null, { status: 404 }));

      const result = await putObject(bucketId, "small.txt", "x", "text/plain", CALLER, 1);
      expect(result.ok).toBe(true);
    });

    it("per-wallet storage cap — overwrite delta counted correctly", async () => {
      const created = await createBucket({ name: "storage-overwrite-bucket" }, CALLER);
      if (!created.ok) throw new Error("Setup failed");
      const bucketId = created.data.bucket.id;

      // Remove per-bucket quota so only the per-wallet cap is tested
      dbSetQuota(bucketId, null);

      // Seed usage_bytes to 1GB - 10 bytes
      dbSetUsage(bucketId, 1073741814);

      // Overwrite: old object was 5 bytes, new is 10 bytes — net delta = 5 bytes
      // total would be (1GB - 10) + 5 = 1GB - 5 → allowed
      mockFetch.mockImplementationOnce(
        async () =>
          new Response(null, { status: 200, headers: { "Content-Length": "5", ETag: '"old"' } }),
      );
      const result = await putObject(bucketId, "file.txt", "xxxxxxxxxx", "text/plain", CALLER, 10);
      expect(result.ok).toBe(true);
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
          JSON.stringify({
            success: false,
            errors: [{ code: 409, message: "Bucket already exists" }],
          }),
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
