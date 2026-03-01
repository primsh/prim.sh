// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Source: packages/mem/openapi.yaml
// Regenerate: pnpm gen:sdk

// ── Types ──────────────────────────────────────────────────────────────────

export interface CollectionResponse {
  /** Collection ID (UUID). */
  id: string;
  /** Collection name. Unique per wallet. */
  name: string;
  /** Ethereum address of the collection owner. */
  owner_wallet: string;
  /** Embedding vector dimension (e.g. 1536 for text-embedding-3-small). */
  dimension: number;
  /** Distance metric: "Cosine" | "Euclid" | "Dot". */
  distance: string;
  /** Live Qdrant points_count — null in list responses to avoid N+1 calls. */
  document_count: number | null;
  /** ISO 8601 timestamp when the collection was created. */
  created_at: string;
}

export interface CreateCollectionRequest {
  /** Collection name. Unique per wallet. */
  name: string;
  /** Distance metric for similarity search. Default "Cosine". */
  distance?: "Cosine" | "Euclid" | "Dot";
  /** Vector dimension. Must match the embedding model used. Default 1536. */
  dimension?: number;
}

export interface GetCacheResponse {
  /** Cache namespace (collection name). */
  namespace: string;
  /** Cache key. */
  key: string;
  /** Stored value. */
  value: string;
  /** ISO string expiry time, or null if permanent. */
  expires_at: string | null;
}

export interface QueryMatch {
  /** Document ID. */
  id: string;
  /** Similarity score (higher = more similar). */
  score: number;
  /** Original document text. */
  text: string;
  /** Document metadata. */
  metadata: string;
}

export interface QueryRequest {
  /** Query text to embed and search against. */
  text: string;
  /** Number of nearest neighbors to return. Default 10. */
  top_k?: number;
  /** Qdrant-native filter passthrough. */
  filter?: string;
}

export interface QueryResponse {
  /** Nearest neighbor matches, ordered by descending score. */
  matches: QueryMatch[];
}

export interface SetCacheRequest {
  /** Value to store. Any JSON-serializable value. */
  value: string;
  /** TTL in seconds. Omit or null for permanent. */
  ttl?: number | null;
}

export interface UpsertDocument {
  /** Must be UUID v4 if provided; omit to auto-generate. */
  id?: string;
  /** Document text to embed and store. */
  text: string;
  /** Arbitrary JSON metadata to store alongside the vector. */
  metadata?: string;
}

export interface UpsertRequest {
  /** Documents to upsert. Existing IDs are overwritten. */
  documents: UpsertDocument[];
}

export interface UpsertResponse {
  /** Number of documents upserted. */
  upserted: number;
  /** IDs of upserted documents (auto-generated UUIDs if not provided). */
  ids: string[];
}

export interface ListCollectionsParams {
  /** 1-100, default 20 */
  limit?: number;
  /** Cursor from previous response */
  after?: string;
}

export interface GetCollectionParams {
  /** id parameter */
  id: string;
}

export interface DeleteCollectionParams {
  /** id parameter */
  id: string;
}

export interface UpsertDocumentsParams {
  /** id parameter */
  id: string;
}

export interface QueryCollectionParams {
  /** id parameter */
  id: string;
}

export interface SetCacheParams {
  /** namespace parameter */
  namespace: string;
  /** key parameter */
  key: string;
}

export interface GetCacheParams {
  /** namespace parameter */
  namespace: string;
  /** key parameter */
  key: string;
}

export interface DeleteCacheParams {
  /** namespace parameter */
  namespace: string;
  /** key parameter */
  key: string;
}

export type ListCollectionsResponse = Record<string, unknown>;

export type DeleteCollectionResponse = Record<string, unknown>;

export type SetCacheResponse = Record<string, unknown>;

export type DeleteCacheResponse = Record<string, unknown>;

// ── Client ─────────────────────────────────────────────────────────────────

export function createMemClient(
  primFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  baseUrl = "https://mem.prim.sh",
) {
  return {
    async createCollection(req: CreateCollectionRequest): Promise<CollectionResponse> {
      const url = `${baseUrl}/v1/collections`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        let code = "unknown";
        try {
          const body = await res.json() as { error?: { code: string; message: string } };
          if (body.error) { msg = body.error.message; code = body.error.code; }
        } catch {}
        throw new Error(`${msg} (${code})`);
      }
      return res.json() as Promise<CollectionResponse>;
    },
    async listCollections(params: ListCollectionsParams): Promise<ListCollectionsResponse> {
      const qs = new URLSearchParams();
      if (params.limit !== undefined) qs.set("limit", String(params.limit));
      if (params.after !== undefined) qs.set("after", String(params.after));
      const query = qs.toString();
      const url = `${baseUrl}/v1/collections${query ? `?${query}` : ""}`;
      const res = await primFetch(url);
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        let code = "unknown";
        try {
          const body = await res.json() as { error?: { code: string; message: string } };
          if (body.error) { msg = body.error.message; code = body.error.code; }
        } catch {}
        throw new Error(`${msg} (${code})`);
      }
      return res.json() as Promise<ListCollectionsResponse>;
    },
    async getCollection(params: GetCollectionParams): Promise<CollectionResponse> {
      const url = `${baseUrl}/v1/collections/${encodeURIComponent(params.id)}`;
      const res = await primFetch(url);
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        let code = "unknown";
        try {
          const body = await res.json() as { error?: { code: string; message: string } };
          if (body.error) { msg = body.error.message; code = body.error.code; }
        } catch {}
        throw new Error(`${msg} (${code})`);
      }
      return res.json() as Promise<CollectionResponse>;
    },
    async deleteCollection(params: DeleteCollectionParams): Promise<DeleteCollectionResponse> {
      const url = `${baseUrl}/v1/collections/${encodeURIComponent(params.id)}`;
      const res = await primFetch(url, {
        method: "DELETE",
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        let code = "unknown";
        try {
          const body = await res.json() as { error?: { code: string; message: string } };
          if (body.error) { msg = body.error.message; code = body.error.code; }
        } catch {}
        throw new Error(`${msg} (${code})`);
      }
      return res.json() as Promise<DeleteCollectionResponse>;
    },
    async upsertDocuments(params: UpsertDocumentsParams, req: UpsertRequest): Promise<UpsertResponse> {
      const url = `${baseUrl}/v1/collections/${encodeURIComponent(params.id)}/upsert`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        let code = "unknown";
        try {
          const body = await res.json() as { error?: { code: string; message: string } };
          if (body.error) { msg = body.error.message; code = body.error.code; }
        } catch {}
        throw new Error(`${msg} (${code})`);
      }
      return res.json() as Promise<UpsertResponse>;
    },
    async queryCollection(params: QueryCollectionParams, req: QueryRequest): Promise<QueryResponse> {
      const url = `${baseUrl}/v1/collections/${encodeURIComponent(params.id)}/query`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        let code = "unknown";
        try {
          const body = await res.json() as { error?: { code: string; message: string } };
          if (body.error) { msg = body.error.message; code = body.error.code; }
        } catch {}
        throw new Error(`${msg} (${code})`);
      }
      return res.json() as Promise<QueryResponse>;
    },
    async setCache(params: SetCacheParams, req: SetCacheRequest): Promise<SetCacheResponse> {
      const url = `${baseUrl}/v1/cache/${encodeURIComponent(params.namespace)}/${encodeURIComponent(params.key)}`;
      const res = await primFetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        let code = "unknown";
        try {
          const body = await res.json() as { error?: { code: string; message: string } };
          if (body.error) { msg = body.error.message; code = body.error.code; }
        } catch {}
        throw new Error(`${msg} (${code})`);
      }
      return res.json() as Promise<SetCacheResponse>;
    },
    async getCache(params: GetCacheParams): Promise<GetCacheResponse> {
      const url = `${baseUrl}/v1/cache/${encodeURIComponent(params.namespace)}/${encodeURIComponent(params.key)}`;
      const res = await primFetch(url);
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        let code = "unknown";
        try {
          const body = await res.json() as { error?: { code: string; message: string } };
          if (body.error) { msg = body.error.message; code = body.error.code; }
        } catch {}
        throw new Error(`${msg} (${code})`);
      }
      return res.json() as Promise<GetCacheResponse>;
    },
    async deleteCache(params: DeleteCacheParams): Promise<DeleteCacheResponse> {
      const url = `${baseUrl}/v1/cache/${encodeURIComponent(params.namespace)}/${encodeURIComponent(params.key)}`;
      const res = await primFetch(url, {
        method: "DELETE",
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        let code = "unknown";
        try {
          const body = await res.json() as { error?: { code: string; message: string } };
          if (body.error) { msg = body.error.message; code = body.error.code; }
        } catch {}
        throw new Error(`${msg} (${code})`);
      }
      return res.json() as Promise<DeleteCacheResponse>;
    },
  };
}
