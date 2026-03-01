// SPDX-License-Identifier: Apache-2.0
/**
 * spawn.sh API contract — request/response types and error envelope.
 */

// ─── Error envelope ───────────────────────────────────────────────────────

export interface ApiError {
  error: {
    /** Machine-readable error code. */
    code: string;
    /** Human-readable error message. */
    message: string;
  };
}

export const ERROR_CODES = [
  "not_found",
  "forbidden",
  "invalid_request",
  "insufficient_deposit",
  "provider_error",
  "rate_limited",
  "not_implemented",
  "server_limit_exceeded",
  "type_not_allowed",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

// ─── Server status ─────────────────────────────────────────────────────────

export type ServerStatus =
  | "initializing"
  | "running"
  | "off"
  | "rebuilding"
  | "migrating"
  | "destroying"
  | "deleted";

// ─── Create server ─────────────────────────────────────────────────────────

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

export interface PublicNet {
  /** IPv4 address info. Null until assigned. */
  ipv4: { ip: string | null } | null;
  /** IPv6 address info. Null until assigned. */
  ipv6: { ip: string | null } | null;
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
  status: ServerStatus;
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

// ─── List servers ──────────────────────────────────────────────────────────

export interface ServerListMeta {
  /** Current page number (1-based). */
  page: number;
  /** Number of servers per page. */
  per_page: number;
  /** Total number of servers. */
  total: number;
}

// ─── Delete server ────────────────────────────────────────────────────────

export interface DeleteServerResponse {
  /** Always "deleted" on success. */
  status: "deleted";
  /** USDC refunded to wallet as a decimal string. */
  deposit_refunded: string;
}

// ─── VM actions ───────────────────────────────────────────────────────────

export interface ActionOnlyResponse {
  /** Action object for the requested operation. */
  action: ActionResponse;
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

// ─── SSH keys ─────────────────────────────────────────────────────────────

export interface CreateSshKeyRequest {
  /** Human-readable label for this SSH key. */
  name: string;
  /** Public key string (e.g. "ssh-ed25519 AAAA..."). */
  public_key: string;
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

