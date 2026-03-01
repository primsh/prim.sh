import { randomBytes, randomUUID } from "node:crypto";
import {
  countBucketsByOwner,
  getQuota as dbGetQuota,
  setQuota as dbSetQuota,
  decrementUsage,
  deleteBucketRow,
  getBucketByNameAndOwner,
  getBucketById,
  getBucketsByOwner,
  getTotalStorageByOwner,
  incrementUsage,
  insertBucket,
  setUsage,
} from "./db.ts";

// ─── Per-wallet limits (configurable via env) ─────────────────────────────
const MAX_BUCKETS_PER_WALLET = Number(process.env.STORE_MAX_BUCKETS_PER_WALLET ?? 10);
const DEFAULT_BUCKET_QUOTA = Number(process.env.STORE_DEFAULT_BUCKET_QUOTA ?? 104857600); // 100MB
const MAX_STORAGE_PER_WALLET = Number(process.env.STORE_MAX_STORAGE_PER_WALLET ?? 1073741824); // 1GB
import type { PaginatedList, ServiceResult } from "@primsh/x402-middleware";
import type {
  BucketResponse,
  CreateBucketRequest,
  CreateBucketResponse,
  DeleteObjectResponse,
  ObjectResponse,
  PutObjectResponse,
  QuotaResponse,
  ReconcileResponse,
} from "./api.ts";
import {
  CloudflareError,
  createBucket as cfCreateBucket,
  deleteBucket as cfDeleteBucket,
} from "./cloudflare.ts";
import type { BucketRow } from "./db.ts";
import {
  deleteObject as s3DeleteObject,
  getObject as s3GetObject,
  headObject as s3HeadObject,
  listObjects as s3ListObjects,
  putObject as s3PutObject,
} from "./s3.ts";

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
    quota_bytes: row.quota_bytes,
    usage_bytes: row.usage_bytes,
    created_at: new Date(row.created_at).toISOString(),
  };
}

// ─── Ownership ───────────────────────────────────────────────────────────

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
      message:
        "Invalid bucket name. Must be 3-63 chars, lowercase alphanumeric and hyphens, no consecutive hyphens.",
    };
  }

  const bucketCount = countBucketsByOwner(callerWallet);
  if (bucketCount >= MAX_BUCKETS_PER_WALLET) {
    return {
      ok: false,
      status: 403,
      code: "bucket_limit_exceeded",
      message: `Max ${MAX_BUCKETS_PER_WALLET} buckets per wallet`,
    };
  }

  const existing = getBucketByNameAndOwner(request.name, callerWallet);
  if (existing) {
    return {
      ok: false,
      status: 400,
      code: "bucket_name_taken",
      message: "You already have a bucket with this name",
    };
  }

  // R2 bucket name is a UUID — user-facing name is scoped per wallet
  const cfName = randomUUID();

  try {
    const cfBucket = await cfCreateBucket(cfName, request.location);
    const bucketId = generateBucketId();

    insertBucket({
      id: bucketId,
      cf_name: cfName,
      name: request.name,
      owner_wallet: callerWallet,
      location: cfBucket.location ?? request.location ?? null,
    });

    // Apply default quota
    dbSetQuota(bucketId, DEFAULT_BUCKET_QUOTA);

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

export function listBuckets(callerWallet: string, limit: number, page: number): PaginatedList<BucketResponse> {
  const offset = (page - 1) * limit;
  const rows = getBucketsByOwner(callerWallet, limit, offset);
  const total = countBucketsByOwner(callerWallet);

  return {
    data: rows.map(rowToBucketResponse),
    pagination: {
      total,
      page,
      per_page: limit,
      cursor: null,
      has_more: offset + rows.length < total,
    },
  };
}

export function getBucket(bucketId: string, callerWallet: string): ServiceResult<BucketResponse> {
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
  contentLength: number | null,
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

  const { quota_bytes, usage_bytes } = check.row;
  const trackUsage = contentLength !== null;

  // Content-Length required when quota is set
  if (quota_bytes !== null && contentLength === null) {
    return {
      ok: false,
      status: 411,
      code: "invalid_request",
      message: "Content-Length header is required when bucket has a quota.",
    };
  }

  const incomingSize = contentLength ?? 0;

  // HeadObject for overwrite detection (only when tracking usage)
  let oldSize = 0;
  if (trackUsage) {
    try {
      const existing = await s3HeadObject(check.row.cf_name, key);
      if (existing) oldSize = existing.size;
    } catch {
      /* head failed — assume new object */
    }
  }

  // Quota enforcement
  if (quota_bytes !== null) {
    const netDelta = incomingSize - oldSize;
    if (quota_bytes === 0 || usage_bytes + netDelta > quota_bytes) {
      return {
        ok: false,
        status: 413,
        code: "quota_exceeded",
        message: `Upload would exceed bucket quota (${quota_bytes} bytes). Current usage: ${usage_bytes}, incoming: ${incomingSize}.`,
      };
    }
  }

  // Per-wallet total storage cap enforcement
  if (incomingSize > 0) {
    const totalWalletUsage = getTotalStorageByOwner(callerWallet);
    const netDelta = incomingSize - oldSize;
    if (totalWalletUsage + netDelta > MAX_STORAGE_PER_WALLET) {
      return {
        ok: false,
        status: 413,
        code: "storage_limit_exceeded",
        message: "Total storage limit exceeded (1GB)",
      };
    }
  }

  try {
    const result = await s3PutObject(check.row.cf_name, key, body, contentType);
    const actualSize = contentLength ?? result.size;

    // Update usage tracking
    if (trackUsage) {
      const netDelta = actualSize - oldSize;
      if (netDelta > 0) incrementUsage(bucketId, netDelta);
      else if (netDelta < 0) decrementUsage(bucketId, -netDelta);
    }

    return { ok: true, data: { key, size: actualSize, etag: result.etag } };
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
): Promise<
  ServiceResult<{ body: ReadableStream; contentType: string; contentLength: number; etag: string }>
> {
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

  // HeadObject before delete to capture size for usage decrement
  let objectSize = 0;
  try {
    const head = await s3HeadObject(check.row.cf_name, key);
    if (head) objectSize = head.size;
  } catch {
    /* object may already be gone — skip usage decrement */
  }

  try {
    await s3DeleteObject(check.row.cf_name, key);
    if (objectSize > 0) decrementUsage(bucketId, objectSize);
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
): Promise<ServiceResult<PaginatedList<ObjectResponse>>> {
  const check = checkBucketOwnership(bucketId, callerWallet);
  if (!check.ok) return check;

  const maxKeys = limit ?? 100;

  try {
    const result = await s3ListObjects(check.row.cf_name, prefix, maxKeys, cursor);
    return {
      ok: true,
      data: {
        data: result.objects.map((o) => ({
          key: o.key,
          size: o.size,
          etag: o.etag,
          last_modified: o.lastModified,
        })),
        pagination: {
          total: null,
          page: null,
          per_page: maxKeys,
          cursor: result.nextToken,
          has_more: result.isTruncated,
        },
      },
    };
  } catch (err) {
    if (err instanceof CloudflareError) {
      return { ok: false, status: err.statusCode, code: err.code, message: err.message };
    }
    throw err;
  }
}

// ─── Quota service ──────────────────────────────────────────────────────

function computeUsagePct(usageBytes: number, quotaBytes: number | null): number | null {
  if (quotaBytes === null || quotaBytes === 0) return null;
  return Math.round((usageBytes / quotaBytes) * 100 * 100) / 100;
}

export function getUsage(bucketId: string, callerWallet: string): ServiceResult<QuotaResponse> {
  const check = checkBucketOwnership(bucketId, callerWallet);
  if (!check.ok) return check;

  return {
    ok: true,
    data: {
      bucket_id: bucketId,
      quota_bytes: check.row.quota_bytes,
      usage_bytes: check.row.usage_bytes,
      usage_pct: computeUsagePct(check.row.usage_bytes, check.row.quota_bytes),
    },
  };
}

export function setQuotaForBucket(
  bucketId: string,
  callerWallet: string,
  quotaBytes: number | null,
): ServiceResult<QuotaResponse> {
  const check = checkBucketOwnership(bucketId, callerWallet);
  if (!check.ok) return check;

  if (quotaBytes !== null && (quotaBytes < 0 || !Number.isInteger(quotaBytes))) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "quota_bytes must be null or a non-negative integer.",
    };
  }

  dbSetQuota(bucketId, quotaBytes);

  const updated = dbGetQuota(bucketId);
  const usageBytes = updated?.usage_bytes ?? check.row.usage_bytes;

  return {
    ok: true,
    data: {
      bucket_id: bucketId,
      quota_bytes: quotaBytes,
      usage_bytes: usageBytes,
      usage_pct: computeUsagePct(usageBytes, quotaBytes),
    },
  };
}

export async function reconcileUsage(
  bucketId: string,
  callerWallet: string,
): Promise<ServiceResult<ReconcileResponse>> {
  const check = checkBucketOwnership(bucketId, callerWallet);
  if (!check.ok) return check;

  const previousBytes = check.row.usage_bytes;

  // Paginate through all objects to sum actual usage
  let actualBytes = 0;
  let continuationToken: string | undefined;
  try {
    do {
      const page = await s3ListObjects(check.row.cf_name, undefined, 1000, continuationToken);
      for (const obj of page.objects) {
        actualBytes += obj.size;
      }
      continuationToken = page.isTruncated ? (page.nextToken ?? undefined) : undefined;
    } while (continuationToken);
  } catch (err) {
    if (err instanceof CloudflareError) {
      return { ok: false, status: err.statusCode, code: err.code, message: err.message };
    }
    throw err;
  }

  setUsage(bucketId, actualBytes);

  return {
    ok: true,
    data: {
      bucket_id: bucketId,
      previous_bytes: previousBytes,
      actual_bytes: actualBytes,
      delta_bytes: actualBytes - previousBytes,
    },
  };
}
