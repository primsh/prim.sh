import { randomBytes } from "node:crypto";
import {
  insertBucket,
  getBucketById,
  getBucketByCfName,
  getBucketsByOwner,
  countBucketsByOwner,
  deleteBucketRow,
} from "./db.ts";
import {
  CloudflareError,
  createBucket as cfCreateBucket,
  deleteBucket as cfDeleteBucket,
} from "./cloudflare.ts";
import {
  putObject as s3PutObject,
  getObject as s3GetObject,
  deleteObject as s3DeleteObject,
  listObjects as s3ListObjects,
} from "./s3.ts";
import type {
  BucketResponse,
  BucketListResponse,
  CreateBucketRequest,
  CreateBucketResponse,
  PutObjectResponse,
  DeleteObjectResponse,
  ObjectListResponse,
} from "./api.ts";
import type { BucketRow } from "./db.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────

function generateBucketId(): string {
  return `b_${randomBytes(4).toString("hex")}`;
}

function rowToBucketResponse(row: BucketRow): BucketResponse {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    owner_wallet: row.owner_wallet,
    created_at: new Date(row.created_at).toISOString(),
  };
}

// ─── Ownership ───────────────────────────────────────────────────────────

type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string };

type BucketCheck =
  | { ok: true; row: BucketRow }
  | { ok: false; status: 403 | 404; code: string; message: string };

function checkBucketOwnership(bucketId: string, caller: string): BucketCheck {
  const row = getBucketById(bucketId);
  if (!row) {
    return { ok: false, status: 404, code: "not_found", message: "Bucket not found" };
  }
  if (row.owner_wallet !== caller) {
    return { ok: false, status: 403, code: "forbidden", message: "Forbidden" };
  }
  return { ok: true, row };
}

// ─── Validation ──────────────────────────────────────────────────────────

export function isValidBucketName(name: string): boolean {
  if (!name || name.length < 3 || name.length > 63) return false;
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(name) && !/^[a-z0-9]{3}$/.test(name)) return false;
  if (name.includes("--")) return false;
  return true;
}

// ─── Object key validation ───────────────────────────────────────────────

export function isValidObjectKey(key: string): boolean {
  if (key.length === 0 || key.length > 1024) return false;
  if (key.includes("\0")) return false;
  if (key.startsWith("/")) return false;
  return true;
}

// ─── Bucket service ──────────────────────────────────────────────────────

export async function createBucket(
  request: CreateBucketRequest,
  callerWallet: string,
): Promise<ServiceResult<CreateBucketResponse>> {
  if (!isValidBucketName(request.name)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Invalid bucket name. Must be 3-63 chars, lowercase alphanumeric and hyphens, no consecutive hyphens.",
    };
  }

  const existing = getBucketByCfName(request.name);
  if (existing) {
    return {
      ok: false,
      status: 400,
      code: "bucket_name_taken",
      message: "Bucket name already taken",
    };
  }

  try {
    const cfBucket = await cfCreateBucket(request.name, request.location);
    const bucketId = generateBucketId();

    insertBucket({
      id: bucketId,
      cf_name: request.name,
      name: request.name,
      owner_wallet: callerWallet,
      location: cfBucket.location ?? request.location ?? null,
    });

    const row = getBucketById(bucketId);
    if (!row) throw new Error("Failed to retrieve bucket after insert");

    return { ok: true, data: { bucket: rowToBucketResponse(row) } };
  } catch (err) {
    if (err instanceof CloudflareError) {
      return { ok: false, status: err.statusCode, code: err.code, message: err.message };
    }
    throw err;
  }
}

export function listBuckets(
  callerWallet: string,
  limit: number,
  page: number,
): BucketListResponse {
  const offset = (page - 1) * limit;
  const rows = getBucketsByOwner(callerWallet, limit, offset);
  const total = countBucketsByOwner(callerWallet);

  return {
    buckets: rows.map(rowToBucketResponse),
    meta: { page, per_page: limit, total },
  };
}

export function getBucket(
  bucketId: string,
  callerWallet: string,
): ServiceResult<BucketResponse> {
  const check = checkBucketOwnership(bucketId, callerWallet);
  if (!check.ok) return check;
  return { ok: true, data: rowToBucketResponse(check.row) };
}

export async function deleteBucket(
  bucketId: string,
  callerWallet: string,
): Promise<ServiceResult<{ status: "deleted" }>> {
  const check = checkBucketOwnership(bucketId, callerWallet);
  if (!check.ok) return check;

  try {
    await cfDeleteBucket(check.row.cf_name);
  } catch (err) {
    if (err instanceof CloudflareError) {
      return { ok: false, status: err.statusCode, code: err.code, message: err.message };
    }
    throw err;
  }

  deleteBucketRow(bucketId);

  return { ok: true, data: { status: "deleted" } };
}

// ─── Object service ─────────────────────────────────────────────────────

export async function putObject(
  bucketId: string,
  key: string,
  body: ReadableStream | ArrayBuffer | string,
  contentType: string | undefined,
  callerWallet: string,
): Promise<ServiceResult<PutObjectResponse>> {
  const check = checkBucketOwnership(bucketId, callerWallet);
  if (!check.ok) return check;

  if (!isValidObjectKey(key)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Invalid object key. Must be 1-1024 chars, no null bytes, no leading slash.",
    };
  }

  try {
    const result = await s3PutObject(check.row.cf_name, key, body, contentType);
    return { ok: true, data: { key, size: result.size, etag: result.etag } };
  } catch (err) {
    if (err instanceof CloudflareError) {
      return { ok: false, status: err.statusCode, code: err.code, message: err.message };
    }
    throw err;
  }
}

export async function getObject(
  bucketId: string,
  key: string,
  callerWallet: string,
): Promise<ServiceResult<{ body: ReadableStream; contentType: string; contentLength: number; etag: string }>> {
  const check = checkBucketOwnership(bucketId, callerWallet);
  if (!check.ok) return check;

  if (!isValidObjectKey(key)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Invalid object key. Must be 1-1024 chars, no null bytes, no leading slash.",
    };
  }

  try {
    const result = await s3GetObject(check.row.cf_name, key);
    return { ok: true, data: result };
  } catch (err) {
    if (err instanceof CloudflareError) {
      return { ok: false, status: err.statusCode, code: err.code, message: err.message };
    }
    throw err;
  }
}

export async function deleteObject(
  bucketId: string,
  key: string,
  callerWallet: string,
): Promise<ServiceResult<DeleteObjectResponse>> {
  const check = checkBucketOwnership(bucketId, callerWallet);
  if (!check.ok) return check;

  if (!isValidObjectKey(key)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Invalid object key. Must be 1-1024 chars, no null bytes, no leading slash.",
    };
  }

  try {
    await s3DeleteObject(check.row.cf_name, key);
    return { ok: true, data: { status: "deleted" } };
  } catch (err) {
    if (err instanceof CloudflareError) {
      return { ok: false, status: err.statusCode, code: err.code, message: err.message };
    }
    throw err;
  }
}

export async function listObjects(
  bucketId: string,
  callerWallet: string,
  prefix?: string,
  limit?: number,
  cursor?: string,
): Promise<ServiceResult<ObjectListResponse>> {
  const check = checkBucketOwnership(bucketId, callerWallet);
  if (!check.ok) return check;

  const maxKeys = limit ?? 100;

  try {
    const result = await s3ListObjects(check.row.cf_name, prefix, maxKeys, cursor);
    return {
      ok: true,
      data: {
        objects: result.objects.map((o) => ({
          key: o.key,
          size: o.size,
          etag: o.etag,
          last_modified: o.lastModified,
        })),
        is_truncated: result.isTruncated,
        next_cursor: result.nextToken,
        meta: { prefix: prefix ?? null, limit: maxKeys },
      },
    };
  } catch (err) {
    if (err instanceof CloudflareError) {
      return { ok: false, status: err.statusCode, code: err.code, message: err.message };
    }
    throw err;
  }
}
