/**
 * store.sh API contract — request/response types and error envelope.
 */

// ─── Error envelope ───────────────────────────────────────────────────────

export interface ApiError {
  error: {
    code: string;
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
  id: string;
  name: string;
  location: string | null;
  owner_wallet: string;
  quota_bytes: number | null;
  usage_bytes: number;
  created_at: string;
}

export interface CreateBucketRequest {
  name: string;
  location?: string;
}

export interface CreateBucketResponse {
  bucket: BucketResponse;
}

export interface BucketListResponse {
  buckets: BucketResponse[];
  meta: {
    page: number;
    per_page: number;
    total: number;
  };
}

// ─── Object types ─────────────────────────────────────────────────────────

export interface ObjectResponse {
  key: string;
  size: number;
  etag: string;
  last_modified: string;
}

export interface ObjectListResponse {
  objects: ObjectResponse[];
  is_truncated: boolean;
  next_cursor: string | null;
  meta: {
    prefix: string | null;
    limit: number;
  };
}

export interface PutObjectResponse {
  key: string;
  size: number;
  etag: string;
}

export interface DeleteObjectResponse {
  status: "deleted";
}

// ─── Quota types ──────────────────────────────────────────────────────────

export interface QuotaResponse {
  bucket_id: string;
  quota_bytes: number | null;
  usage_bytes: number;
  usage_pct: number | null;
}

export interface SetQuotaRequest {
  quota_bytes: number | null;
}

export interface ReconcileResponse {
  bucket_id: string;
  previous_bytes: number;
  actual_bytes: number;
  delta_bytes: number;
}
