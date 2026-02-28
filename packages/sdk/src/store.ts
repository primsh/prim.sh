// THIS FILE IS GENERATED — DO NOT EDIT
// Source: specs/openapi/store.yaml
// Regenerate: pnpm gen:sdk

// ── Types ──────────────────────────────────────────────────────────────────

export interface BucketResponse {
  /** Unique bucket identifier (UUID). */
  id: string;
  /** Bucket name (unique per wallet). */
  name: string;
  /** Storage region. null = default region. */
  location: string | null;
  /** Ethereum address of the wallet that created this bucket. */
  owner_wallet: string;
  /** Per-bucket storage quota in bytes. null = default quota (100 MB). */
  quota_bytes: number | null;
  /** Current storage usage in bytes. */
  usage_bytes: number;
  /** ISO 8601 timestamp of bucket creation. */
  created_at: string;
}

export interface ObjectResponse {
  /** Object key (path within the bucket). */
  key: string;
  /** Object size in bytes. */
  size: number;
  /** ETag (MD5 hash of object content). */
  etag: string;
  /** ISO 8601 timestamp of last modification. */
  last_modified: string;
}

export interface QuotaResponse {
  /** Bucket identifier. */
  bucket_id: string;
  /** Storage quota in bytes. null = default quota (100 MB). */
  quota_bytes: number | null;
  /** Current usage in bytes. */
  usage_bytes: number;
  /** Usage as a percentage of quota (0–100). null if quota_bytes is null. */
  usage_pct: number | null;
}

export interface CreateBucketRequest {
  /** Bucket name. Must be unique per wallet. Alphanumeric, hyphens, underscores. */
  name: string;
  /** Storage region (optional). Defaults to primary region. */
  location?: string;
}

export interface SetQuotaRequest {
  /** New quota in bytes, or null to reset to default (100 MB). */
  quota_bytes: number | null;
}

export interface ListBucketsParams {
  /** Number of buckets per page (1–100, default 20). */
  limit?: number;
  /** Page number (1-based, default 1). */
  page?: number;
}

export interface GetBucketParams {
  /** Bucket ID. */
  id: string;
}

export interface DeleteBucketParams {
  /** Bucket ID. */
  id: string;
}

export interface ListObjectsParams {
  /** Bucket ID. */
  id: string;
  /** Filter objects by key prefix (e.g. "notes/" to list only keys starting with "notes/"). */
  prefix?: string;
  /** Maximum number of objects to return (1–1000, default 100). */
  limit?: number;
  /** Pagination cursor from the previous response's `next_cursor`. */
  cursor?: string;
}

export interface PutObjectParams {
  /** Bucket ID. */
  id: string;
  /** Object key (path). May include slashes (e.g. "notes/2026/feb.txt"). */
  key: string;
}

export interface GetObjectParams {
  /** Bucket ID. */
  id: string;
  /** Object key (path). May include slashes. */
  key: string;
}

export interface DeleteObjectParams {
  /** Bucket ID. */
  id: string;
  /** Object key (path). May include slashes. */
  key: string;
}

export interface GetQuotaParams {
  /** Bucket ID. */
  id: string;
}

export interface SetQuotaParams {
  /** Bucket ID. */
  id: string;
}

export interface ReconcileQuotaParams {
  /** Bucket ID. */
  id: string;
}

export interface CreateBucketResponse {
  bucket: BucketResponse;
}

export interface ListBucketsResponse {
  buckets: BucketResponse[];
  meta: {
    page: number;
    per_page: number;
    total: number;
  };
}

export type DeleteBucketResponse = Record<string, unknown>;

export interface ListObjectsResponse {
  objects: ObjectResponse[];
  /** true if there are more objects beyond this page. */
  is_truncated: boolean;
  /** Cursor to pass in the next request. null if is_truncated is false. */
  next_cursor: string | null;
  meta: {
    prefix: string | null;
    limit: number;
  };
}

export interface PutObjectResponse {
  /** Object key as stored. */
  key: string;
  /** Object size in bytes. */
  size: number;
  /** ETag (MD5 hash) of the uploaded object. */
  etag: string;
}

export interface DeleteObjectResponse {
  status: "deleted";
}

export interface ReconcileQuotaResponse {
  /** Bucket identifier. */
  bucket_id: string;
  /** Usage recorded before reconciliation. */
  previous_bytes: number;
  /** Actual usage recomputed from R2. */
  actual_bytes: number;
  /** Difference (actual_bytes - previous_bytes). Negative means recorded usage was overstated. */
  delta_bytes: number;
}

// ── Client ─────────────────────────────────────────────────────────────────

export function createStoreClient(primFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const baseUrl = "https://store.prim.sh";
  return {
    async createBucket(req: CreateBucketRequest): Promise<CreateBucketResponse> {
      const url = `${baseUrl}/v1/buckets`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return res.json() as Promise<CreateBucketResponse>;
    },
    async listBuckets(params: ListBucketsParams): Promise<ListBucketsResponse> {
      const qs = new URLSearchParams();
      if (params.limit !== undefined) qs.set("limit", String(params.limit));
      if (params.page !== undefined) qs.set("page", String(params.page));
      const query = qs.toString();
      const url = `${baseUrl}/v1/buckets${query ? `?${query}` : ""}`;
      const res = await primFetch(url);
      return res.json() as Promise<ListBucketsResponse>;
    },
    async getBucket(params: GetBucketParams): Promise<BucketResponse> {
      const url = `${baseUrl}/v1/buckets/${encodeURIComponent(params.id)}`;
      const res = await primFetch(url);
      return res.json() as Promise<BucketResponse>;
    },
    async deleteBucket(params: DeleteBucketParams): Promise<DeleteBucketResponse> {
      const url = `${baseUrl}/v1/buckets/${encodeURIComponent(params.id)}`;
      const res = await primFetch(url, {
        method: "DELETE",
      });
      return res.json() as Promise<DeleteBucketResponse>;
    },
    async listObjects(params: ListObjectsParams): Promise<ListObjectsResponse> {
      const qs = new URLSearchParams();
      if (params.prefix !== undefined) qs.set("prefix", String(params.prefix));
      if (params.limit !== undefined) qs.set("limit", String(params.limit));
      if (params.cursor !== undefined) qs.set("cursor", String(params.cursor));
      const query = qs.toString();
      const url = `${baseUrl}/v1/buckets/${encodeURIComponent(params.id)}/objects${query ? `?${query}` : ""}`;
      const res = await primFetch(url);
      return res.json() as Promise<ListObjectsResponse>;
    },
    async putObject(params: PutObjectParams, body: BodyInit, contentType?: string): Promise<PutObjectResponse> {
      const url = `${baseUrl}/v1/buckets/${encodeURIComponent(params.id)}/objects/${encodeURIComponent(params.key)}`;
      const res = await primFetch(url, {
        method: "PUT",
        headers: contentType ? { "Content-Type": contentType } : {},
        body,
      });
      return res.json() as Promise<PutObjectResponse>;
    },
    async getObject(params: GetObjectParams): Promise<Response> {
      const url = `${baseUrl}/v1/buckets/${encodeURIComponent(params.id)}/objects/${encodeURIComponent(params.key)}`;
      const res = await primFetch(url);
      return res;
    },
    async deleteObject(params: DeleteObjectParams): Promise<DeleteObjectResponse> {
      const url = `${baseUrl}/v1/buckets/${encodeURIComponent(params.id)}/objects/${encodeURIComponent(params.key)}`;
      const res = await primFetch(url, {
        method: "DELETE",
      });
      return res.json() as Promise<DeleteObjectResponse>;
    },
    async getQuota(params: GetQuotaParams): Promise<QuotaResponse> {
      const url = `${baseUrl}/v1/buckets/${encodeURIComponent(params.id)}/quota`;
      const res = await primFetch(url);
      return res.json() as Promise<QuotaResponse>;
    },
    async setQuota(params: SetQuotaParams, req: SetQuotaRequest): Promise<QuotaResponse> {
      const url = `${baseUrl}/v1/buckets/${encodeURIComponent(params.id)}/quota`;
      const res = await primFetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return res.json() as Promise<QuotaResponse>;
    },
    async reconcileQuota(params: ReconcileQuotaParams): Promise<ReconcileQuotaResponse> {
      const url = `${baseUrl}/v1/buckets/${encodeURIComponent(params.id)}/quota/reconcile`;
      const res = await primFetch(url, {
        method: "POST",
      });
      return res.json() as Promise<ReconcileQuotaResponse>;
    },
  };
}
