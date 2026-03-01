// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Source: packages/spawn/openapi.yaml
// Regenerate: pnpm gen:sdk

import { unwrap } from "./shared.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ActionOnlyResponse {
  /** Action object for the requested operation. */
  action: ActionResponse;
}

export interface ActionResponse {
  /** Action ID. */
  id: string;
  /** Action name (e.g. "create", "start", "stop"). */
  command: string;
  /** Action status: "running" | "success" | "error". */
  status: string;
  /** ISO 8601 timestamp when the action started. */
  started_at: string;
  /** ISO 8601 timestamp when the action finished. Null if still running. */
  finished_at: string | null;
}

export interface CreateServerRequest {
  /** Server name (provider-level label). */
  name: string;
  /** Server type slug. Only "small" (2 vCPU, 4 GB RAM) available in beta. */
  type: string;
  /** OS image slug (e.g. "ubuntu-24.04", "debian-12"). */
  image: string;
  /** Data center slug (e.g. "nyc3", "sfo3", "lon1"). */
  location: string;
  /** Cloud provider. Default "digitalocean". */
  provider?: string;
  /** SSH key IDs from POST /v1/ssh-keys to install on the server. */
  ssh_keys?: string[];
  /** Cloud-init script to run on first boot. */
  user_data?: string;
}

export interface CreateServerResponse {
  /** Created server object (initial status: "initializing"). */
  server: ServerResponse;
  /** Action object tracking the provisioning progress. */
  action: ActionResponse;
  /** USDC charged for this server as a decimal string. */
  deposit_charged: string;
  /** Remaining USDC deposit balance as a decimal string. */
  deposit_remaining: string;
}

export interface CreateSshKeyRequest {
  /** Human-readable label for this SSH key. */
  name: string;
  /** Public key string (e.g. "ssh-ed25519 AAAA..."). */
  public_key: string;
}

export interface DeleteServerResponse {
  /** Always "deleted" on success. */
  status: "deleted";
  /** USDC refunded to wallet as a decimal string. */
  deposit_refunded: string;
}

export interface PublicNet {
  /** IPv4 address info. Null until assigned. */
  ipv4: Record<string, unknown>;
  /** IPv6 address info. Null until assigned. */
  ipv6: Record<string, unknown>;
}

export interface RebuildRequest {
  /** OS image slug to rebuild with (e.g. "debian-12"). */
  image: string;
}

export interface RebuildResponse {
  /** Action object (command: "rebuild"). */
  action: ActionResponse;
  /** New root password if no SSH keys configured. Null if SSH keys are installed. */
  root_password: string | null;
}

export interface ResizeRequest {
  /** Target server type slug. */
  type: string;
  /** Upgrade disk along with CPU/RAM. Irreversible if true. Default false. */
  upgrade_disk?: boolean;
}

export interface ResizeResponse {
  /** Action object (command: "resize"). */
  action: ActionResponse;
  /** Target server type after resize. */
  new_type: string;
  /** USDC deposit change as a decimal string. Positive = charged, negative = refunded. */
  deposit_delta: string;
}

export interface ServerResponse {
  /** Prim server ID (e.g. "srv_abc123"). */
  id: string;
  /** Cloud provider (e.g. "digitalocean"). */
  provider: string;
  /** Provider-assigned server ID. */
  provider_id: string;
  /** Server name (label). */
  name: string;
  /** Server type slug (e.g. "small"). */
  type: string;
  /** Current server lifecycle status. */
  status: string;
  /** OS image slug (e.g. "ubuntu-24.04"). */
  image: string;
  /** Data center slug (e.g. "nyc3"). */
  location: string;
  /** Public IP addresses. */
  public_net: PublicNet;
  /** Ethereum address of the server owner. */
  owner_wallet: string;
  /** ISO 8601 timestamp when the server was created. */
  created_at: string;
}

export interface SshKeyResponse {
  /** Prim SSH key ID (e.g. "key_abc123"). */
  id: string;
  /** Cloud provider. */
  provider: string;
  /** Provider-assigned key ID. */
  provider_id: string;
  /** Key label. */
  name: string;
  /** SSH key fingerprint. */
  fingerprint: string;
  /** Ethereum address of the key owner. */
  owner_wallet: string;
  /** ISO 8601 timestamp when the key was registered. */
  created_at: string;
}

export interface ListServersParams {
  /** 1-100, default 20 */
  limit?: number;
  /** 1-based page number, default 1 */
  page?: number;
}

export interface GetServerParams {
  /** id parameter */
  id: string;
}

export interface DeleteServerParams {
  /** id parameter */
  id: string;
}

export interface StartServerParams {
  /** id parameter */
  id: string;
}

export interface StopServerParams {
  /** id parameter */
  id: string;
}

export interface RebootServerParams {
  /** id parameter */
  id: string;
}

export interface ResizeServerParams {
  /** id parameter */
  id: string;
}

export interface RebuildServerParams {
  /** id parameter */
  id: string;
}

export interface DeleteSshKeyParams {
  /** id parameter */
  id: string;
}

export type ListServersResponse = Record<string, unknown>;

export type ListSshKeysResponse = Record<string, unknown>;

export type DeleteSshKeyResponse = Record<string, unknown>;

// ── Client ─────────────────────────────────────────────────────────────────

export function createSpawnClient(
  primFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  baseUrl = "https://spawn.prim.sh",
) {
  return {
    async createServer(req: CreateServerRequest): Promise<CreateServerResponse> {
      const url = `${baseUrl}/v1/servers`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return unwrap<CreateServerResponse>(res);
    },
    async listServers(params: ListServersParams): Promise<ListServersResponse> {
      const qs = new URLSearchParams();
      if (params.limit !== undefined) qs.set("limit", String(params.limit));
      if (params.page !== undefined) qs.set("page", String(params.page));
      const query = qs.toString();
      const url = `${baseUrl}/v1/servers${query ? `?${query}` : ""}`;
      const res = await primFetch(url);
      return unwrap<ListServersResponse>(res);
    },
    async getServer(params: GetServerParams): Promise<ServerResponse> {
      const url = `${baseUrl}/v1/servers/${encodeURIComponent(params.id)}`;
      const res = await primFetch(url);
      return unwrap<ServerResponse>(res);
    },
    async deleteServer(params: DeleteServerParams): Promise<DeleteServerResponse> {
      const url = `${baseUrl}/v1/servers/${encodeURIComponent(params.id)}`;
      const res = await primFetch(url, {
        method: "DELETE",
      });
      return unwrap<DeleteServerResponse>(res);
    },
    async startServer(params: StartServerParams): Promise<ActionOnlyResponse> {
      const url = `${baseUrl}/v1/servers/${encodeURIComponent(params.id)}/start`;
      const res = await primFetch(url, {
        method: "POST",
      });
      return unwrap<ActionOnlyResponse>(res);
    },
    async stopServer(params: StopServerParams): Promise<ActionOnlyResponse> {
      const url = `${baseUrl}/v1/servers/${encodeURIComponent(params.id)}/stop`;
      const res = await primFetch(url, {
        method: "POST",
      });
      return unwrap<ActionOnlyResponse>(res);
    },
    async rebootServer(params: RebootServerParams): Promise<ActionOnlyResponse> {
      const url = `${baseUrl}/v1/servers/${encodeURIComponent(params.id)}/reboot`;
      const res = await primFetch(url, {
        method: "POST",
      });
      return unwrap<ActionOnlyResponse>(res);
    },
    async resizeServer(params: ResizeServerParams, req: ResizeRequest): Promise<ResizeResponse> {
      const url = `${baseUrl}/v1/servers/${encodeURIComponent(params.id)}/resize`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return unwrap<ResizeResponse>(res);
    },
    async rebuildServer(params: RebuildServerParams, req: RebuildRequest): Promise<RebuildResponse> {
      const url = `${baseUrl}/v1/servers/${encodeURIComponent(params.id)}/rebuild`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return unwrap<RebuildResponse>(res);
    },
    async createSshKey(req: CreateSshKeyRequest): Promise<SshKeyResponse> {
      const url = `${baseUrl}/v1/ssh-keys`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return unwrap<SshKeyResponse>(res);
    },
    async listSshKeys(): Promise<ListSshKeysResponse> {
      const url = `${baseUrl}/v1/ssh-keys`;
      const res = await primFetch(url);
      return unwrap<ListSshKeysResponse>(res);
    },
    async deleteSshKey(params: DeleteSshKeyParams): Promise<DeleteSshKeyResponse> {
      const url = `${baseUrl}/v1/ssh-keys/${encodeURIComponent(params.id)}`;
      const res = await primFetch(url, {
        method: "DELETE",
      });
      return unwrap<DeleteSshKeyResponse>(res);
    },
  };
}
