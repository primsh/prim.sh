/**
 * Thin fetch wrapper around the Qdrant HTTP API.
 * Minimum Qdrant version: 1.10+ (uses /points/query endpoint).
 */

export class QdrantError extends Error {
  code: string;
  statusCode: number;

  constructor(message: string, code: string, statusCode: number) {
    super(message);
    this.name = "QdrantError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function mapQdrantStatus(status: number): { code: string; httpStatus: number } {
  if (status === 404) return { code: "not_found", httpStatus: 404 };
  if (status === 409) return { code: "collection_name_taken", httpStatus: 409 };
  if (status === 400 || status === 422) return { code: "invalid_request", httpStatus: 400 };
  if (status === 429) return { code: "rate_limited", httpStatus: 429 };
  return { code: "qdrant_error", httpStatus: 502 };
}

function getQdrantUrl(): string {
  return process.env.QDRANT_URL ?? "http://localhost:6333";
}

function buildHeaders(): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = process.env.QDRANT_API_KEY;
  if (apiKey) h["api-key"] = apiKey;
  return h;
}

async function qdrantFetch(path: string, method: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${getQdrantUrl()}${path}`, {
    method,
    headers: buildHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const { code, httpStatus } = mapQdrantStatus(res.status);
    throw new QdrantError(text || `Qdrant error ${res.status}`, code, httpStatus);
  }

  return res.json();
}

export async function createCollection(
  name: string,
  params: { size: number; distance: string },
): Promise<void> {
  await qdrantFetch(`/collections/${name}`, "PUT", {
    vectors: { size: params.size, distance: params.distance },
  });
}

export async function deleteCollection(name: string): Promise<void> {
  await qdrantFetch(`/collections/${name}`, "DELETE");
}

export async function getCollectionInfo(name: string): Promise<{ points_count: number }> {
  const data = (await qdrantFetch(`/collections/${name}`, "GET")) as {
    result: { points_count: number };
  };
  return { points_count: data.result.points_count ?? 0 };
}

export interface QdrantPoint {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
}

export async function upsertPoints(collection: string, points: QdrantPoint[]): Promise<void> {
  await qdrantFetch(`/collections/${collection}/points`, "PUT", { points });
}

export interface QdrantQueryResult {
  id: string;
  score: number;
  payload: Record<string, unknown>;
}

export async function queryPoints(
  collection: string,
  vector: number[],
  limit: number,
  filter?: unknown,
): Promise<QdrantQueryResult[]> {
  const body: Record<string, unknown> = {
    query: vector,
    limit,
    with_payload: true,
  };
  if (filter !== undefined) body.filter = filter;

  const data = (await qdrantFetch(`/collections/${collection}/points/query`, "POST", body)) as {
    result: { points: QdrantQueryResult[] };
  };
  return data.result.points;
}
