// SPDX-License-Identifier: Apache-2.0
/**
 * Thin HTTP wrapper around Cloudflare R2 API.
 * Base URL: https://api.cloudflare.com/client/v4
 * Auth: Bearer ${CLOUDFLARE_API_TOKEN}
 */

const BASE_URL = "https://api.cloudflare.com/client/v4";

function getApiToken(): string {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error("CLOUDFLARE_API_TOKEN environment variable is required");
  return token;
}

function getAccountId(): string {
  const id = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!id) throw new Error("CLOUDFLARE_ACCOUNT_ID environment variable is required");
  return id;
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getApiToken()}`,
    "Content-Type": "application/json",
  };
}

export class CloudflareError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CloudflareError";
  }
}

interface CloudflareEnvelope<T> {
  success: boolean;
  errors: { code: number; message: string }[];
  result: T;
}

function mapStatusToCode(status: number): string {
  if (status === 404) return "not_found";
  if (status === 401 || status === 403) return "forbidden";
  if (status === 400 || status === 422) return "invalid_request";
  if (status === 409) return "bucket_name_taken";
  if (status === 429) return "rate_limited";
  return "r2_error";
}

async function handleResponse<T>(res: Response): Promise<CloudflareEnvelope<T>> {
  let body: CloudflareEnvelope<T>;
  try {
    body = (await res.json()) as CloudflareEnvelope<T>;
  } catch {
    throw new CloudflareError(
      res.status,
      mapStatusToCode(res.status),
      `R2 API error: ${res.status}`,
    );
  }

  if (!res.ok || !body.success) {
    const firstError = body.errors?.[0];
    const message = firstError?.message ?? `R2 API error: ${res.status}`;
    throw new CloudflareError(res.status, mapStatusToCode(res.status), message);
  }

  return body;
}

// ─── Cloudflare R2 response types ─────────────────────────────────────────

export interface CfBucket {
  name: string;
  creation_date: string;
  location: string;
}

// ─── Bucket functions ─────────────────────────────────────────────────────

export async function createBucket(name: string, locationHint?: string): Promise<CfBucket> {
  const body: Record<string, string> = { name };
  if (locationHint) body.locationHint = locationHint;

  const res = await fetch(`${BASE_URL}/accounts/${getAccountId()}/r2/buckets`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const envelope = await handleResponse<CfBucket>(res);
  return envelope.result;
}

export async function getBucket(name: string): Promise<CfBucket> {
  const res = await fetch(`${BASE_URL}/accounts/${getAccountId()}/r2/buckets/${name}`, {
    headers: authHeaders(),
  });
  const envelope = await handleResponse<CfBucket>(res);
  return envelope.result;
}

export async function deleteBucket(name: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/accounts/${getAccountId()}/r2/buckets/${name}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  await handleResponse<unknown>(res);
}

export async function listBuckets(): Promise<CfBucket[]> {
  const res = await fetch(`${BASE_URL}/accounts/${getAccountId()}/r2/buckets`, {
    headers: authHeaders(),
  });
  const envelope = await handleResponse<{ buckets: CfBucket[] }>(res);
  return envelope.result.buckets;
}
