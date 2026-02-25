/**
 * Hetzner Cloud provider implementation.
 * Wraps Hetzner Cloud API v1 behind the CloudProvider interface.
 */

import type {
  CloudProvider,
  ProviderCreateParams,
  ProviderCreateResult,
  ProviderAction,
  ProviderRebuildResult,
  ProviderServer,
  ProviderSshKey,
  ProviderSshKeyParams,
  ProviderServerType,
} from "./provider.ts";
import { ProviderError } from "./provider.ts";

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

// ─── Hetzner error handling ──────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.ok) {
    if (res.status === 204) return undefined as unknown as T;
    return res.json() as Promise<T>;
  }

  let code = "provider_error";
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

  if (res.status === 404) code = "not_found";
  else if (res.status === 403) code = "forbidden";
  else if (res.status === 422) code = "invalid_request";
  else if (res.status === 429) code = "rate_limited";
  else if (res.status >= 500) code = "provider_error";

  throw new ProviderError(res.status, code, message);
}

// ─── Hetzner response types (internal) ───────────────────────────────────

interface HetznerServer {
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

interface HetznerAction {
  id: number;
  command: string;
  status: string;
  started: string;
  finished: string | null;
}

interface HetznerSshKeyData {
  id: number;
  name: string;
  fingerprint: string;
  public_key: string;
  labels: Record<string, string>;
  created: string;
}

// ─── Mappers (Hetzner → Provider) ────────────────────────────────────────

function mapServer(hs: HetznerServer): ProviderServer {
  return {
    providerResourceId: String(hs.id),
    name: hs.name,
    status: hs.status,
    ipv4: hs.public_net?.ipv4?.ip ?? null,
    ipv6: hs.public_net?.ipv6?.ip ?? null,
    type: hs.server_type.name,
    image: hs.image?.name ?? null,
    location: hs.datacenter.location.name,
  };
}

function mapAction(ha: HetznerAction): ProviderAction {
  return {
    id: String(ha.id),
    command: ha.command,
    status: ha.status,
    startedAt: ha.started,
    finishedAt: ha.finished,
  };
}

function mapSshKey(hk: HetznerSshKeyData): ProviderSshKey {
  return {
    providerResourceId: String(hk.id),
    name: hk.name,
    fingerprint: hk.fingerprint,
    publicKey: hk.public_key,
  };
}

// ─── Hetzner HTTP calls ──────────────────────────────────────────────────

async function postServerAction<T>(hetznerServerId: string, action: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}/servers/${hetznerServerId}/actions/${action}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  return handleResponse<T>(res);
}

// ─── Provider capabilities ───────────────────────────────────────────────

const HETZNER_SERVER_TYPES: ProviderServerType[] = [
  { name: "small", providerType: "cx23", dailyBurn: "0.15" },
  { name: "medium", providerType: "cx33", dailyBurn: "0.22" },
  { name: "large", providerType: "cx43", dailyBurn: "0.40" },
  { name: "arm-small", providerType: "cax11", dailyBurn: "0.16" },
];

const HETZNER_IMAGES = ["ubuntu-24.04", "ubuntu-22.04", "debian-12", "fedora-41"];
const HETZNER_LOCATIONS = ["nbg1", "fsn1", "hel1", "ash", "hil"];

// ─── CloudProvider implementation ────────────────────────────────────────

export function createHetznerProvider(): CloudProvider {
  return {
    name: "hetzner",

    async createServer(params: ProviderCreateParams): Promise<ProviderCreateResult> {
      const res = await fetch(`${BASE_URL}/servers`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          name: params.name,
          server_type: params.type,
          image: params.image,
          location: params.location,
          ssh_keys: params.sshKeyIds,
          labels: params.labels,
          user_data: params.userData,
        }),
      });
      const data = await handleResponse<{ server: HetznerServer; action: HetznerAction }>(res);
      return { server: mapServer(data.server), action: mapAction(data.action) };
    },

    async getServer(providerResourceId: string): Promise<ProviderServer> {
      const res = await fetch(`${BASE_URL}/servers/${providerResourceId}`, {
        headers: headers(),
      });
      const data = await handleResponse<{ server: HetznerServer }>(res);
      return mapServer(data.server);
    },

    async deleteServer(providerResourceId: string): Promise<void> {
      const res = await fetch(`${BASE_URL}/servers/${providerResourceId}`, {
        method: "DELETE",
        headers: headers(),
      });
      await handleResponse<void>(res);
    },

    async startServer(providerResourceId: string): Promise<ProviderAction> {
      const data = await postServerAction<{ action: HetznerAction }>(providerResourceId, "poweron");
      return mapAction(data.action);
    },

    async stopServer(providerResourceId: string): Promise<ProviderAction> {
      const data = await postServerAction<{ action: HetznerAction }>(providerResourceId, "shutdown");
      return mapAction(data.action);
    },

    async rebootServer(providerResourceId: string): Promise<ProviderAction> {
      const data = await postServerAction<{ action: HetznerAction }>(providerResourceId, "reboot");
      return mapAction(data.action);
    },

    async resizeServer(providerResourceId: string, type: string, upgradeDisk: boolean): Promise<ProviderAction> {
      const data = await postServerAction<{ action: HetznerAction }>(providerResourceId, "change_type", {
        server_type: type,
        upgrade_disk: upgradeDisk,
      });
      return mapAction(data.action);
    },

    async rebuildServer(providerResourceId: string, image: string): Promise<ProviderRebuildResult> {
      const data = await postServerAction<{ action: HetznerAction; root_password: string | null }>(
        providerResourceId,
        "rebuild",
        { image },
      );
      return { action: mapAction(data.action), rootPassword: data.root_password };
    },

    async createSshKey(params: ProviderSshKeyParams): Promise<ProviderSshKey> {
      const res = await fetch(`${BASE_URL}/ssh_keys`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          name: params.name,
          public_key: params.publicKey,
          labels: params.labels,
        }),
      });
      const data = await handleResponse<{ ssh_key: HetznerSshKeyData }>(res);
      return mapSshKey(data.ssh_key);
    },

    async listSshKeys(labelSelector?: string): Promise<ProviderSshKey[]> {
      const url = labelSelector
        ? `${BASE_URL}/ssh_keys?label_selector=${encodeURIComponent(labelSelector)}`
        : `${BASE_URL}/ssh_keys`;
      const res = await fetch(url, { headers: headers() });
      const data = await handleResponse<{ ssh_keys: HetznerSshKeyData[] }>(res);
      return data.ssh_keys.map(mapSshKey);
    },

    async deleteSshKey(providerResourceId: string): Promise<void> {
      const res = await fetch(`${BASE_URL}/ssh_keys/${providerResourceId}`, {
        method: "DELETE",
        headers: headers(),
      });
      await handleResponse<void>(res);
    },

    serverTypes(): ProviderServerType[] {
      return HETZNER_SERVER_TYPES;
    },

    images(): string[] {
      return HETZNER_IMAGES;
    },

    locations(): string[] {
      return HETZNER_LOCATIONS;
    },
  };
}
