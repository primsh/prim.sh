// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Regenerate: pnpm gen:tests
/**
 * store.sh — Tier 2 integration tests
 *
 * Real cloudflare-r2 API calls. No x402, no SQLite.
 * Auto-skips when provider credentials are missing.
 *
 * Requires: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN
 * Docs: https://developers.cloudflare.com/r2/api/s3/api/
 */
import { afterAll, describe, expect, it } from "vitest";

const REQUIRED_ENV = [
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
];
const MISSING_ENV = REQUIRED_ENV.filter((k) => !process.env[k]);

const TEST_PREFIX = `test-int-${Date.now()}`;

import { AwsClient } from "aws4fetch";

const TEST_BUCKET = `${TEST_PREFIX}-bucket`;
const TEST_KEY = "integration-test.txt";
const TEST_CONTENT = "hello from store integration test";

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
  if (!res.ok) throw new Error(`Create bucket failed: ${res.status}`);
}

async function cfDeleteBucket(name: string): Promise<void> {
  const acct = process.env.CLOUDFLARE_ACCOUNT_ID;
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${acct}/r2/buckets/${name}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` },
    },
  );
  if (!res.ok && res.status !== 404) throw new Error(`Delete bucket failed: ${res.status}`);
}

describe.skipIf(MISSING_ENV.length > 0)("store.sh integration — S3 layer", () => {
  if (MISSING_ENV.length > 0) return;

  const s3 = getS3Client();
  const url = (path: string) => `${baseUrl()}/${TEST_BUCKET}${path}`;

  afterAll(async () => {
    try {
      await s3.fetch(url(`/${TEST_KEY}`), { method: "DELETE" });
    } catch {
      /* cleanup */
    }
    try {
      await cfDeleteBucket(TEST_BUCKET);
    } catch {
      /* cleanup */
    }
  });

  it("creates a test bucket", async () => {
    await cfCreateBucket(TEST_BUCKET);
    const res = await s3.fetch(url("/"), { method: "HEAD" });
    expect(res.status).toBe(200);
  });

  it("PUT object uploads", async () => {
    const res = await s3.fetch(url(`/${TEST_KEY}`), {
      method: "PUT",
      headers: { "Content-Type": "text/plain" },
      body: TEST_CONTENT,
    });
    expect(res.status).toBe(200);
  });

  it("GET object downloads", async () => {
    const res = await s3.fetch(url(`/${TEST_KEY}`));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(TEST_CONTENT);
  });

  it("LIST includes the object", async () => {
    const res = await s3.fetch(url("/?list-type=2"));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain(TEST_KEY);
  });

  it("DELETE object removes it", async () => {
    const res = await s3.fetch(url(`/${TEST_KEY}`), { method: "DELETE" });
    expect(res.status).toBe(204);
  });

  it("deletes the test bucket", async () => {
    await cfDeleteBucket(TEST_BUCKET);
    const res = await s3.fetch(url("/"), { method: "HEAD" });
    expect(res.status).toBe(404);
  });
});
