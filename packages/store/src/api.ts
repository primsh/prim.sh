/**
 * store.sh API contract — request/response types and error envelope.
 */

// ─── Error envelope ───────────────────────────────────────────────────────

export interface ApiError {
  error: {
    /** Machine-readable error code. */
    code: string;
    /** Human-readable error message. */
    message: string;
  };
}

export const ERROR_CODES = [
  "not_found",
  "forbidden",
  "invalid_request",
  "r2_error",
  "rate_limited",
  "bucket_name_taken",
  "quota_exceeded",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

// ─── Bucket types ─────────────────────────────────────────────────────────

export interface BucketResponse {
  /** Bucket ID (UUID). */
  id: string;
  /** Bucket name. Unique per wallet. Alphanumeric, hyphens, underscores. */
  name: string;
  /** Storage region (e.g. "us-east-1"). Null = default region. */
  location: string | null;
  /** Ethereum address of the bucket owner. */
  owner_wallet: string;
  /** Per-bucket quota in bytes. Null = default (100 MB). */
  quota_bytes: number | null;
  /** Current storage usage in bytes. */
  usage_bytes: number;
  /** ISO 8601 timestamp when the bucket was created. */
  created_at: string;
}

export interface CreateBucketRequest {
  /** Bucket name. Unique per wallet. 3-63 chars, alphanumeric + hyphens. */
  name: string;
  /** Storage region (e.g. "us-east-1"). Defaults to primary region. */
  location?: string;
}

export interface CreateBucketResponse {
  /** The created bucket. */
  bucket: BucketResponse;
}

// ─── Object types ─────────────────────────────────────────────────────────

export interface ObjectResponse {
  /** Object key (path within bucket, slashes allowed). */
  key: string;
  /** Object size in bytes. */
  size: number;
  /** ETag (MD5 hash) of the object. */
  etag: string;
  /** ISO 8601 timestamp of last modification. */
  last_modified: string;
}

export interface PutObjectResponse {
  /** Object key as stored. */
  key: string;
  /** Object size in bytes. */
  size: number;
  /** ETag (MD5 hash). */
  etag: string;
}

export interface DeleteObjectResponse {
  /** Always "deleted" on success. */
  status: "deleted";
}

// ─── Quota types ──────────────────────────────────────────────────────────

export interface QuotaResponse {
  /** Bucket ID. */
  bucket_id: string;
  /** Per-bucket quota in bytes. Null = default (100 MB). */
  quota_bytes: number | null;
  /** Current storage usage in bytes. */
  usage_bytes: number;
  /** Usage as a percentage (0-100). Null if quota_bytes is null. */
  usage_pct: number | null;
}

export interface SetQuotaRequest {
  /** New quota in bytes. Pass null to reset to default (100 MB). */
  quota_bytes: number | null;
}

export interface ReconcileResponse {
  /** Bucket ID. */
  bucket_id: string;
  /** Storage usage recorded before reconciliation, in bytes. */
  previous_bytes: number;
  /** Actual storage usage recomputed from R2, in bytes. */
  actual_bytes: number;
  /** Difference (actual - previous). Negative means recorded was overstated. */
  delta_bytes: number;
}
