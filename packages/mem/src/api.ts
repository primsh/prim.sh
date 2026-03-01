/**
 * mem.sh API contract — request/response types and error envelope.
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
  "qdrant_error",
  "embedding_error",
  "rate_limited",
  "collection_name_taken",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

// ─── Collection types ─────────────────────────────────────────────────────

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

// ─── Vector types ─────────────────────────────────────────────────────────

export interface UpsertDocument {
  /** Must be UUID v4 if provided; omit to auto-generate. */
  id?: string;
  /** Document text to embed and store. */
  text: string;
  /** Arbitrary JSON metadata to store alongside the vector. */
  metadata?: Record<string, unknown>;
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

export interface QueryRequest {
  /** Query text to embed and search against. */
  text: string;
  /** Number of nearest neighbors to return. Default 10. */
  top_k?: number;
  /** Qdrant-native filter passthrough. */
  filter?: unknown;
}

export interface QueryMatch {
  /** Document ID. */
  id: string;
  /** Similarity score (higher = more similar). */
  score: number;
  /** Original document text. */
  text: string;
  /** Document metadata. */
  metadata: Record<string, unknown>;
}

export interface QueryResponse {
  /** Nearest neighbor matches, ordered by descending score. */
  matches: QueryMatch[];
}

// ─── Cache types ──────────────────────────────────────────────────────────

export interface SetCacheRequest {
  /** Value to store. Any JSON-serializable value. */
  value: unknown;
  /** TTL in seconds. Omit or null for permanent. */
  ttl?: number | null;
}

export interface GetCacheResponse {
  /** Cache namespace (collection name). */
  namespace: string;
  /** Cache key. */
  key: string;
  /** Stored value. */
  value: unknown;
  /** ISO string expiry time, or null if permanent. */
  expires_at: string | null;
}
