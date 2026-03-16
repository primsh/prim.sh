// SPDX-License-Identifier: Apache-2.0
/**
 * store.sh API contract — Zod schemas, inferred types, and error envelope.
 */

import { z } from "zod";

// ─── Error envelope ───────────────────────────────────────────────────────

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string().describe("Machine-readable error code."),
    message: z.string().describe("Human-readable error message."),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

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

export const GetBucketResponseSchema = z.object({
  id: z.string().describe("Bucket ID (UUID)."),
  name: z.string().describe("Bucket name. Unique per wallet. Alphanumeric, hyphens, underscores."),
  location: z.string().nullable().describe('Storage region (e.g. "us-east-1"). Null = default region.'),
  owner_wallet: z.string().describe("Ethereum address of the bucket owner."),
  quota_bytes: z.number().nullable().describe("Per-bucket quota in bytes. Null = default (100 MB)."),
  usage_bytes: z.number().describe("Current storage usage in bytes."),
  is_public: z.boolean().describe("Whether the bucket is publicly readable."),
  public_url: z
    .string()
    .optional()
    .describe("Stable public URL prefix for this bucket. Only present when is_public is true."),
  created_at: z.string().describe("ISO 8601 timestamp when the bucket was created."),
});
export type GetBucketResponse = z.infer<typeof GetBucketResponseSchema>;

export const CreateBucketRequestSchema = z.object({
  name: z
    .string()
    .min(3)
    .max(63)
    .describe("Bucket name. Unique per wallet. 3-63 chars, alphanumeric + hyphens."),
  location: z.string().optional().describe('Storage region (e.g. "us-east-1"). Defaults to primary region.'),
  is_public: z.boolean().optional().describe("Whether the bucket should be publicly readable. Defaults to false."),
});
export type CreateBucketRequest = z.infer<typeof CreateBucketRequestSchema>;

export const UpdateBucketRequestSchema = z.object({
  is_public: z.boolean().describe("Whether the bucket should be publicly readable."),
});
export type UpdateBucketRequest = z.infer<typeof UpdateBucketRequestSchema>;

export const CreateBucketResponseSchema = z.object({
  bucket: GetBucketResponseSchema.describe("The created bucket."),
});
export type CreateBucketResponse = z.infer<typeof CreateBucketResponseSchema>;

// ─── Object types ─────────────────────────────────────────────────────────

export const GetObjectResponseSchema = z.object({
  key: z.string().describe("Object key (path within bucket, slashes allowed)."),
  size: z.number().describe("Object size in bytes."),
  etag: z.string().describe("ETag (MD5 hash) of the object."),
  last_modified: z.string().describe("ISO 8601 timestamp of last modification."),
});
export type GetObjectResponse = z.infer<typeof GetObjectResponseSchema>;

export const PutObjectResponseSchema = z.object({
  key: z.string().describe("Object key as stored."),
  size: z.number().describe("Object size in bytes."),
  etag: z.string().describe("ETag (MD5 hash)."),
  public_url: z
    .string()
    .optional()
    .describe("Stable public URL for this object. Only present when bucket is public."),
});
export type PutObjectResponse = z.infer<typeof PutObjectResponseSchema>;

export const DeleteObjectResponseSchema = z.object({
  status: z.literal("deleted").describe('Always "deleted" on success.'),
});
export type DeleteObjectResponse = z.infer<typeof DeleteObjectResponseSchema>;

// ─── Quota types ──────────────────────────────────────────────────────────

export const GetQuotaResponseSchema = z.object({
  bucket_id: z.string().describe("Bucket ID."),
  quota_bytes: z.number().nullable().describe("Per-bucket quota in bytes. Null = default (100 MB)."),
  usage_bytes: z.number().describe("Current storage usage in bytes."),
  usage_pct: z.number().nullable().describe("Usage as a percentage (0-100). Null if quota_bytes is null."),
});
export type GetQuotaResponse = z.infer<typeof GetQuotaResponseSchema>;

export const SetQuotaRequestSchema = z.object({
  quota_bytes: z.number().nullable().describe("New quota in bytes. Pass null to reset to default (100 MB)."),
});
export type SetQuotaRequest = z.infer<typeof SetQuotaRequestSchema>;

export const ReconcileStorageResponseSchema = z.object({
  bucket_id: z.string().describe("Bucket ID."),
  previous_bytes: z.number().describe("Storage usage recorded before reconciliation, in bytes."),
  actual_bytes: z.number().describe("Actual storage usage recomputed from R2, in bytes."),
  delta_bytes: z
    .number()
    .describe("Difference (actual - previous). Negative means recorded was overstated."),
});
export type ReconcileStorageResponse = z.infer<typeof ReconcileStorageResponseSchema>;

// ─── Presign types ─────────────────────────────────────────────────────────

export const CreatePresignRequestSchema = z.object({
  key: z.string().min(1).describe("Object key to presign."),
  method: z.enum(["GET", "PUT"]).describe('HTTP method: "GET" for download, "PUT" for upload.'),
  expires_in: z.number().min(60).max(86400).optional().describe("URL lifetime in seconds (60–86400). Defaults to 3600."),
});
export type CreatePresignRequest = z.infer<typeof CreatePresignRequestSchema>;

export const CreatePresignResponseSchema = z.object({
  url: z.string().describe("Presigned URL for direct R2 access."),
  method: z.enum(["GET", "PUT"]).describe("HTTP method this URL was signed for."),
  key: z.string().describe("Object key."),
  expires_at: z.string().describe("ISO 8601 timestamp when the URL expires."),
});
export type CreatePresignResponse = z.infer<typeof CreatePresignResponseSchema>;
