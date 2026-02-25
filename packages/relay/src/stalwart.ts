/**
 * Thin HTTP wrapper around Stalwart Mail Server REST admin API.
 * Base URL: ${STALWART_API_URL} (default http://localhost:8080)
 * Auth: Basic ${STALWART_API_CREDENTIALS}
 */

function getApiUrl(): string {
  return process.env.STALWART_API_URL ?? "http://localhost:8080";
}

function getCredentials(): string {
  const creds = process.env.STALWART_API_CREDENTIALS;
  if (!creds) throw new Error("STALWART_API_CREDENTIALS environment variable is required");
  return creds;
}

function authHeaders(): Record<string, string> {
  const encoded = Buffer.from(getCredentials()).toString("base64");
  return {
    Authorization: `Basic ${encoded}`,
    "Content-Type": "application/json",
  };
}

export class StalwartError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "StalwartError";
  }
}

function mapStatusToCode(status: number): string {
  if (status === 404) return "not_found";
  if (status === 401 || status === 403) return "forbidden";
  if (status === 400 || status === 422) return "invalid_request";
  if (status === 409) return "conflict";
  if (status === 429) return "rate_limited";
  return "stalwart_error";
}

async function handleResponse<T>(res: Response): Promise<T> {
  let body: { data?: T; error?: string; details?: string };
  try {
    body = (await res.json()) as { data?: T; error?: string; details?: string };
  } catch {
    throw new StalwartError(
      res.status,
      mapStatusToCode(res.status),
      `Stalwart API error: ${res.status}`,
    );
  }

  if (!res.ok) {
    const message = body.error ?? body.details ?? `Stalwart API error: ${res.status}`;
    throw new StalwartError(res.status, mapStatusToCode(res.status), message);
  }

  return body.data as T;
}

// ─── Principal types ────────────────────────────────────────────────────

export interface CreatePrincipalParams {
  type: "individual";
  name: string;
  secrets: string[];
  emails: string[];
  quota?: number;
  roles?: string[];
}

export interface StalwartPrincipal {
  id: number;
  type: string;
  name: string;
  emails?: string[];
  quota?: number;
  roles?: string[];
  description?: string;
}

// ─── Principal functions ────────────────────────────────────────────────

export async function createPrincipal(params: CreatePrincipalParams): Promise<number> {
  const res = await fetch(`${getApiUrl()}/api/principal`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(params),
  });
  return handleResponse<number>(res);
}

export async function getPrincipal(name: string): Promise<StalwartPrincipal> {
  const res = await fetch(`${getApiUrl()}/api/principal/${encodeURIComponent(name)}`, {
    headers: authHeaders(),
  });
  return handleResponse<StalwartPrincipal>(res);
}

export async function deletePrincipal(name: string): Promise<void> {
  const res = await fetch(`${getApiUrl()}/api/principal/${encodeURIComponent(name)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  await handleResponse<null>(res);
}
