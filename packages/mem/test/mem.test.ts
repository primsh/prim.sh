/**
 * M-1 mem.sh tests: collection CRUD, vector upsert/query, KV cache.
 *
 * Tests the service layer directly. x402 middleware tested separately.
 * IMPORTANT: env vars must be set before any module import that touches db/embeddings.
 */

// Set env before imports
process.env.MEM_DB_PATH = ":memory:";
process.env.GOOGLE_API_KEY = "test-google-key";
process.env.QDRANT_URL = "http://localhost:6333";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteExpiredEntries, getCacheEntry, resetDb } from "../src/db.ts";
import { resetEmbeddingProvider } from "../src/embeddings.ts";
import {
  cacheDelete,
  cacheGet,
  cacheSet,
  createCollection,
  deleteCollection,
  getCollection,
  isValidCacheNamespace,
  isValidCollectionName,
  isValidUuidV4,
  listCollections,
  queryDocuments,
  upsertDocuments,
} from "../src/service.ts";

// ─── Mock fetch helpers ───────────────────────────────────────────────────

function makeEmbedding(size = 768): number[] {
  return Array.from({ length: size }, (_, i) => (i + 1) / 1000);
}

function googleEmbedResponse(count = 1, size = 768): Response {
  return new Response(
    JSON.stringify({
      embeddings: Array.from({ length: count }, () => ({ values: makeEmbedding(size) })),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function qdrantOkResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function qdrantErrorResponse(status: number, message = "error"): Response {
  return new Response(JSON.stringify({ status: "error", error: message }), { status });
}

/** Default mock: handles all success cases for Qdrant + Google. */
const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();

  // Google batchEmbedContents
  if (url.includes("generativelanguage.googleapis.com") && url.includes("batchEmbedContents")) {
    let count = 1;
    try {
      const body = JSON.parse(init?.body as string) as { requests: unknown[] };
      count = body.requests.length;
    } catch {
      /* use default */
    }
    return googleEmbedResponse(count);
  }

  // Qdrant: PUT /collections/{name} — create
  if (url.match(/\/collections\/[^/]+$/) && method === "PUT") {
    return qdrantOkResponse({ result: true, status: "ok", time: 0 });
  }

  // Qdrant: DELETE /collections/{name} — delete
  if (url.match(/\/collections\/[^/]+$/) && method === "DELETE") {
    return qdrantOkResponse({ result: true, status: "ok", time: 0 });
  }

  // Qdrant: GET /collections/{name} — info
  if (url.match(/\/collections\/[^/]+$/) && method === "GET") {
    return qdrantOkResponse({
      result: { points_count: 5, vectors_count: 5, status: "green" },
      status: "ok",
      time: 0,
    });
  }

  // Qdrant: PUT /collections/{name}/points — upsert
  if (url.match(/\/collections\/[^/]+\/points$/) && method === "PUT") {
    return qdrantOkResponse({
      result: { operation_id: 0, status: "completed" },
      status: "ok",
      time: 0,
    });
  }

  // Qdrant: POST /collections/{name}/points/query — query
  if (url.match(/\/collections\/[^/]+\/points\/query$/) && method === "POST") {
    return qdrantOkResponse({
      result: {
        points: [
          {
            id: "a1b2c3d4-e5f6-4789-8901-234567890abc",
            score: 0.95,
            payload: { text: "hello world", source: "test" },
          },
        ],
      },
      status: "ok",
      time: 0,
    });
  }

  throw new Error(`Unexpected fetch call: ${method} ${url}`);
});

vi.stubGlobal("fetch", mockFetch);

const WALLET = "0xabc1230000000000000000000000000000000001";
const WALLET_B = "0xabc1230000000000000000000000000000000002";

beforeEach(() => {
  resetDb();
  resetEmbeddingProvider();
  mockFetch.mockClear();
});

// ─── isValidCollectionName ────────────────────────────────────────────────

describe("isValidCollectionName", () => {
  it("accepts alphanumeric name", () => {
    expect(isValidCollectionName("mycollection")).toBe(true);
  });

  it("accepts name with hyphens and underscores", () => {
    expect(isValidCollectionName("my-collection_v2")).toBe(true);
  });

  it("accepts single char", () => {
    expect(isValidCollectionName("a")).toBe(true);
  });

  it("accepts 128-char name", () => {
    expect(isValidCollectionName("a".repeat(128))).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isValidCollectionName("")).toBe(false);
  });

  it("rejects name longer than 128 chars", () => {
    expect(isValidCollectionName("a".repeat(129))).toBe(false);
  });

  it("rejects name starting with hyphen", () => {
    expect(isValidCollectionName("-bad")).toBe(false);
  });

  it("rejects name starting with underscore", () => {
    expect(isValidCollectionName("_bad")).toBe(false);
  });

  it("rejects name with spaces", () => {
    expect(isValidCollectionName("bad name")).toBe(false);
  });

  it("rejects name with special chars", () => {
    expect(isValidCollectionName("bad!name")).toBe(false);
  });

  it("rejects name with uppercase letters", () => {
    expect(isValidCollectionName("MyCollection")).toBe(false);
    expect(isValidCollectionName("myCollection")).toBe(false);
    expect(isValidCollectionName("MY_COLLECTION")).toBe(false);
  });
});

// ─── isValidCacheNamespace ────────────────────────────────────────────────

describe("isValidCacheNamespace", () => {
  it("accepts valid namespace", () => {
    expect(isValidCacheNamespace("session-1")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isValidCacheNamespace("")).toBe(false);
  });

  it("rejects namespace starting with hyphen", () => {
    expect(isValidCacheNamespace("-ns")).toBe(false);
  });

  it("rejects namespace over 128 chars", () => {
    expect(isValidCacheNamespace("a".repeat(129))).toBe(false);
  });
});

// ─── isValidUuidV4 ────────────────────────────────────────────────────────

describe("isValidUuidV4", () => {
  it("accepts valid UUID v4", () => {
    expect(isValidUuidV4("a1b2c3d4-e5f6-4789-8901-234567890abc")).toBe(true);
    expect(isValidUuidV4("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("rejects non-UUID string", () => {
    expect(isValidUuidV4("not-a-uuid")).toBe(false);
  });

  it("rejects UUID v1 (version digit = 1)", () => {
    expect(isValidUuidV4("550e8400-e29b-11d4-a716-446655440000")).toBe(false);
  });
});

// ─── Collection CRUD ──────────────────────────────────────────────────────

describe("createCollection", () => {
  it("creates collection with defaults", async () => {
    const result = await createCollection({ name: "my-docs" }, WALLET);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.name).toBe("my-docs");
    expect(result.data.owner_wallet).toBe(WALLET);
    expect(result.data.dimension).toBe(768);
    expect(result.data.distance).toBe("Cosine");
    expect(result.data.document_count).toBeNull();
    expect(result.data.id).toBeTruthy();
  });

  it("creates collection with custom dimension and distance", async () => {
    const result = await createCollection(
      { name: "custom", dimension: 1536, distance: "Dot" },
      WALLET,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.dimension).toBe(1536);
    expect(result.data.distance).toBe("Dot");
  });

  it("rejects invalid collection name", async () => {
    const result = await createCollection({ name: "!bad name" }, WALLET);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("invalid_request");
    expect(result.status).toBe(400);
  });

  it("rejects duplicate name for same owner", async () => {
    await createCollection({ name: "dup" }, WALLET);
    const result = await createCollection({ name: "dup" }, WALLET);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("collection_name_taken");
  });

  it("allows same name for different owner", async () => {
    await createCollection({ name: "shared-name" }, WALLET);
    const result = await createCollection({ name: "shared-name" }, WALLET_B);
    expect(result.ok).toBe(true);
  });

  it("propagates Qdrant error", async () => {
    mockFetch.mockResolvedValueOnce(qdrantErrorResponse(503, "Qdrant unavailable"));
    const result = await createCollection({ name: "bad" }, WALLET);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("qdrant_error");
  });

  it("calls Qdrant createCollection with correct params", async () => {
    await createCollection({ name: "test-col", dimension: 512, distance: "Euclid" }, WALLET);
    const call = mockFetch.mock.calls.find(
      ([url, init]: [URL | RequestInfo, RequestInit?]) =>
        typeof url === "string" &&
        url.includes("/collections/") &&
        (init as RequestInit)?.method === "PUT",
    );
    expect(call).toBeTruthy();
    const body = JSON.parse((call?.[1] as RequestInit)?.body as string);
    expect(body.vectors.size).toBe(512);
    expect(body.vectors.distance).toBe("Euclid");
  });
});

describe("listCollections", () => {
  it("returns empty list when no collections", () => {
    const result = listCollections(WALLET, 20, 1);
    expect(result.data).toHaveLength(0);
    expect(result.pagination.total).toBe(0);
  });

  it("lists owned collections", async () => {
    await createCollection({ name: "col-a" }, WALLET);
    await createCollection({ name: "col-b" }, WALLET);
    const result = listCollections(WALLET, 20, 1);
    expect(result.data).toHaveLength(2);
    expect(result.pagination.total).toBe(2);
  });

  it("excludes other wallet collections", async () => {
    await createCollection({ name: "col-other" }, WALLET_B);
    const result = listCollections(WALLET, 20, 1);
    expect(result.data).toHaveLength(0);
  });

  it("paginates correctly", async () => {
    for (let i = 0; i < 5; i++) {
      await createCollection({ name: `col-${i}` }, WALLET);
    }
    const page1 = listCollections(WALLET, 2, 1);
    const page2 = listCollections(WALLET, 2, 2);
    expect(page1.data).toHaveLength(2);
    expect(page2.data).toHaveLength(2);
    expect(page1.pagination.total).toBe(5);
  });

  it("sets document_count to null for all list entries", async () => {
    await createCollection({ name: "listed" }, WALLET);
    const result = listCollections(WALLET, 20, 1);
    expect(result.data[0].document_count).toBeNull();
  });
});

describe("getCollection", () => {
  it("returns collection with live document_count", async () => {
    const created = await createCollection({ name: "my-col" }, WALLET);
    if (!created.ok) throw new Error("setup failed");
    const result = await getCollection(created.data.id, WALLET);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.document_count).toBe(5); // from mockFetch GET /collections/...
  });

  it("returns not_found for unknown id", async () => {
    const result = await getCollection("c_unknown99", WALLET);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("not_found");
    expect(result.status).toBe(404);
  });

  it("returns forbidden for wrong owner", async () => {
    const created = await createCollection({ name: "owned" }, WALLET);
    if (!created.ok) throw new Error("setup failed");
    const result = await getCollection(created.data.id, WALLET_B);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("forbidden");
    expect(result.status).toBe(403);
  });

  it("returns null document_count when Qdrant info fails", async () => {
    const created = await createCollection({ name: "qdrant-fail" }, WALLET);
    if (!created.ok) throw new Error("setup failed");
    // Next call is GET /collections/{name} for document_count — make it fail
    mockFetch.mockResolvedValueOnce(qdrantErrorResponse(404, "not found"));
    const result = await getCollection(created.data.id, WALLET);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.document_count).toBeNull();
  });
});

describe("deleteCollection", () => {
  it("deletes collection successfully", async () => {
    const created = await createCollection({ name: "to-delete" }, WALLET);
    if (!created.ok) throw new Error("setup failed");
    const result = await deleteCollection(created.data.id, WALLET);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe("deleted");
  });

  it("removes collection from list after delete", async () => {
    const created = await createCollection({ name: "gone" }, WALLET);
    if (!created.ok) throw new Error("setup failed");
    await deleteCollection(created.data.id, WALLET);
    const list = listCollections(WALLET, 20, 1);
    expect(list.data).toHaveLength(0);
  });

  it("returns not_found for unknown id", async () => {
    const result = await deleteCollection("c_unknown99", WALLET);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("not_found");
  });

  it("returns forbidden for wrong owner", async () => {
    const created = await createCollection({ name: "protect" }, WALLET);
    if (!created.ok) throw new Error("setup failed");
    const result = await deleteCollection(created.data.id, WALLET_B);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("forbidden");
  });

  it("propagates Qdrant error", async () => {
    const created = await createCollection({ name: "qdrant-err-del" }, WALLET);
    if (!created.ok) throw new Error("setup failed");
    // Next Qdrant call is DELETE
    mockFetch.mockResolvedValueOnce(qdrantErrorResponse(503, "unavailable"));
    const result = await deleteCollection(created.data.id, WALLET);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("qdrant_error");
  });
});

// ─── Upsert ───────────────────────────────────────────────────────────────

describe("upsertDocuments", () => {
  async function makeCollection(name = "test-upsert"): Promise<string> {
    const r = await createCollection({ name }, WALLET);
    if (!r.ok) throw new Error("setup failed");
    return r.data.id;
  }

  it("upserts single document without id", async () => {
    const id = await makeCollection();
    const result = await upsertDocuments(id, { documents: [{ text: "hello world" }] }, WALLET);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.upserted).toBe(1);
    expect(result.data.ids).toHaveLength(1);
    expect(isValidUuidV4(result.data.ids[0])).toBe(true);
  });

  it("upserts single document with valid UUID id", async () => {
    const id = await makeCollection();
    const docId = "a1b2c3d4-e5f6-4789-8901-234567890abc";
    const result = await upsertDocuments(
      id,
      { documents: [{ id: docId, text: "explicit id" }] },
      WALLET,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.ids[0]).toBe(docId);
  });

  it("upserts batch of documents", async () => {
    const id = await makeCollection();
    // Mock multiple embeddings
    mockFetch.mockResolvedValueOnce(googleEmbedResponse(3));
    mockFetch.mockResolvedValueOnce(
      qdrantOkResponse({ result: { operation_id: 0, status: "completed" }, status: "ok" }),
    );
    const result = await upsertDocuments(
      id,
      { documents: [{ text: "a" }, { text: "b" }, { text: "c" }] },
      WALLET,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.upserted).toBe(3);
    expect(result.data.ids).toHaveLength(3);
  });

  it("upserts document with metadata", async () => {
    const id = await makeCollection();
    const result = await upsertDocuments(
      id,
      { documents: [{ text: "with meta", metadata: { source: "test", score: 42 } }] },
      WALLET,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Verify Qdrant upsert was called with payload containing metadata
    const upsertCall = mockFetch.mock.calls.find(
      ([url, init]: [URL | RequestInfo, RequestInit?]) =>
        typeof url === "string" &&
        url.includes("/points") &&
        !url.includes("/query") &&
        (init as RequestInit)?.method === "PUT",
    );
    const body = JSON.parse((upsertCall?.[1] as RequestInit)?.body as string);
    expect(body.points[0].payload.source).toBe("test");
    expect(body.points[0].payload.score).toBe(42);
    expect(body.points[0].payload.text).toBe("with meta");
  });

  it("rejects document with non-UUID id", async () => {
    const id = await makeCollection();
    const result = await upsertDocuments(
      id,
      { documents: [{ id: "not-a-uuid", text: "x" }] },
      WALLET,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("invalid_request");
  });

  it("rejects when documents exceed 100", async () => {
    const id = await makeCollection();
    const docs = Array.from({ length: 101 }, (_, i) => ({ text: `doc ${i}` }));
    const result = await upsertDocuments(id, { documents: docs }, WALLET);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("invalid_request");
  });

  it("rejects empty documents array", async () => {
    const id = await makeCollection();
    const result = await upsertDocuments(id, { documents: [] }, WALLET);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("invalid_request");
  });

  it("returns not_found for unknown collection", async () => {
    const result = await upsertDocuments("c_unknown", { documents: [{ text: "x" }] }, WALLET);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("not_found");
  });

  it("returns forbidden for wrong owner", async () => {
    const id = await makeCollection("owned-col");
    const result = await upsertDocuments(id, { documents: [{ text: "x" }] }, WALLET_B);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("forbidden");
  });

  it("returns embedding_error on Google 429", async () => {
    const id = await makeCollection();
    // First: Qdrant create was already done. Override next fetch = Google embed call
    mockFetch.mockResolvedValueOnce(new Response("rate limited", { status: 429 }));
    const result = await upsertDocuments(id, { documents: [{ text: "x" }] }, WALLET);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("embedding_error");
  });

  it("returns embedding_error on malformed Google response", async () => {
    const id = await makeCollection();
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ unexpected: "shape" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const result = await upsertDocuments(id, { documents: [{ text: "x" }] }, WALLET);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("embedding_error");
  });

  it("propagates Qdrant upsert error", async () => {
    const id = await makeCollection();
    // embed succeeds, then Qdrant upsert fails
    mockFetch.mockResolvedValueOnce(googleEmbedResponse(1));
    mockFetch.mockResolvedValueOnce(qdrantErrorResponse(503));
    const result = await upsertDocuments(id, { documents: [{ text: "x" }] }, WALLET);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("qdrant_error");
  });

  it("does not include 'text' key from metadata in Qdrant payload twice", async () => {
    const id = await makeCollection();
    const result = await upsertDocuments(
      id,
      {
        documents: [{ text: "actual text", metadata: { text: "should be ignored", other: "ok" } }],
      },
      WALLET,
    );
    expect(result.ok).toBe(true);
    // The 'text' from metadata should be silently dropped (reserved key)
    const upsertCall = mockFetch.mock.calls.find(
      ([url, init]: [URL | RequestInfo, RequestInit?]) =>
        typeof url === "string" &&
        url.includes("/points") &&
        !url.includes("/query") &&
        (init as RequestInit)?.method === "PUT",
    );
    const body = JSON.parse((upsertCall?.[1] as RequestInit)?.body as string);
    expect(body.points[0].payload.text).toBe("actual text");
    expect(body.points[0].payload.other).toBe("ok");
  });
});

// ─── Query ────────────────────────────────────────────────────────────────

describe("queryDocuments", () => {
  async function makeCollection(name = "test-query"): Promise<string> {
    const r = await createCollection({ name }, WALLET);
    if (!r.ok) throw new Error("setup failed");
    return r.data.id;
  }

  it("returns matches from Qdrant", async () => {
    const id = await makeCollection();
    const result = await queryDocuments(id, { text: "hello" }, WALLET);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.matches).toHaveLength(1);
    expect(result.data.matches[0].score).toBe(0.95);
    expect(result.data.matches[0].text).toBe("hello world");
    expect(result.data.matches[0].metadata.source).toBe("test");
  });

  it("uses default top_k = 10", async () => {
    const id = await makeCollection();
    await queryDocuments(id, { text: "test" }, WALLET);
    const queryCall = mockFetch.mock.calls.find(
      ([url, init]: [URL | RequestInfo, RequestInit?]) =>
        typeof url === "string" &&
        url.includes("/points/query") &&
        (init as RequestInit)?.method === "POST",
    );
    const body = JSON.parse((queryCall?.[1] as RequestInit)?.body as string);
    expect(body.limit).toBe(10);
  });

  it("respects custom top_k", async () => {
    const id = await makeCollection();
    await queryDocuments(id, { text: "test", top_k: 25 }, WALLET);
    const queryCall = mockFetch.mock.calls.find(
      ([url, init]: [URL | RequestInfo, RequestInit?]) =>
        typeof url === "string" &&
        url.includes("/points/query") &&
        (init as RequestInit)?.method === "POST",
    );
    const body = JSON.parse((queryCall?.[1] as RequestInit)?.body as string);
    expect(body.limit).toBe(25);
  });

  it("clamps top_k to max 100", async () => {
    const id = await makeCollection();
    await queryDocuments(id, { text: "test", top_k: 999 }, WALLET);
    const queryCall = mockFetch.mock.calls.find(
      ([url, init]: [URL | RequestInfo, RequestInit?]) =>
        typeof url === "string" &&
        url.includes("/points/query") &&
        (init as RequestInit)?.method === "POST",
    );
    const body = JSON.parse((queryCall?.[1] as RequestInit)?.body as string);
    expect(body.limit).toBe(100);
  });

  it("passes filter to Qdrant", async () => {
    const id = await makeCollection();
    const filter = { must: [{ key: "source", match: { value: "chat" } }] };
    await queryDocuments(id, { text: "test", filter }, WALLET);
    const queryCall = mockFetch.mock.calls.find(
      ([url, init]: [URL | RequestInfo, RequestInit?]) =>
        typeof url === "string" &&
        url.includes("/points/query") &&
        (init as RequestInit)?.method === "POST",
    );
    const body = JSON.parse((queryCall?.[1] as RequestInit)?.body as string);
    expect(body.filter).toEqual(filter);
  });

  it("returns empty matches when Qdrant returns none", async () => {
    const id = await makeCollection();
    mockFetch.mockResolvedValueOnce(googleEmbedResponse(1));
    mockFetch.mockResolvedValueOnce(
      qdrantOkResponse({ result: { points: [] }, status: "ok", time: 0 }),
    );
    const result = await queryDocuments(id, { text: "nada" }, WALLET);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.matches).toHaveLength(0);
  });

  it("returns not_found for unknown collection", async () => {
    const result = await queryDocuments("c_unknown", { text: "x" }, WALLET);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("not_found");
  });

  it("returns forbidden for wrong owner", async () => {
    const id = await makeCollection("owned-query");
    const result = await queryDocuments(id, { text: "x" }, WALLET_B);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("forbidden");
  });

  it("returns embedding_error on Google 401", async () => {
    const id = await makeCollection();
    mockFetch.mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));
    const result = await queryDocuments(id, { text: "x" }, WALLET);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("embedding_error");
  });

  it("returns qdrant_error on Qdrant query failure", async () => {
    const id = await makeCollection();
    mockFetch.mockResolvedValueOnce(googleEmbedResponse(1));
    mockFetch.mockResolvedValueOnce(qdrantErrorResponse(503));
    const result = await queryDocuments(id, { text: "x" }, WALLET);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("qdrant_error");
  });
});

// ─── Qdrant error mapping ─────────────────────────────────────────────────

describe("Qdrant error mapping", () => {
  it("404 maps to not_found", async () => {
    mockFetch.mockResolvedValueOnce(qdrantErrorResponse(404));
    const result = await createCollection({ name: "qerr-404" }, WALLET);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("not_found");
  });

  it("409 maps to collection_name_taken", async () => {
    mockFetch.mockResolvedValueOnce(qdrantErrorResponse(409));
    const result = await createCollection({ name: "qerr-409" }, WALLET);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("collection_name_taken");
  });

  it("400 maps to invalid_request", async () => {
    mockFetch.mockResolvedValueOnce(qdrantErrorResponse(400));
    const result = await createCollection({ name: "qerr-400" }, WALLET);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("invalid_request");
  });

  it("429 maps to rate_limited", async () => {
    mockFetch.mockResolvedValueOnce(qdrantErrorResponse(429));
    const result = await createCollection({ name: "qerr-429" }, WALLET);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("rate_limited");
  });

  it("503 maps to qdrant_error", async () => {
    mockFetch.mockResolvedValueOnce(qdrantErrorResponse(503));
    const result = await createCollection({ name: "qerr-503" }, WALLET);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("qdrant_error");
  });
});

// ─── Cache set/get/delete ─────────────────────────────────────────────────

describe("cacheSet / cacheGet / cacheDelete", () => {
  it("sets and gets a string value without TTL", () => {
    const set = cacheSet("session", "token", { value: "abc123" }, WALLET);
    expect(set.ok).toBe(true);
    const get = cacheGet("session", "token", WALLET);
    expect(get.ok).toBe(true);
    if (!get.ok) return;
    expect(get.data.value).toBe("abc123");
    expect(get.data.expires_at).toBeNull();
  });

  it("sets and gets an object value (JSON round-trip)", () => {
    const val = { x: 1, nested: { y: true } };
    cacheSet("ns", "obj-key", { value: val }, WALLET);
    const get = cacheGet("ns", "obj-key", WALLET);
    expect(get.ok).toBe(true);
    if (!get.ok) return;
    expect(get.data.value).toEqual(val);
  });

  it("sets value with TTL, get returns expires_at", () => {
    const before = Date.now();
    cacheSet("ns", "ttl-key", { value: "v", ttl: 60 }, WALLET);
    const get = cacheGet("ns", "ttl-key", WALLET);
    expect(get.ok).toBe(true);
    if (!get.ok) return;
    const expiresAt = new Date(get.data.expires_at ?? "").getTime();
    expect(expiresAt).toBeGreaterThanOrEqual(before + 59_000);
    expect(expiresAt).toBeLessThanOrEqual(before + 61_000);
  });

  it("overwrites existing value (INSERT OR REPLACE)", () => {
    cacheSet("ns", "key", { value: "first" }, WALLET);
    cacheSet("ns", "key", { value: "second" }, WALLET);
    const get = cacheGet("ns", "key", WALLET);
    expect(get.ok).toBe(true);
    if (!get.ok) return;
    expect(get.data.value).toBe("second");
  });

  it("returns namespace and key in response", () => {
    cacheSet("my-ns", "my-key", { value: 42 }, WALLET);
    const get = cacheGet("my-ns", "my-key", WALLET);
    expect(get.ok).toBe(true);
    if (!get.ok) return;
    expect(get.data.namespace).toBe("my-ns");
    expect(get.data.key).toBe("my-key");
  });

  it("returns not_found for missing key", () => {
    const result = cacheGet("ns", "ghost", WALLET);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("not_found");
  });

  it("deletes existing key", () => {
    cacheSet("ns", "del-key", { value: "x" }, WALLET);
    const del = cacheDelete("ns", "del-key", WALLET);
    expect(del.ok).toBe(true);
    const get = cacheGet("ns", "del-key", WALLET);
    expect(get.ok).toBe(false);
  });

  it("returns not_found when deleting non-existent key", () => {
    const result = cacheDelete("ns", "ghost", WALLET);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("not_found");
  });

  it("rejects invalid namespace", () => {
    const result = cacheSet("!bad-ns", "key", { value: "x" }, WALLET);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("invalid_request");
  });

  it("rejects empty key", () => {
    const result = cacheSet("ns", "", { value: "x" }, WALLET);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("invalid_request");
  });

  it("rejects key over 512 chars", () => {
    const result = cacheSet("ns", "k".repeat(513), { value: "x" }, WALLET);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("invalid_request");
  });
});

// ─── Cache TTL ────────────────────────────────────────────────────────────

describe("Cache TTL behavior", () => {
  it("get before expiry returns value", () => {
    cacheSet("ns", "soon", { value: "ok", ttl: 3600 }, WALLET);
    const result = cacheGet("ns", "soon", WALLET);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.value).toBe("ok");
  });

  it("get after expiry returns 404 and deletes row", () => {
    // Insert with ttl:0 → expires_at ≈ Date.now()
    // Advance system time by overriding Date.now for the expiry check
    cacheSet("ns", "expired", { value: "bye", ttl: 0 }, WALLET);
    // Wait 2ms so expires_at < Date.now()
    const expires_at_approx = Date.now();
    // Directly check — at the moment of set, expires_at == Date.now() (not yet expired per `< now` check).
    // Wait at least 1ms to ensure expiry triggers
    const spin = Date.now() + 2;
    while (Date.now() < spin) {
      /* busy wait */
    }

    const result = cacheGet("ns", "expired", WALLET);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("not_found");
    // Row should be deleted from DB
    const row = getCacheEntry(WALLET, "ns", "expired");
    expect(row).toBeNull();
    void expires_at_approx; // suppress unused warning
  });

  it("null TTL is permanent (never expires)", () => {
    cacheSet("ns", "perm", { value: "forever", ttl: null }, WALLET);
    const result = cacheGet("ns", "perm", WALLET);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.expires_at).toBeNull();
  });

  it("omitted TTL is permanent", () => {
    cacheSet("ns", "perm2", { value: "also-forever" }, WALLET);
    const result = cacheGet("ns", "perm2", WALLET);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.expires_at).toBeNull();
  });

  it("deleteExpiredEntries cleans up expired rows", () => {
    cacheSet("ns", "will-expire", { value: "x", ttl: 0 }, WALLET);
    // Busy-wait 2ms
    const spin = Date.now() + 2;
    while (Date.now() < spin) {
      /* busy wait */
    }

    deleteExpiredEntries(Date.now());

    const row = getCacheEntry(WALLET, "ns", "will-expire");
    expect(row).toBeNull();
  });

  it("deleteExpiredEntries does not remove unexpired rows", () => {
    cacheSet("ns", "stays", { value: "x", ttl: 3600 }, WALLET);
    deleteExpiredEntries(Date.now());
    const row = getCacheEntry(WALLET, "ns", "stays");
    expect(row).not.toBeNull();
  });

  it("deleteExpiredEntries does not remove permanent rows", () => {
    cacheSet("ns", "perm-clean", { value: "x" }, WALLET);
    deleteExpiredEntries(Date.now() + 999_999_999);
    const row = getCacheEntry(WALLET, "ns", "perm-clean");
    expect(row).not.toBeNull();
  });

  it("opportunistic cleanup observable: expired entry is gone after cleanup", () => {
    // Insert an entry that will expire
    cacheSet("ns", "soon-gone", { value: "x", ttl: 0 }, WALLET);
    const spin = Date.now() + 2;
    while (Date.now() < spin) {
      /* busy wait 2ms so expires_at < Date.now() */
    }

    // Directly invoke cleanup (same code path triggered at 10% probability in cacheSet)
    deleteExpiredEntries(Date.now());
    expect(getCacheEntry(WALLET, "ns", "soon-gone")).toBeNull();
  });
});

// ─── Cache namespace / wallet isolation ──────────────────────────────────

describe("Cache isolation", () => {
  it("same key in different namespaces are independent", () => {
    cacheSet("ns-a", "key", { value: "in-a" }, WALLET);
    cacheSet("ns-b", "key", { value: "in-b" }, WALLET);
    const a = cacheGet("ns-a", "key", WALLET);
    const b = cacheGet("ns-b", "key", WALLET);
    expect(a.ok && (a as { data: { value: unknown } }).data.value).toBe("in-a");
    expect(b.ok && (b as { data: { value: unknown } }).data.value).toBe("in-b");
  });

  it("same namespace+key for different wallets are independent", () => {
    cacheSet("ns", "key", { value: "wallet-a" }, WALLET);
    cacheSet("ns", "key", { value: "wallet-b" }, WALLET_B);
    const a = cacheGet("ns", "key", WALLET);
    const b = cacheGet("ns", "key", WALLET_B);
    expect(a.ok && (a as { data: { value: unknown } }).data.value).toBe("wallet-a");
    expect(b.ok && (b as { data: { value: unknown } }).data.value).toBe("wallet-b");
  });

  it("wallet A cannot see wallet B's keys", () => {
    cacheSet("ns", "secret", { value: "only-b" }, WALLET_B);
    const result = cacheGet("ns", "secret", WALLET);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("not_found");
  });

  it("different keys in same namespace same wallet are independent", () => {
    cacheSet("ns", "key-1", { value: "one" }, WALLET);
    cacheSet("ns", "key-2", { value: "two" }, WALLET);
    const r1 = cacheGet("ns", "key-1", WALLET);
    const r2 = cacheGet("ns", "key-2", WALLET);
    expect(r1.ok && (r1 as { data: { value: unknown } }).data.value).toBe("one");
    expect(r2.ok && (r2 as { data: { value: unknown } }).data.value).toBe("two");
  });

  it("delete by wallet A does not affect wallet B's same-namespace/key entry", () => {
    cacheSet("ns", "shared", { value: "from-a" }, WALLET);
    cacheSet("ns", "shared", { value: "from-b" }, WALLET_B);
    cacheDelete("ns", "shared", WALLET);
    const b = cacheGet("ns", "shared", WALLET_B);
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(b.data.value).toBe("from-b");
  });
});

// ─── Embedding error handling ─────────────────────────────────────────────

describe("Embedding error handling", () => {
  async function makeCollection(name = "embed-err-col"): Promise<string> {
    const r = await createCollection({ name }, WALLET);
    if (!r.ok) throw new Error("setup failed");
    return r.data.id;
  }

  it("429 from Google returns embedding_error", async () => {
    const id = await makeCollection("embed-429");
    mockFetch.mockResolvedValueOnce(new Response("too many requests", { status: 429 }));
    const result = await upsertDocuments(id, { documents: [{ text: "x" }] }, WALLET);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("embedding_error");
  });

  it("401 from Google returns embedding_error", async () => {
    const id = await makeCollection("embed-401");
    mockFetch.mockResolvedValueOnce(new Response("unauthorized", { status: 401 }));
    const result = await queryDocuments(id, { text: "x" }, WALLET);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("embedding_error");
  });

  it("malformed response (no embeddings array) returns embedding_error", async () => {
    const id = await makeCollection("embed-malformed");
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ not_embeddings: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const result = await upsertDocuments(id, { documents: [{ text: "x" }] }, WALLET);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("embedding_error");
  });
});

// ─── document_count behavior ──────────────────────────────────────────────

describe("document_count", () => {
  it("is null in list response", async () => {
    await createCollection({ name: "doccount-list" }, WALLET);
    const list = listCollections(WALLET, 20, 1);
    expect(list.data[0].document_count).toBeNull();
  });

  it("is live points_count in single-get", async () => {
    const created = await createCollection({ name: "doccount-get" }, WALLET);
    if (!created.ok) throw new Error("setup failed");
    // Default mock returns points_count: 5
    const result = await getCollection(created.data.id, WALLET);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.document_count).toBe(5);
  });

  it("is null in single-get when Qdrant info call fails", async () => {
    const created = await createCollection({ name: "doccount-fail" }, WALLET);
    if (!created.ok) throw new Error("setup failed");
    mockFetch.mockResolvedValueOnce(qdrantErrorResponse(503));
    const result = await getCollection(created.data.id, WALLET);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.document_count).toBeNull();
  });
});
