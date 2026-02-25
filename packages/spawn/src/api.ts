/**
 * spawn.sh API contract — request/response types and error envelope.
 */

// ─── Error envelope ───────────────────────────────────────────────────────

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

export const ERROR_CODES = [
  "not_found",
  "forbidden",
  "invalid_request",
  "insufficient_deposit",
  "hetzner_error",
  "rate_limited",
  "not_implemented",
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

// ─── Server types and images ───────────────────────────────────────────────

export const SPAWN_SERVER_TYPES = ["small", "medium", "large", "arm-small"] as const;
export type SpawnServerType = (typeof SPAWN_SERVER_TYPES)[number];

export const SPAWN_IMAGES = ["ubuntu-24.04", "ubuntu-22.04", "debian-12", "fedora-41"] as const;
export type SpawnImage = (typeof SPAWN_IMAGES)[number];

export const SPAWN_LOCATIONS = ["nbg1", "fsn1", "hel1", "ash", "hil"] as const;
export type SpawnLocation = (typeof SPAWN_LOCATIONS)[number];

// ─── Create server ─────────────────────────────────────────────────────────

export interface CreateServerRequest {
  name: string;
  type: SpawnServerType;
  image: SpawnImage;
  location: SpawnLocation;
  ssh_keys?: string[];
  user_data?: string;
}

export interface PublicNet {
  ipv4: { ip: string | null } | null;
  ipv6: { ip: string | null } | null;
}

export interface ServerResponse {
  id: string;
  hetzner_id: number;
  name: string;
  type: string;
  status: ServerStatus;
  image: string;
  location: string;
  public_net: PublicNet;
  owner_wallet: string;
  created_at: string;
}

export interface ActionResponse {
  id: number;
  command: string;
  status: string;
  started_at: string;
  finished_at: string | null;
}

export interface CreateServerResponse {
  server: ServerResponse;
  action: ActionResponse;
  deposit_charged: string;
  deposit_remaining: string;
}

// ─── List servers ──────────────────────────────────────────────────────────

export interface ServerListMeta {
  page: number;
  per_page: number;
  total: number;
}

export interface ServerListResponse {
  servers: ServerResponse[];
  meta: ServerListMeta;
}

// ─── Delete server ────────────────────────────────────────────────────────

export interface DeleteServerResponse {
  status: "deleted";
  deposit_refunded: string;
}
