/**
 * Thin HTTP wrapper around Hetzner Cloud API.
 * Base URL: https://api.hetzner.cloud/v1
 * Auth: Bearer ${HETZNER_API_KEY}
 */

const BASE_URL = "https://api.hetzner.cloud/v1";

function getApiKey(): string {
  const key = process.env.HETZNER_API_KEY;
  if (!key) throw new Error("HETZNER_API_KEY environment variable is required");
  return key;
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    "Content-Type": "application/json",
  };
}

class HetznerError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HetznerError";
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.ok) {
    if (res.status === 204) return undefined as unknown as T;
    return res.json() as Promise<T>;
  }

  let code = "hetzner_error";
  let message = `Hetzner API error: ${res.status}`;

  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    if (body.error) {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
    }
  } catch {
    // Non-JSON error body — use defaults
  }

  // Map Hetzner HTTP status codes to spawn.sh error codes
  if (res.status === 404) code = "not_found";
  else if (res.status === 403) code = "forbidden";
  else if (res.status === 422) code = "invalid_request";
  else if (res.status === 429) code = "rate_limited";
  else if (res.status >= 500) code = "hetzner_error";

  throw new HetznerError(res.status, code, message);
}

// ─── Hetzner response types ───────────────────────────────────────────────

export interface HetznerServer {
  id: number;
  name: string;
  status: string;
  public_net: {
    ipv4: { ip: string | null } | null;
    ipv6: { ip: string | null } | null;
  };
  server_type: { name: string };
  image: { name: string } | null;
  datacenter: { location: { name: string } };
  labels: Record<string, string>;
}

export interface HetznerAction {
  id: number;
  command: string;
  status: string;
  started: string;
  finished: string | null;
}

export interface HetznerCreateResponse {
  server: HetznerServer;
  action: HetznerAction;
}

export interface HetznerServerResponse {
  server: HetznerServer;
}

export interface HetznerListResponse {
  servers: HetznerServer[];
  meta: {
    pagination: {
      page: number;
      per_page: number;
      total_entries: number;
    };
  };
}

// ─── API functions ────────────────────────────────────────────────────────

export interface CreateServerParams {
  name: string;
  server_type: string;
  image: string;
  location: string;
  ssh_keys?: string[];
  labels?: Record<string, string>;
  user_data?: string;
}

export async function createHetznerServer(params: CreateServerParams): Promise<HetznerCreateResponse> {
  const res = await fetch(`${BASE_URL}/servers`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(params),
  });
  return handleResponse<HetznerCreateResponse>(res);
}

export async function getHetznerServer(id: number): Promise<HetznerServerResponse> {
  const res = await fetch(`${BASE_URL}/servers/${id}`, {
    headers: headers(),
  });
  return handleResponse<HetznerServerResponse>(res);
}

export async function listHetznerServers(labelSelector: string): Promise<HetznerListResponse> {
  const url = `${BASE_URL}/servers?label_selector=${encodeURIComponent(labelSelector)}`;
  const res = await fetch(url, {
    headers: headers(),
  });
  return handleResponse<HetznerListResponse>(res);
}

export async function deleteHetznerServer(id: number): Promise<void> {
  const res = await fetch(`${BASE_URL}/servers/${id}`, {
    method: "DELETE",
    headers: headers(),
  });
  await handleResponse<void>(res);
}

export { HetznerError };
