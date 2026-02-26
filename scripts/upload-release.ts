#!/usr/bin/env bun
/**
 * Upload a file to the prim-releases R2 bucket via S3-compatible API (aws4fetch).
 * Usage: bun scripts/upload-release.ts <local-path> <r2-key>
 * If local-path is "-", reads from stdin.
 *
 * Required env vars:
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_ACCOUNT_ID
 */

import { readFileSync } from "node:fs";
import { AwsClient } from "aws4fetch";

const [localPath, r2Key] = process.argv.slice(2);
if (!localPath || !r2Key) {
  console.error("Usage: upload-release.ts <local-path> <r2-key>");
  console.error("  local-path: path to file, or '-' to read from stdin");
  process.exit(1);
}

const accountId = process.env.R2_ACCOUNT_ID;
if (!accountId) {
  console.error("R2_ACCOUNT_ID environment variable is required");
  process.exit(1);
}

const accessKeyId = process.env.R2_ACCESS_KEY_ID;
if (!accessKeyId) {
  console.error("R2_ACCESS_KEY_ID environment variable is required");
  process.exit(1);
}

const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
if (!secretAccessKey) {
  console.error("R2_SECRET_ACCESS_KEY environment variable is required");
  process.exit(1);
}

const client = new AwsClient({ accessKeyId, secretAccessKey, service: "s3" });

const body = localPath === "-" ? await Bun.stdin.bytes() : readFileSync(localPath);

const contentType = r2Key.endsWith("VERSION") || r2Key.endsWith(".sha256")
  ? "text/plain"
  : "application/octet-stream";

const url = `https://${accountId}.r2.cloudflarestorage.com/prim-releases/${r2Key}`;

const res = await client.fetch(url, {
  method: "PUT",
  body,
  headers: {
    "Content-Type": contentType,
    "Content-Length": String(body.length),
  },
});

if (!res.ok) {
  const text = await res.text();
  console.error(`Upload failed (${res.status}): ${text}`);
  process.exit(1);
}

console.log(`Uploaded ${r2Key}`);
