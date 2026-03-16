// SPDX-License-Identifier: Apache-2.0
/**
 * mem.sh API contract — Zod schemas, inferred types, and error envelope.
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
  "qdrant_error",
  "embedding_error",
  "rate_limited",
  "collection_name_taken",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

// ─── Collection types ─────────────────────────────────────────────────────

export const GetCollectionResponseSchema = z.object({
  id: z.string().describe("Collection ID (UUID)."),
  name: z.string().describe("Collection name. Unique per wallet."),
  owner_wallet: z.string().describe("Ethereum address of the collection owner."),
  dimension: z
    .number()
    .describe("Embedding vector dimension (e.g. 1536 for text-embedding-3-small)."),
  distance: z.string().describe('Distance metric: "Cosine" | "Euclid" | "Dot".'),
  document_count: z
    .number()
    .nullable()
    .describe("Live Qdrant points_count — null in list responses to avoid N+1 calls."),
  created_at: z.string().describe("ISO 8601 timestamp when the collection was created."),
});
export type GetCollectionResponse = z.infer<typeof GetCollectionResponseSchema>;

export const CreateCollectionRequestSchema = z.object({
  name: z.string().describe("Collection name. Unique per wallet."),
  distance: z
    .enum(["Cosine", "Euclid", "Dot"])
    .optional()
    .describe('Distance metric for similarity search. Default "Cosine".'),
  dimension: z
    .number()
    .optional()
    .describe("Vector dimension. Must match the embedding model used. Default 1536."),
});
export type CreateCollectionRequest = z.infer<typeof CreateCollectionRequestSchema>;

// ─── Vector types ─────────────────────────────────────────────────────────

export const UpsertDocumentSchema = z.object({
  id: z.string().optional().describe("Must be UUID v4 if provided; omit to auto-generate."),
  text: z.string().describe("Document text to embed and store."),
  metadata: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Arbitrary JSON metadata to store alongside the vector."),
});
export type UpsertDocument = z.infer<typeof UpsertDocumentSchema>;

export const UpsertRequestSchema = z.object({
  documents: z
    .array(UpsertDocumentSchema)
    .describe("Documents to upsert. Existing IDs are overwritten."),
});
export type UpsertRequest = z.infer<typeof UpsertRequestSchema>;

export const UpsertResponseSchema = z.object({
  upserted: z.number().describe("Number of documents upserted."),
  ids: z
    .array(z.string())
    .describe("IDs of upserted documents (auto-generated UUIDs if not provided)."),
});
export type UpsertResponse = z.infer<typeof UpsertResponseSchema>;

export const QueryRequestSchema = z.object({
  text: z.string().describe("Query text to embed and search against."),
  top_k: z.number().optional().describe("Number of nearest neighbors to return. Default 10."),
  filter: z.unknown().optional().describe("Qdrant-native filter passthrough."),
});
export type QueryRequest = z.infer<typeof QueryRequestSchema>;

export const QueryMatchSchema = z.object({
  id: z.string().describe("Document ID."),
  score: z.number().describe("Similarity score (higher = more similar)."),
  text: z.string().describe("Original document text."),
  metadata: z.record(z.string(), z.unknown()).describe("Document metadata."),
});
export type QueryMatch = z.infer<typeof QueryMatchSchema>;

export const QueryResponseSchema = z.object({
  matches: z
    .array(QueryMatchSchema)
    .describe("Nearest neighbor matches, ordered by descending score."),
});
export type QueryResponse = z.infer<typeof QueryResponseSchema>;

// ─── Cache types ──────────────────────────────────────────────────────────

export const SetCacheRequestSchema = z.object({
  value: z.unknown().describe("Value to store. Any JSON-serializable value."),
  ttl: z.number().nullable().optional().describe("TTL in seconds. Omit or null for permanent."),
});
export type SetCacheRequest = z.infer<typeof SetCacheRequestSchema>;

export const GetCacheResponseSchema = z.object({
  namespace: z.string().describe("Cache namespace (collection name)."),
  key: z.string().describe("Cache key."),
  value: z.unknown().describe("Stored value."),
  expires_at: z.string().nullable().describe("ISO string expiry time, or null if permanent."),
});
export type GetCacheResponse = z.infer<typeof GetCacheResponseSchema>;
