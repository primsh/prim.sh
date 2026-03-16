// SPDX-License-Identifier: Apache-2.0
/**
 * spawn.sh API contract — Zod schemas, inferred types, and error envelope.
 */

import { z } from "zod";

// ─── Error envelope ───────────────────────────────────────────────────────

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string().describe("Machine-readable error code."),
    message: z.string().describe("Human-readable error message."),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

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

export const ServerStatusEnum = z.enum([
  "initializing",
  "running",
  "off",
  "rebuilding",
  "migrating",
  "destroying",
  "deleted",
]);

// ─── Create server ─────────────────────────────────────────────────────────

export const CreateServerRequestSchema = z.object({
  name: z.string().describe("Server name (provider-level label)."),
  type: z.string().describe('Server type slug. Only "small" (2 vCPU, 4 GB RAM) available in beta.'),
  image: z.string().describe('OS image slug (e.g. "ubuntu-24.04", "debian-12").'),
  location: z.string().describe('Data center slug (e.g. "nyc3", "sfo3", "lon1").'),
  provider: z.string().optional().describe('Cloud provider. Default "digitalocean".'),
  ssh_keys: z
    .array(z.string())
    .optional()
    .describe("SSH key IDs from POST /v1/ssh-keys to install on the server."),
  user_data: z.string().optional().describe("Cloud-init script to run on first boot."),
});
export type CreateServerRequest = z.infer<typeof CreateServerRequestSchema>;

export const PublicNetSchema = z.object({
  ipv4: z
    .object({ ip: z.string().nullable() })
    .nullable()
    .describe("IPv4 address info. Null until assigned."),
  ipv6: z
    .object({ ip: z.string().nullable() })
    .nullable()
    .describe("IPv6 address info. Null until assigned."),
});
export type PublicNet = z.infer<typeof PublicNetSchema>;

export const GetServerResponseSchema = z.object({
  id: z.string().describe('Prim server ID (e.g. "srv_abc123").'),
  provider: z.string().describe('Cloud provider (e.g. "digitalocean").'),
  provider_id: z.string().describe("Provider-assigned server ID."),
  name: z.string().describe("Server name (label)."),
  type: z.string().describe('Server type slug (e.g. "small").'),
  status: ServerStatusEnum.describe("Current server lifecycle status."),
  image: z.string().describe('OS image slug (e.g. "ubuntu-24.04").'),
  location: z.string().describe('Data center slug (e.g. "nyc3").'),
  public_net: PublicNetSchema.describe("Public IP addresses."),
  owner_wallet: z.string().describe("Ethereum address of the server owner."),
  created_at: z.string().describe("ISO 8601 timestamp when the server was created."),
});
export type GetServerResponse = z.infer<typeof GetServerResponseSchema>;

export const GetActionResponseSchema = z.object({
  id: z.string().describe("Action ID."),
  command: z.string().describe('Action name (e.g. "create", "start", "stop").'),
  status: z.string().describe('Action status: "running" | "success" | "error".'),
  started_at: z.string().describe("ISO 8601 timestamp when the action started."),
  finished_at: z
    .string()
    .nullable()
    .describe("ISO 8601 timestamp when the action finished. Null if still running."),
});
export type GetActionResponse = z.infer<typeof GetActionResponseSchema>;

export const CreateServerResponseSchema = z.object({
  server: GetServerResponseSchema.describe(
    'Created server object (initial status: "initializing").',
  ),
  action: GetActionResponseSchema.describe("Action object tracking the provisioning progress."),
  deposit_charged: z.string().describe("USDC charged for this server as a decimal string."),
  deposit_remaining: z.string().describe("Remaining USDC deposit balance as a decimal string."),
});
export type CreateServerResponse = z.infer<typeof CreateServerResponseSchema>;

// ─── List servers ──────────────────────────────────────────────────────────

export const ServerListMetaSchema = z.object({
  page: z.number().describe("Current page number (1-based)."),
  per_page: z.number().describe("Number of servers per page."),
  total: z.number().describe("Total number of servers."),
});
export type ServerListMeta = z.infer<typeof ServerListMetaSchema>;

// ─── Delete server ────────────────────────────────────────────────────────

export const DeleteServerResponseSchema = z.object({
  status: z.literal("deleted").describe('Always "deleted" on success.'),
  deposit_refunded: z.string().describe("USDC refunded to wallet as a decimal string."),
});
export type DeleteServerResponse = z.infer<typeof DeleteServerResponseSchema>;

// ─── VM actions ───────────────────────────────────────────────────────────

export const GetActionOnlyResponseSchema = z.object({
  action: GetActionResponseSchema.describe("Action object for the requested operation."),
});
export type GetActionOnlyResponse = z.infer<typeof GetActionOnlyResponseSchema>;

export const ResizeServerRequestSchema = z.object({
  type: z.string().describe("Target server type slug."),
  upgrade_disk: z
    .boolean()
    .optional()
    .describe("Upgrade disk along with CPU/RAM. Irreversible if true. Default false."),
});
export type ResizeServerRequest = z.infer<typeof ResizeServerRequestSchema>;

export const ResizeServerResponseSchema = z.object({
  action: GetActionResponseSchema.describe('Action object (command: "resize").'),
  new_type: z.string().describe("Target server type after resize."),
  deposit_delta: z
    .string()
    .describe("USDC deposit change as a decimal string. Positive = charged, negative = refunded."),
});
export type ResizeServerResponse = z.infer<typeof ResizeServerResponseSchema>;

export const RebuildServerRequestSchema = z.object({
  image: z.string().describe('OS image slug to rebuild with (e.g. "debian-12").'),
});
export type RebuildServerRequest = z.infer<typeof RebuildServerRequestSchema>;

export const RebuildServerResponseSchema = z.object({
  action: GetActionResponseSchema.describe('Action object (command: "rebuild").'),
  root_password: z
    .string()
    .nullable()
    .describe("New root password if no SSH keys configured. Null if SSH keys are installed."),
});
export type RebuildServerResponse = z.infer<typeof RebuildServerResponseSchema>;

// ─── SSH keys ─────────────────────────────────────────────────────────────

export const CreateSshKeyRequestSchema = z.object({
  name: z.string().describe("Human-readable label for this SSH key."),
  public_key: z.string().describe('Public key string (e.g. "ssh-ed25519 AAAA...").'),
});
export type CreateSshKeyRequest = z.infer<typeof CreateSshKeyRequestSchema>;

export const GetSshKeyResponseSchema = z.object({
  id: z.string().describe('Prim SSH key ID (e.g. "key_abc123").'),
  provider: z.string().describe("Cloud provider."),
  provider_id: z.string().describe("Provider-assigned key ID."),
  name: z.string().describe("Key label."),
  fingerprint: z.string().describe("SSH key fingerprint."),
  owner_wallet: z.string().describe("Ethereum address of the key owner."),
  created_at: z.string().describe("ISO 8601 timestamp when the key was registered."),
});
export type GetSshKeyResponse = z.infer<typeof GetSshKeyResponseSchema>;
