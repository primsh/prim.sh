/**
 * mem.sh API contract — request/response types and error envelope.
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
  "qdrant_error",
  "embedding_error",
  "rate_limited",
  "collection_name_taken",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

// ─── Collection types ─────────────────────────────────────────────────────

export interface CollectionResponse {
  id: string;
  name: string;
  owner_wallet: string;
  dimension: number;
  distance: string;
  /** Live Qdrant points_count — null in list responses to avoid N+1 calls. */
  document_count: number | null;
  created_at: string;
}

export interface CreateCollectionRequest {
  name: string;
  distance?: "Cosine" | "Euclid" | "Dot";
  dimension?: number;
}

export interface CollectionListResponse {
  collections: CollectionResponse[];
  meta: {
    page: number;
    per_page: number;
    total: number;
  };
}

// ─── Vector types ─────────────────────────────────────────────────────────

export interface UpsertDocument {
  /** Must be UUID v4 if provided; omit to auto-generate. */
  id?: string;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface UpsertRequest {
  documents: UpsertDocument[];
}

export interface UpsertResponse {
  upserted: number;
  ids: string[];
}

export interface QueryRequest {
  text: string;
  top_k?: number;
  /** Qdrant-native filter passthrough. */
  filter?: unknown;
}

export interface QueryMatch {
  id: string;
  score: number;
  text: string;
  metadata: Record<string, unknown>;
}

export interface QueryResponse {
  matches: QueryMatch[];
}

// ─── Cache types ──────────────────────────────────────────────────────────

export interface CacheSetRequest {
  value: unknown;
  /** TTL in seconds. Omit or null for permanent. */
  ttl?: number | null;
}

export interface CacheGetResponse {
  namespace: string;
  key: string;
  value: unknown;
  /** ISO string or null if permanent. */
  expires_at: string | null;
}
