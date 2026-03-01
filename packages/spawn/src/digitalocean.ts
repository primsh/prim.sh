// SPDX-License-Identifier: Apache-2.0
/**
 * DigitalOcean Cloud provider implementation.
 * Wraps DigitalOcean API v2 behind the CloudProvider interface.
 */

import type {
  CloudProvider,
  ProviderAction,
  ProviderCreateParams,
  ProviderCreateResult,
  ProviderRebuildResult,
  ProviderServer,
  ProviderServerType,
  ProviderSshKey,
  ProviderSshKeyParams,
} from "./provider.ts";
import { ProviderError } from "./provider.ts";

const BASE_URL = "https://api.digitalocean.com/v2";

function getApiToken(): string {
  const token = process.env.DO_API_TOKEN;
  if (!token) throw new Error("DO_API_TOKEN environment variable is required");
  return token;
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${getApiToken()}`,
    "Content-Type": "application/json",
  };
}

// ─── DO error handling ───────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.ok) {
    if (res.status === 204) return undefined as unknown as T;
    return res.json() as Promise<T>;
  }

  let code = "provider_error";
  let message = `DigitalOcean API error: ${res.status}`;

  try {
    const body = (await res.json()) as { id?: string; message?: string };
    if (body.id) code = body.id;
    if (body.message) message = body.message;
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

// ─── DO response types (internal) ────────────────────────────────────────

interface DONetwork {
  ip_address: string;
  netmask: string;
  gateway: string;
  type: "public" | "private";
}

interface DODroplet {
  id: number;
  name: string;
  status: string;
  networks: {
    v4: DONetwork[];
    v6: DONetwork[];
  };
  size_slug: string;
  image: { slug: string } | null;
  region: { slug: string };
  tags: string[];
}

interface DOAction {
  id: number;
  type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  resource_id: number;
  resource_type: string;
}

interface DOSshKeyData {
  id: number;
  name: string;
  fingerprint: string;
  public_key: string;
}

// ─── Image translation ──────────────────────────────────────────────────

const IMAGE_TO_DO: Record<string, string> = {
  "ubuntu-24.04": "ubuntu-24-04-x64",
  "ubuntu-22.04": "ubuntu-22-04-x64",
  "debian-12": "debian-12-x64",
  "fedora-41": "fedora-41-x64",
};

const IMAGE_FROM_DO: Record<string, string> = Object.fromEntries(
  Object.entries(IMAGE_TO_DO).map(([spawn, doSlug]) => [doSlug, spawn]),
);

// ─── Mappers (DO → Provider) ────────────────────────────────────────────

function mapDroplet(d: DODroplet): ProviderServer {
  const publicV4 = d.networks.v4.find((n) => n.type === "public");
  const publicV6 = d.networks.v6.find((n) => n.type === "public");
  const imageSlug = d.image?.slug ?? null;

  return {
    providerResourceId: String(d.id),
    name: d.name,
    status: d.status,
    ipv4: publicV4?.ip_address ?? null,
    ipv6: publicV6?.ip_address ?? null,
    type: d.size_slug,
    image: imageSlug ? (IMAGE_FROM_DO[imageSlug] ?? imageSlug) : null,
    location: d.region.slug,
  };
}

function mapAction(a: DOAction): ProviderAction {
  return {
    id: String(a.id),
    command: a.type,
    status: a.status,
    startedAt: a.started_at,
    finishedAt: a.completed_at,
  };
}

function mapSshKey(k: DOSshKeyData): ProviderSshKey {
  return {
    providerResourceId: String(k.id),
    name: k.name,
    fingerprint: k.fingerprint,
    publicKey: k.public_key,
  };
}

// ─── Tag helpers ────────────────────────────────────────────────────────

function labelsToTags(labels?: Record<string, string>): string[] {
  if (!labels) return [];
  return Object.entries(labels).map(([k, v]) => `${k}:${v}`);
}

// ─── DO HTTP helpers ────────────────────────────────────────────────────

async function postDropletAction(
  dropletId: string,
  body: Record<string, unknown>,
): Promise<DOAction> {
  const res = await fetch(`${BASE_URL}/droplets/${dropletId}/actions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  const data = await handleResponse<{ action: DOAction }>(res);
  return data.action;
}

// ─── Provider capabilities ──────────────────────────────────────────────

const DO_SERVER_TYPES: ProviderServerType[] = [
  { name: "small", providerType: "s-2vcpu-4gb", dailyBurn: "0.80" },
  { name: "medium", providerType: "s-4vcpu-8gb", dailyBurn: "1.60" },
  { name: "large", providerType: "s-8vcpu-16gb", dailyBurn: "3.20" },
];

const DO_IMAGES = ["ubuntu-24.04", "ubuntu-22.04", "debian-12", "fedora-41"];

const DO_LOCATIONS = ["nyc3", "sfo3", "ams3", "lon1", "fra1", "sgp1", "tor1", "blr1", "syd1"];

// ─── CloudProvider implementation ───────────────────────────────────────

export function createDigitalOceanProvider(): CloudProvider {
  return {
    name: "digitalocean",

    async createServer(params: ProviderCreateParams): Promise<ProviderCreateResult> {
      const doImage = IMAGE_TO_DO[params.image] ?? params.image;
      const res = await fetch(`${BASE_URL}/droplets`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          name: params.name,
          size: params.type,
          image: doImage,
          region: params.location,
          ssh_keys: params.sshKeyIds,
          tags: labelsToTags(params.labels),
          user_data: params.userData,
        }),
      });
      const data = await handleResponse<{
        droplet: DODroplet;
        links: { actions: { id: number }[] };
      }>(res);

      const actionId = data.links?.actions?.[0]?.id ?? 0;

      return {
        server: mapDroplet(data.droplet),
        action: {
          id: String(actionId),
          command: "create_droplet",
          status: "in-progress",
          startedAt: new Date().toISOString(),
          finishedAt: null,
        },
      };
    },

    async getServer(providerResourceId: string): Promise<ProviderServer> {
      const res = await fetch(`${BASE_URL}/droplets/${providerResourceId}`, {
        headers: headers(),
      });
      const data = await handleResponse<{ droplet: DODroplet }>(res);
      return mapDroplet(data.droplet);
    },

    async deleteServer(providerResourceId: string): Promise<void> {
      const res = await fetch(`${BASE_URL}/droplets/${providerResourceId}`, {
        method: "DELETE",
        headers: headers(),
      });
      await handleResponse<void>(res);
    },

    async startServer(providerResourceId: string): Promise<ProviderAction> {
      const action = await postDropletAction(providerResourceId, { type: "power_on" });
      return mapAction(action);
    },

    async stopServer(providerResourceId: string): Promise<ProviderAction> {
      const action = await postDropletAction(providerResourceId, { type: "shutdown" });
      return mapAction(action);
    },

    async rebootServer(providerResourceId: string): Promise<ProviderAction> {
      const action = await postDropletAction(providerResourceId, { type: "reboot" });
      return mapAction(action);
    },

    async resizeServer(
      providerResourceId: string,
      type: string,
      upgradeDisk: boolean,
    ): Promise<ProviderAction> {
      const action = await postDropletAction(providerResourceId, {
        type: "resize",
        size: type,
        disk: upgradeDisk,
      });
      return mapAction(action);
    },

    async rebuildServer(providerResourceId: string, image: string): Promise<ProviderRebuildResult> {
      const doImage = IMAGE_TO_DO[image] ?? image;
      const action = await postDropletAction(providerResourceId, {
        type: "rebuild",
        image: doImage,
      });
      return { action: mapAction(action), rootPassword: null };
    },

    async createSshKey(params: ProviderSshKeyParams): Promise<ProviderSshKey> {
      const res = await fetch(`${BASE_URL}/account/keys`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          name: params.name,
          public_key: params.publicKey,
        }),
      });
      const data = await handleResponse<{ ssh_key: DOSshKeyData }>(res);
      return mapSshKey(data.ssh_key);
    },

    async listSshKeys(_labelSelector?: string): Promise<ProviderSshKey[]> {
      const res = await fetch(`${BASE_URL}/account/keys`, { headers: headers() });
      const data = await handleResponse<{ ssh_keys: DOSshKeyData[] }>(res);
      return data.ssh_keys.map(mapSshKey);
    },

    async deleteSshKey(providerResourceId: string): Promise<void> {
      const res = await fetch(`${BASE_URL}/account/keys/${providerResourceId}`, {
        method: "DELETE",
        headers: headers(),
      });
      await handleResponse<void>(res);
    },

    serverTypes(): ProviderServerType[] {
      return DO_SERVER_TYPES;
    },

    images(): string[] {
      return DO_IMAGES;
    },

    locations(): string[] {
      return DO_LOCATIONS;
    },
  };
}
