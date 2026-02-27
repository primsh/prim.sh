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
  name: string;
  type: string;
  image: string;
  location: string;
  provider?: string;
  ssh_keys?: string[];
  user_data?: string;
}

export interface PublicNet {
  ipv4: { ip: string | null } | null;
  ipv6: { ip: string | null } | null;
}

export interface ServerResponse {
  id: string;
  provider: string;
  provider_id: string;
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
  id: string;
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

/** @deprecated Use PaginatedList<ServerResponse> */
export type ServerListResponse = PaginatedList<ServerResponse>;

// ─── Delete server ────────────────────────────────────────────────────────

export interface DeleteServerResponse {
  status: "deleted";
  deposit_refunded: string;
}

// ─── VM actions ───────────────────────────────────────────────────────────

export interface ActionOnlyResponse {
  action: ActionResponse;
}

export interface ResizeRequest {
  type: string;
  upgrade_disk?: boolean;
}

export interface ResizeResponse {
  action: ActionResponse;
  new_type: string;
  deposit_delta: string;
}

export interface RebuildRequest {
  image: string;
}

export interface RebuildResponse {
  action: ActionResponse;
  root_password: string | null;
}

// ─── SSH keys ─────────────────────────────────────────────────────────────

export interface CreateSshKeyRequest {
  name: string;
  public_key: string;
}

export interface SshKeyResponse {
  id: string;
  provider: string;
  provider_id: string;
  name: string;
  fingerprint: string;
  owner_wallet: string;
  created_at: string;
}

import type { PaginatedList } from "@primsh/x402-middleware";

/** @deprecated Use PaginatedList<SshKeyResponse> */
export type SshKeyListResponse = PaginatedList<SshKeyResponse>;
