// THIS FILE IS GENERATED — DO NOT EDIT
// Source: specs/openapi/store.yaml
// Regenerate: pnpm gen:sdk

// ── Types ──────────────────────────────────────────────────────────────────

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

export interface DeleteObjectResponse {
  /** Always "deleted" on success. */
  status: "deleted";
}

export interface PutObjectResponse {
  /** Object key as stored. */
  key: string;
  /** Object size in bytes. */
  size: number;
  /** ETag (MD5 hash). */
  etag: string;
}

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

export interface SetQuotaRequest {
  /** New quota in bytes. Pass null to reset to default (100 MB). */
  quota_bytes: number | null;
}

export interface ListBucketsParams {
  /** 1-100, default 20 */
  limit?: number;
  /** 1-based page number, default 1 */
  page?: number;
}

export interface GetBucketParams {
  /** id parameter */
  id: string;
}

export interface DeleteBucketParams {
  /** id parameter */
  id: string;
}

export interface PutObjectParams {
  /** id parameter */
  id: string;
  /** key parameter */
  key: string;
}

export interface GetObjectParams {
  /** id parameter */
  id: string;
  /** key parameter */
  key: string;
}

export interface DeleteObjectParams {
  /** id parameter */
  id: string;
  /** key parameter */
  key: string;
}

export interface ListObjectsParams {
  /** id parameter */
  id: string;
  /** Filter by key prefix (e.g. notes/) */
  prefix?: string;
  /** 1-1000, default 100 */
  limit?: number;
  /** Cursor from previous response's next_cursor */
  cursor?: string;
}

export interface GetQuotaParams {
  /** id parameter */
  id: string;
}

export interface SetQuotaParams {
  /** id parameter */
  id: string;
}

export interface ReconcileQuotaParams {
  /** id parameter */
  id: string;
}

export type ListBucketsResponse = Record<string, unknown>;

export type DeleteBucketResponse = Record<string, unknown>;

export type GetObjectResponse = Record<string, unknown>;

export type ListObjectsResponse = Record<string, unknown>;

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
    async putObject(params: PutObjectParams): Promise<PutObjectResponse> {
      const url = `${baseUrl}/v1/buckets/${encodeURIComponent(params.id)}/objects/${encodeURIComponent(params.key)}`;
      const res = await primFetch(url, {
        method: "PUT",
      });
      return res.json() as Promise<PutObjectResponse>;
    },
    async getObject(params: GetObjectParams): Promise<GetObjectResponse> {
      const url = `${baseUrl}/v1/buckets/${encodeURIComponent(params.id)}/objects/${encodeURIComponent(params.key)}`;
      const res = await primFetch(url);
      return res.json() as Promise<GetObjectResponse>;
    },
    async deleteObject(params: DeleteObjectParams): Promise<DeleteObjectResponse> {
      const url = `${baseUrl}/v1/buckets/${encodeURIComponent(params.id)}/objects/${encodeURIComponent(params.key)}`;
      const res = await primFetch(url, {
        method: "DELETE",
      });
      return res.json() as Promise<DeleteObjectResponse>;
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
    async reconcileQuota(params: ReconcileQuotaParams): Promise<ReconcileResponse> {
      const url = `${baseUrl}/v1/buckets/${encodeURIComponent(params.id)}/quota/reconcile`;
      const res = await primFetch(url, {
        method: "POST",
      });
      return res.json() as Promise<ReconcileResponse>;
    },
  };
}
