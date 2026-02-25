/**
 * S3-compatible object operations via aws4fetch.
 * Base URL: https://{CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com
 * Auth: AWS SigV4 (R2 S3 API credentials)
 */

import { AwsClient } from "aws4fetch";
import { CloudflareError } from "./cloudflare.ts";

let _client: AwsClient | null = null;

function getS3Client(): AwsClient {
  if (_client) return _client;

  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  if (!accessKeyId) throw new Error("R2_ACCESS_KEY_ID environment variable is required");

  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!secretAccessKey) throw new Error("R2_SECRET_ACCESS_KEY environment variable is required");

  _client = new AwsClient({ accessKeyId, secretAccessKey, service: "s3" });
  return _client;
}

function getBaseUrl(): string {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId) throw new Error("CLOUDFLARE_ACCOUNT_ID environment variable is required");
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

function mapS3ErrorCode(code: string): string {
  if (code === "NoSuchKey" || code === "NoSuchBucket") return "not_found";
  if (code === "AccessDenied") return "forbidden";
  return "r2_error";
}

async function parseS3Error(res: Response): Promise<CloudflareError> {
  try {
    const text = await res.text();
    const codeMatch = text.match(/<Code>(.+?)<\/Code>/);
    const msgMatch = text.match(/<Message>(.+?)<\/Message>/);
    const code = codeMatch?.[1] ?? "UnknownError";
    const message = msgMatch?.[1] ?? `S3 error: ${res.status}`;
    return new CloudflareError(res.status, mapS3ErrorCode(code), message);
  } catch {
    return new CloudflareError(res.status, "r2_error", `S3 error: ${res.status}`);
  }
}

// ─── Object operations ──────────────────────────────────────────────────

export async function headObject(
  bucketName: string,
  key: string,
): Promise<{ size: number; etag: string } | null> {
  const client = getS3Client();
  const url = `${getBaseUrl()}/${bucketName}/${key}`;

  const res = await client.fetch(url, { method: "HEAD" });

  if (res.status === 404) return null;
  if (!res.ok) throw await parseS3Error(res);

  return {
    size: Number.parseInt(res.headers.get("Content-Length") ?? "0", 10),
    etag: res.headers.get("ETag") ?? "",
  };
}

export async function putObject(
  bucketName: string,
  key: string,
  body: ReadableStream | ArrayBuffer | string,
  contentType?: string,
): Promise<{ etag: string; size: number }> {
  const client = getS3Client();
  const url = `${getBaseUrl()}/${bucketName}/${key}`;

  const headers: Record<string, string> = {};
  if (contentType) headers["Content-Type"] = contentType;

  const res = await client.fetch(url, {
    method: "PUT",
    headers,
    body,
  });

  if (!res.ok) throw await parseS3Error(res);

  const etag = res.headers.get("ETag") ?? "";
  const cl = res.headers.get("Content-Length");
  const size = cl ? Number.parseInt(cl, 10) : 0;

  return { etag, size };
}

export async function getObject(
  bucketName: string,
  key: string,
): Promise<{ body: ReadableStream; contentType: string; contentLength: number; etag: string }> {
  const client = getS3Client();
  const url = `${getBaseUrl()}/${bucketName}/${key}`;

  const res = await client.fetch(url, { method: "GET" });

  if (!res.ok) throw await parseS3Error(res);

  return {
    body: res.body as ReadableStream,
    contentType: res.headers.get("Content-Type") ?? "application/octet-stream",
    contentLength: Number.parseInt(res.headers.get("Content-Length") ?? "0", 10),
    etag: res.headers.get("ETag") ?? "",
  };
}

export async function deleteObject(bucketName: string, key: string): Promise<void> {
  const client = getS3Client();
  const url = `${getBaseUrl()}/${bucketName}/${key}`;

  const res = await client.fetch(url, { method: "DELETE" });

  // S3 DELETE returns 204 on success, but also 200 is acceptable
  if (!res.ok && res.status !== 204) throw await parseS3Error(res);
}

export interface S3ListObject {
  key: string;
  size: number;
  etag: string;
  lastModified: string;
}

export async function listObjects(
  bucketName: string,
  prefix?: string,
  maxKeys?: number,
  continuationToken?: string,
): Promise<{ objects: S3ListObject[]; isTruncated: boolean; nextToken: string | null }> {
  const client = getS3Client();
  const params = new URLSearchParams({ "list-type": "2" });
  if (prefix) params.set("prefix", prefix);
  if (maxKeys) params.set("max-keys", String(maxKeys));
  if (continuationToken) params.set("continuation-token", continuationToken);

  const url = `${getBaseUrl()}/${bucketName}?${params.toString()}`;
  const res = await client.fetch(url, { method: "GET" });

  if (!res.ok) throw await parseS3Error(res);

  const text = await res.text();

  const isTruncated = /<IsTruncated>true<\/IsTruncated>/.test(text);
  const nextTokenMatch = text.match(/<NextContinuationToken>(.+?)<\/NextContinuationToken>/);
  const nextToken = nextTokenMatch?.[1] ?? null;

  const objects: S3ListObject[] = [];
  const contentRegex = /<Contents>([\s\S]*?)<\/Contents>/g;
  for (const m of text.matchAll(contentRegex)) {
    const block = m[1];
    const key = block.match(/<Key>(.+?)<\/Key>/)?.[1] ?? "";
    const size = Number.parseInt(block.match(/<Size>(\d+)<\/Size>/)?.[1] ?? "0", 10);
    const etag = block.match(/<ETag>(.+?)<\/ETag>/)?.[1] ?? "";
    const lastModified = block.match(/<LastModified>(.+?)<\/LastModified>/)?.[1] ?? "";
    objects.push({ key, size, etag, lastModified });
  }

  return { objects, isTruncated, nextToken };
}

/** Reset singleton for tests */
export function resetS3Client(): void {
  _client = null;
}
