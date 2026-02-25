/**
 * Thin HTTP wrapper around Cloudflare DNS API.
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
  result_info?: {
    page: number;
    per_page: number;
    total_count: number;
  };
}

function mapStatusToCode(status: number): string {
  if (status === 404) return "not_found";
  if (status === 401 || status === 403) return "forbidden";
  if (status === 400 || status === 422) return "invalid_request";
  if (status === 429) return "rate_limited";
  return "cloudflare_error";
}

async function handleResponse<T>(res: Response): Promise<CloudflareEnvelope<T>> {
  let body: CloudflareEnvelope<T>;
  try {
    body = (await res.json()) as CloudflareEnvelope<T>;
  } catch {
    throw new CloudflareError(res.status, mapStatusToCode(res.status), `Cloudflare API error: ${res.status}`);
  }

  if (!res.ok || !body.success) {
    const firstError = body.errors?.[0];
    const message = firstError?.message ?? `Cloudflare API error: ${res.status}`;
    throw new CloudflareError(res.status, mapStatusToCode(res.status), message);
  }

  return body;
}

// ─── Cloudflare response types ───────────────────────────────────────────

export interface CfZone {
  id: string;
  name: string;
  status: string;
  name_servers?: string[];
  created_on: string;
}

export interface CfDnsRecord {
  id: string;
  zone_id: string;
  type: string;
  name: string;
  content: string;
  ttl: number;
  proxied?: boolean;
  priority?: number;
  created_on: string;
  modified_on: string;
}

// ─── Zone functions ──────────────────────────────────────────────────────

export async function createZone(domain: string): Promise<CfZone> {
  const res = await fetch(`${BASE_URL}/zones`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      name: domain,
      account: { id: getAccountId() },
      type: "full",
    }),
  });
  const body = await handleResponse<CfZone>(res);
  return body.result;
}

export async function getZone(zoneId: string): Promise<CfZone> {
  const res = await fetch(`${BASE_URL}/zones/${zoneId}`, {
    headers: authHeaders(),
  });
  const body = await handleResponse<CfZone>(res);
  return body.result;
}

export async function deleteZone(zoneId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/zones/${zoneId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  await handleResponse<unknown>(res);
}

// ─── DNS record functions ────────────────────────────────────────────────

export async function createDnsRecord(
  zoneId: string,
  params: { type: string; name: string; content: string; ttl?: number; proxied?: boolean; priority?: number },
): Promise<CfDnsRecord> {
  const res = await fetch(`${BASE_URL}/zones/${zoneId}/dns_records`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(params),
  });
  const body = await handleResponse<CfDnsRecord>(res);
  return body.result;
}

export async function getDnsRecord(zoneId: string, recordId: string): Promise<CfDnsRecord> {
  const res = await fetch(`${BASE_URL}/zones/${zoneId}/dns_records/${recordId}`, {
    headers: authHeaders(),
  });
  const body = await handleResponse<CfDnsRecord>(res);
  return body.result;
}

export async function listDnsRecords(
  zoneId: string,
  filters?: { type?: string; name?: string },
): Promise<CfDnsRecord[]> {
  const url = new URL(`${BASE_URL}/zones/${zoneId}/dns_records`);
  if (filters?.type) url.searchParams.set("type", filters.type);
  if (filters?.name) url.searchParams.set("name", filters.name);

  const res = await fetch(url, { headers: authHeaders() });
  const body = await handleResponse<CfDnsRecord[]>(res);
  return body.result;
}

export async function updateDnsRecord(
  zoneId: string,
  recordId: string,
  params: { type: string; name: string; content: string; ttl?: number; proxied?: boolean; priority?: number },
): Promise<CfDnsRecord> {
  const res = await fetch(`${BASE_URL}/zones/${zoneId}/dns_records/${recordId}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(params),
  });
  const body = await handleResponse<CfDnsRecord>(res);
  return body.result;
}

export async function deleteDnsRecord(zoneId: string, recordId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/zones/${zoneId}/dns_records/${recordId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  await handleResponse<unknown>(res);
}

// ─── Batch DNS record types ──────────────────────────────────────────────

export interface CfBatchPost {
  name: string;
  type: string;
  content: string;
  ttl?: number;
  proxied?: boolean;
  priority?: number;
}

export interface CfBatchPatch {
  id: string;
  content?: string;
  ttl?: number;
  proxied?: boolean;
  priority?: number;
  type?: string;
  name?: string;
}

export interface CfBatchDelete {
  id: string;
}

export interface CfBatchResult {
  posts: CfDnsRecord[];
  patches: CfDnsRecord[];
  puts?: CfDnsRecord[];
  deletes: CfDnsRecord[];
}

export async function batchDnsRecords(
  zoneId: string,
  params: {
    posts?: CfBatchPost[];
    patches?: CfBatchPatch[];
    deletes?: CfBatchDelete[];
  },
): Promise<CfBatchResult> {
  const res = await fetch(`${BASE_URL}/zones/${zoneId}/dns_records/batch`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(params),
  });
  const body = await handleResponse<CfBatchResult>(res);
  return body.result;
}
