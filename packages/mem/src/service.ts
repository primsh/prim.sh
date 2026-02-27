import { createHash, randomBytes } from "node:crypto";
import {
  insertCollection,
  getCollectionById,
  getCollectionByOwnerAndName,
  getCollectionsByOwner,
  countCollectionsByOwner,
  deleteCollectionRow,
  upsertCacheEntry,
  getCacheEntry,
  deleteCacheEntry,
  deleteExpiredEntries,
} from "./db.ts";
import type { CollectionRow, CacheEntryRow } from "./db.ts";
import {
  QdrantError,
  createCollection as qdrantCreateCollection,
  deleteCollection as qdrantDeleteCollection,
  getCollectionInfo,
  upsertPoints,
  queryPoints,
} from "./qdrant.ts";
import { getEmbeddingProvider, EmbeddingError } from "./embeddings.ts";
import type {
  CollectionResponse,
  CollectionListResponse,
  CreateCollectionRequest,
  UpsertRequest,
  UpsertResponse,
  QueryRequest,
  QueryResponse,
  SetCacheRequest,
  GetCacheResponse,
} from "./api.ts";

// ─── ServiceResult ────────────────────────────────────────────────────────

type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string };

// ─── Validation ───────────────────────────────────────────────────────────

const COLLECTION_NAME_RE = /^[a-z0-9][a-z0-9_-]*$/;

export function isValidCollectionName(name: string): boolean {
  if (!name || name.length < 1 || name.length > 128) return false;
  return COLLECTION_NAME_RE.test(name);
}

const CACHE_NAMESPACE_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

export function isValidCacheNamespace(ns: string): boolean {
  if (!ns || ns.length < 1 || ns.length > 128) return false;
  return CACHE_NAMESPACE_RE.test(ns);
}

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuidV4(id: string): boolean {
  return UUID_V4_RE.test(id);
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Prefix Qdrant collection names to isolate wallets. */
function qdrantCollectionName(ownerWallet: string, collectionName: string): string {
  const prefix = createHash("sha256").update(ownerWallet).digest("hex").slice(0, 8);
  return `${prefix}_${collectionName}`;
}

function generateId(): string {
  return `c_${randomBytes(4).toString("hex")}`;
}

function rowToCollectionResponse(row: CollectionRow, documentCount: number | null): CollectionResponse {
  return {
    id: row.id,
    name: row.name,
    owner_wallet: row.owner_wallet,
    dimension: row.dimension,
    distance: row.distance,
    document_count: documentCount,
    created_at: new Date(row.created_at).toISOString(),
  };
}

function rowToGetCacheResponse(row: CacheEntryRow): GetCacheResponse {
  return {
    namespace: row.namespace,
    key: row.key,
    value: JSON.parse(row.value),
    expires_at: row.expires_at !== null ? new Date(row.expires_at).toISOString() : null,
  };
}

// ─── Ownership ────────────────────────────────────────────────────────────

type CollectionCheck =
  | { ok: true; row: CollectionRow }
  | { ok: false; status: 403 | 404; code: string; message: string };

function checkCollectionOwnership(collectionId: string, caller: string): CollectionCheck {
  const row = getCollectionById(collectionId);
  if (!row) {
    return { ok: false, status: 404, code: "not_found", message: "Collection not found" };
  }
  if (row.owner_wallet !== caller) {
    return { ok: false, status: 403, code: "forbidden", message: "Forbidden" };
  }
  return { ok: true, row };
}

// ─── Collection service ───────────────────────────────────────────────────

export async function createCollection(
  request: CreateCollectionRequest,
  callerWallet: string,
): Promise<ServiceResult<CollectionResponse>> {
  if (!isValidCollectionName(request.name)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Invalid collection name. Must be 1-128 chars, alphanumeric/hyphens/underscores, start with alphanumeric.",
    };
  }

  const existing = getCollectionByOwnerAndName(callerWallet, request.name);
  if (existing) {
    return {
      ok: false,
      status: 409,
      code: "collection_name_taken",
      message: "Collection name already in use",
    };
  }

  const dimension = request.dimension ?? 768;
  const distance = request.distance ?? "Cosine";
  const qdrantName = qdrantCollectionName(callerWallet, request.name);

  try {
    await qdrantCreateCollection(qdrantName, { size: dimension, distance });
  } catch (err) {
    if (err instanceof QdrantError) {
      return { ok: false, status: err.statusCode, code: err.code, message: err.message };
    }
    throw err;
  }

  const id = generateId();
  insertCollection({
    id,
    name: request.name,
    owner_wallet: callerWallet,
    qdrant_collection: qdrantName,
    dimension,
    distance,
  });

  const row = getCollectionById(id);
  if (!row) throw new Error("Failed to retrieve collection after insert");

  return { ok: true, data: rowToCollectionResponse(row, null) };
}

export function listCollections(
  callerWallet: string,
  limit: number,
  page: number,
): CollectionListResponse {
  const offset = (page - 1) * limit;
  const rows = getCollectionsByOwner(callerWallet, limit, offset);
  const total = countCollectionsByOwner(callerWallet);

  return {
    data: rows.map((r) => rowToCollectionResponse(r, null)),
    pagination: {
      total,
      page,
      per_page: limit,
      cursor: null,
      has_more: offset + rows.length < total,
    },
  };
}

export async function getCollection(
  id: string,
  callerWallet: string,
): Promise<ServiceResult<CollectionResponse>> {
  const check = checkCollectionOwnership(id, callerWallet);
  if (!check.ok) return check;

  // Fetch live document count — degrade gracefully on Qdrant error
  let documentCount: number | null = null;
  try {
    const info = await getCollectionInfo(check.row.qdrant_collection);
    documentCount = info.points_count;
  } catch {
    // Qdrant info failure → document_count stays null
  }

  return { ok: true, data: rowToCollectionResponse(check.row, documentCount) };
}

export async function deleteCollection(
  id: string,
  callerWallet: string,
): Promise<ServiceResult<{ status: "deleted" }>> {
  const check = checkCollectionOwnership(id, callerWallet);
  if (!check.ok) return check;

  try {
    await qdrantDeleteCollection(check.row.qdrant_collection);
  } catch (err) {
    if (err instanceof QdrantError) {
      return { ok: false, status: err.statusCode, code: err.code, message: err.message };
    }
    throw err;
  }

  deleteCollectionRow(id);
  return { ok: true, data: { status: "deleted" } };
}

// ─── Vector service ───────────────────────────────────────────────────────

const MAX_UPSERT_DOCS = 100;
const DEFAULT_TOP_K = 10;
const MAX_TOP_K = 100;

export async function upsertDocuments(
  collectionId: string,
  request: UpsertRequest,
  callerWallet: string,
): Promise<ServiceResult<UpsertResponse>> {
  const check = checkCollectionOwnership(collectionId, callerWallet);
  if (!check.ok) return check;

  if (!request.documents || request.documents.length === 0) {
    return { ok: false, status: 400, code: "invalid_request", message: "documents array must not be empty" };
  }

  if (request.documents.length > MAX_UPSERT_DOCS) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: `Maximum ${MAX_UPSERT_DOCS} documents per upsert call`,
    };
  }

  // Validate provided IDs
  for (const doc of request.documents) {
    if (doc.id !== undefined && !isValidUuidV4(doc.id)) {
      return {
        ok: false,
        status: 400,
        code: "invalid_request",
        message: `Document id "${doc.id}" is not a valid UUID v4`,
      };
    }
  }

  const texts = request.documents.map((d) => d.text);
  let vectors: number[][];

  try {
    const provider = getEmbeddingProvider();
    vectors = await provider.embedDocuments(texts);
  } catch (err) {
    if (err instanceof EmbeddingError) {
      return { ok: false, status: 502, code: "embedding_error", message: err.message };
    }
    throw err;
  }

  const ids = request.documents.map((doc) => doc.id ?? crypto.randomUUID());
  const points = request.documents.map((doc, i) => {
    const payload: Record<string, unknown> = { text: doc.text };
    if (doc.metadata) {
      for (const [k, v] of Object.entries(doc.metadata)) {
        if (k !== "text") payload[k] = v;
      }
    }
    return { id: ids[i], vector: vectors[i], payload };
  });

  try {
    await upsertPoints(check.row.qdrant_collection, points);
  } catch (err) {
    if (err instanceof QdrantError) {
      return { ok: false, status: err.statusCode, code: err.code, message: err.message };
    }
    throw err;
  }

  return { ok: true, data: { upserted: ids.length, ids } };
}

export async function queryDocuments(
  collectionId: string,
  request: QueryRequest,
  callerWallet: string,
): Promise<ServiceResult<QueryResponse>> {
  const check = checkCollectionOwnership(collectionId, callerWallet);
  if (!check.ok) return check;

  const topK = Math.min(request.top_k ?? DEFAULT_TOP_K, MAX_TOP_K);

  let vector: number[];
  try {
    const provider = getEmbeddingProvider();
    vector = await provider.embedQuery(request.text);
  } catch (err) {
    if (err instanceof EmbeddingError) {
      return { ok: false, status: 502, code: "embedding_error", message: err.message };
    }
    throw err;
  }

  let results: Awaited<ReturnType<typeof queryPoints>>;
  try {
    results = await queryPoints(check.row.qdrant_collection, vector, topK, request.filter);
  } catch (err) {
    if (err instanceof QdrantError) {
      return { ok: false, status: err.statusCode, code: err.code, message: err.message };
    }
    throw err;
  }

  const matches = results.map((r) => {
    const { text, ...rest } = r.payload;
    return {
      id: String(r.id),
      score: r.score,
      text: String(text ?? ""),
      metadata: rest as Record<string, unknown>,
    };
  });

  return { ok: true, data: { matches } };
}

// ─── Cache service ────────────────────────────────────────────────────────

export function cacheSet(
  namespace: string,
  key: string,
  request: SetCacheRequest,
  callerWallet: string,
): ServiceResult<GetCacheResponse> {
  if (!isValidCacheNamespace(namespace)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Invalid namespace. Must be 1-128 chars, alphanumeric/hyphens/underscores, start with alphanumeric.",
    };
  }

  if (!key || key.length < 1 || key.length > 512) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Key must be 1-512 characters",
    };
  }

  const expiresAt =
    request.ttl !== undefined && request.ttl !== null
      ? Date.now() + request.ttl * 1000
      : null;

  upsertCacheEntry({
    namespace,
    key,
    value: JSON.stringify(request.value),
    owner_wallet: callerWallet,
    expires_at: expiresAt,
  });

  const row = getCacheEntry(callerWallet, namespace, key);
  if (!row) throw new Error("Failed to retrieve cache entry after insert");

  // Opportunistic expired-entry cleanup (~10% of writes)
  // Runs after read-back to avoid deleting the entry we just inserted (ttl=0 edge case)
  if (Math.random() < 0.1) {
    deleteExpiredEntries(Date.now());
  }

  return { ok: true, data: rowToGetCacheResponse(row) };
}

export function cacheGet(
  namespace: string,
  key: string,
  callerWallet: string,
): ServiceResult<GetCacheResponse> {
  const row = getCacheEntry(callerWallet, namespace, key);

  if (!row) {
    return { ok: false, status: 404, code: "not_found", message: "Cache key not found" };
  }

  // TTL expiry check
  if (row.expires_at !== null && row.expires_at < Date.now()) {
    deleteCacheEntry(callerWallet, namespace, key);
    return { ok: false, status: 404, code: "not_found", message: "Cache key not found" };
  }

  return { ok: true, data: rowToGetCacheResponse(row) };
}

export function cacheDelete(
  namespace: string,
  key: string,
  callerWallet: string,
): ServiceResult<{ status: "deleted" }> {
  const row = getCacheEntry(callerWallet, namespace, key);
  if (!row) {
    return { ok: false, status: 404, code: "not_found", message: "Cache key not found" };
  }

  deleteCacheEntry(callerWallet, namespace, key);
  return { ok: true, data: { status: "deleted" } };
}
