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

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${getApiToken()}`,
    "Content-Type": "application/json",
  };
}

function mapStatusToErrorCode(status: number): string {
  if (status === 404) return "not_found";
  if (status === 401 || status === 403) return "forbidden";
  if (status === 400 || status === 422) return "invalid_request";
  if (status === 429) return "rate_limited";
  return "cloudflare_error";
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
  messages: unknown[];
  result: T;
  result_info?: {
    page: number;
    per_page: number;
    total_count: number;
  };
}

async function handleResponse<T>(res: Response): Promise<CloudflareEnvelope<T>> {
  const status = res.status;

  let body: CloudflareEnvelope<T>;
  try {
    body = (await res.json()) as CloudflareEnvelope<T>;
  } catch {
    if (!res.ok) {
      throw new CloudflareError(status, mapStatusToErrorCode(status), `Cloudflare API error: ${status}`);
    }
    throw new CloudflareError(status, "cloudflare_error", "Invalid JSON response from Cloudflare");
  }

  if (!res.ok || !body.success) {
    const firstError = body.errors[0];
    const message = firstError?.message ?? `Cloudflare API error: ${status}`;
    const code = mapStatusToErrorCode(status);
    throw new CloudflareError(status, code, message);
  }

  return body;
}

// ─── Cloudflare types ──────────────────────────────────────────────────────

export interface CloudflareZone {
  id: string;
  name: string;
  status: string;
  name_servers?: string[];
  created_on: string;
}

export interface CloudflareZoneListResult {
  result: CloudflareZone[];
  result_info: {
    page: number;
    per_page: number;
    total_count: number;
  };
}

export interface CloudflareDnsRecord {
  id: string;
  zone_id: string;
  type: string;
  name: string;
  content: string;
  ttl: number;
  proxied?: boolean;
  created_on: string;
  modified_on: string;
}

export interface CloudflareDnsRecordListResult {
  result: CloudflareDnsRecord[];
}

// ─── Zone functions ────────────────────────────────────────────────────────

export async function createZone(params: {
  name: string;
  jump_start?: boolean;
  type?: "full" | "partial";
}): Promise<CloudflareZone> {
  const res = await fetch(`${BASE_URL}/zones`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(params),
  });
  const body = await handleResponse<CloudflareZone>(res);
  return body.result;
}

export async function listZones(page: number, perPage: number): Promise<CloudflareZoneListResult> {
  const url = new URL(`${BASE_URL}/zones`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(perPage));

  const res = await fetch(url, {
    headers: headers(),
  });
  const body = await handleResponse<CloudflareZone[]>(res);
  return {
    result: body.result,
    result_info: body.result_info ?? {
      page,
      per_page: perPage,
      total_count: body.result.length,
    },
  };
}

// ─── DNS record functions ──────────────────────────────────────────────────

export async function listDnsRecordsByNameAndType(
  zoneId: string,
  name: string,
  type: string,
): Promise<CloudflareDnsRecordListResult> {
  const url = new URL(`${BASE_URL}/zones/${zoneId}/dns_records`);
  url.searchParams.set("name", name);
  url.searchParams.set("type", type);

  const res = await fetch(url, {
    headers: headers(),
  });
  const body = await handleResponse<CloudflareDnsRecord[]>(res);
  return { result: body.result };
}

export async function createDnsRecord(
  zoneId: string,
  record: {
    type: string;
    name: string;
    content: string;
    ttl?: number;
    proxied?: boolean;
  },
): Promise<CloudflareDnsRecord> {
  const res = await fetch(`${BASE_URL}/zones/${zoneId}/dns_records`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(record),
  });
  const body = await handleResponse<CloudflareDnsRecord>(res);
  return body.result;
}

export async function updateDnsRecord(
  zoneId: string,
  recordId: string,
  record: {
    type: string;
    name: string;
    content: string;
    ttl?: number;
    proxied?: boolean;
  },
): Promise<CloudflareDnsRecord> {
  const res = await fetch(`${BASE_URL}/zones/${zoneId}/dns_records/${recordId}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(record),
  });
  const body = await handleResponse<CloudflareDnsRecord>(res);
  return body.result;
}

export async function deleteDnsRecord(zoneId: string, recordId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/zones/${zoneId}/dns_records/${recordId}`, {
    method: "DELETE",
    headers: headers(),
  });
  await handleResponse<unknown>(res);
}

