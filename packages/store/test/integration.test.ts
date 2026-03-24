// SPDX-License-Identifier: Apache-2.0
/**
 * store.sh — Tier 2 integration tests
 *
 * Tests the S3/R2 layer directly with real Cloudflare credentials.
 * Validates that aws4fetch signing, bucket operations, and object CRUD
 * work against the real R2 API. x402 and SQLite are not involved.
 *
 * Excluded from `pnpm test`. Run via `pnpm test:integration` or nightly CI cron.
 *
 * Requires: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN
 */
import { afterAll, describe, expect, it } from "vitest";
import { AwsClient } from "aws4fetch";

const REQUIRED_ENV = [
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
];
const MISSING_ENV = REQUIRED_ENV.filter((k) => !process.env[k]);

const TEST_PREFIX = `test-int-${Date.now()}`;
const TEST_BUCKET = `${TEST_PREFIX}-bucket`;
const TEST_KEY = "hello.txt";
const TEST_CONTENT = "hello from integration test";

function getS3Client(): AwsClient {
  return new AwsClient({
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    service: "s3",
  });
}

function baseUrl(): string {
  return `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`;
}

/** Cloudflare API: create a bucket (R2 S3 API doesn't support CreateBucket). */
async function cfCreateBucket(name: string): Promise<void> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/r2/buckets`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create bucket ${name}: ${res.status} ${body}`);
  }
}

/** Cloudflare API: delete a bucket. */
async function cfDeleteBucket(name: string): Promise<void> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/r2/buckets/${name}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` },
    },
  );
  // 404 = already deleted, acceptable
  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    throw new Error(`Failed to delete bucket ${name}: ${res.status} ${body}`);
  }
}

describe.skipIf(MISSING_ENV.length > 0)("store.sh integration — R2 S3 layer", () => {
  if (MISSING_ENV.length > 0) return;

  const s3 = getS3Client();
  const url = (path: string) => `${baseUrl()}/${TEST_BUCKET}${path}`;

  afterAll(async () => {
    // Best-effort cleanup: delete object then bucket
    try {
      await s3.fetch(url(`/${TEST_KEY}`), { method: "DELETE" });
    } catch {
      /* ignore */
    }
    try {
      await cfDeleteBucket(TEST_BUCKET);
    } catch {
      /* ignore */
    }
  });

  it("creates a bucket via Cloudflare API", async () => {
    await cfCreateBucket(TEST_BUCKET);
    // Verify bucket exists via S3 HeadBucket
    const res = await s3.fetch(url("/"), { method: "HEAD" });
    expect(res.status).toBe(200);
  });

  it("PUT object uploads to R2", async () => {
    const res = await s3.fetch(url(`/${TEST_KEY}`), {
      method: "PUT",
      headers: { "Content-Type": "text/plain" },
      body: TEST_CONTENT,
    });
    expect(res.status).toBe(200);
  });

  it("GET object downloads from R2", async () => {
    const res = await s3.fetch(url(`/${TEST_KEY}`));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe(TEST_CONTENT);
  });

  it("HEAD object returns metadata", async () => {
    const res = await s3.fetch(url(`/${TEST_KEY}`), { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain");
    expect(res.headers.get("content-length")).toBe(String(TEST_CONTENT.length));
  });

  it("LIST objects returns the uploaded key", async () => {
    const res = await s3.fetch(url("/?list-type=2"));
    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml).toContain(`<Key>${TEST_KEY}</Key>`);
  });

  it("DELETE object removes from R2", async () => {
    const res = await s3.fetch(url(`/${TEST_KEY}`), { method: "DELETE" });
    expect(res.status).toBe(204);
    // Verify gone
    const head = await s3.fetch(url(`/${TEST_KEY}`), { method: "HEAD" });
    expect(head.status).toBe(404);
  });

  it("deletes the test bucket", async () => {
    await cfDeleteBucket(TEST_BUCKET);
    // Verify bucket gone via HeadBucket
    const res = await s3.fetch(url("/"), { method: "HEAD" });
    expect(res.status).toBe(404);
  });
});
