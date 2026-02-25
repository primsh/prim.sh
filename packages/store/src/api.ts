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
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

// ─── Bucket types ─────────────────────────────────────────────────────────

export interface BucketResponse {
  id: string;
  name: string;
  location: string | null;
  owner_wallet: string;
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
