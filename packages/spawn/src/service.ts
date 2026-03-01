import { randomBytes } from "node:crypto";
import type { PaginatedList, ServiceResult } from "@primsh/x402-middleware";
import type {
  ActionOnlyResponse,
  CreateServerRequest,
  CreateServerResponse,
  CreateSshKeyRequest,
  DeleteServerResponse,
  RebuildRequest,
  RebuildResponse,
  ResizeRequest,
  ResizeResponse,
  ServerResponse,
  SshKeyResponse,
} from "./api.ts";
import {
  countActiveServersByOwner,
  countServersByOwner,
  deleteSshKeyRow,
  getServerById,
  getServersByOwner,
  getSshKeyById,
  getSshKeysByOwner,
  insertServer,
  insertSshKey,
  updateServerStatus,
  updateServerTypeAndImage,
} from "./db.ts";
import type { ServerRow, SshKeyRow } from "./db.ts";
import { type CloudProvider, ProviderError } from "./provider.ts";
import { getProvider } from "./providers.ts";

// ─── Constants ────────────────────────────────────────────────────────────

const DEFAULT_PROVIDER = "digitalocean";
const CREATION_DEPOSIT = "0.01";
function getMaxServersPerWallet(): number {
  return Number(process.env.SPAWN_MAX_SERVERS_PER_WALLET ?? "3");
}

function getAllowedTypes(): Set<string> {
  return new Set(
    (process.env.SPAWN_ALLOWED_TYPES ?? "small")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function generateServerId(): string {
  return `srv_${randomBytes(4).toString("hex")}`;
}

function generateSshKeyId(): string {
  return `sk_${randomBytes(4).toString("hex")}`;
}

function rowToServerResponse(row: ServerRow): ServerResponse {
  return {
    id: row.id,
    provider: row.provider,
    provider_id: row.provider_resource_id,
    name: row.name,
    type: row.type,
    status: row.status as ServerResponse["status"],
    image: row.image,
    location: row.location,
    public_net: {
      ipv4: row.public_ipv4 ? { ip: row.public_ipv4 } : null,
      ipv6: row.public_ipv6 ? { ip: row.public_ipv6 } : null,
    },
    owner_wallet: row.owner_wallet,
    created_at: new Date(row.created_at).toISOString(),
  };
}

function rowToSshKeyResponse(row: SshKeyRow): SshKeyResponse {
  return {
    id: row.id,
    provider: row.provider,
    provider_id: row.provider_resource_id,
    name: row.name,
    fingerprint: row.fingerprint,
    owner_wallet: row.owner_wallet,
    created_at: new Date(row.created_at).toISOString(),
  };
}

// ─── Ownership check ──────────────────────────────────────────────────────

type OwnershipCheckResult =
  | { ok: true; row: ServerRow }
  | { ok: false; status: 403 | 404; code: string; message: string };

function checkServerOwnership(id: string, caller: string): OwnershipCheckResult {
  const row = getServerById(id);

  if (!row) {
    return { ok: false, status: 404, code: "not_found", message: "Server not found" };
  }

  if (row.owner_wallet !== caller) {
    return { ok: false, status: 403, code: "forbidden", message: "Forbidden" };
  }

  return { ok: true, row };
}

// ─── Service functions ────────────────────────────────────────────────────

export async function createServer(
  request: CreateServerRequest,
  callerWallet: string,
): Promise<ServiceResult<CreateServerResponse>> {
  // Validate name (alphanumeric + hyphens)
  if (!/^[a-zA-Z0-9-]+$/.test(request.name)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Server name must contain only alphanumeric characters and hyphens",
    };
  }

  // Enforce beta type allowlist
  if (!getAllowedTypes().has(request.type)) {
    return {
      ok: false,
      status: 403,
      code: "type_not_allowed",
      message: "Only 'small' server type available during beta",
    };
  }

  // Enforce per-wallet server cap
  const activeCount = countActiveServersByOwner(callerWallet);
  if (activeCount >= getMaxServersPerWallet()) {
    return {
      ok: false,
      status: 403,
      code: "server_limit_exceeded",
      message: "Max 3 concurrent servers per wallet",
    };
  }

  // Resolve provider
  const providerName = request.provider ?? DEFAULT_PROVIDER;
  let provider: CloudProvider;
  try {
    provider = getProvider(providerName);
  } catch {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: `Unknown provider: ${providerName}`,
    };
  }

  // Validate type against provider capabilities
  const serverTypes = provider.serverTypes();
  const typeInfo = serverTypes.find((t) => t.name === request.type);
  if (!typeInfo) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: `Invalid server type. Must be one of: ${serverTypes.map((t) => t.name).join(", ")}`,
    };
  }

  // Validate image
  const images = provider.images();
  if (!images.includes(request.image)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: `Invalid image. Must be one of: ${images.join(", ")}`,
    };
  }

  // Validate location
  const locations = provider.locations();
  if (!locations.includes(request.location)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: `Invalid location. Must be one of: ${locations.join(", ")}`,
    };
  }

  const spawnId = generateServerId();

  // Resolve internal SSH key IDs (sk_...) to provider resource IDs
  let providerSshKeyIds: string[] | undefined;
  if (request.ssh_keys?.length) {
    providerSshKeyIds = [];
    for (const keyId of request.ssh_keys) {
      const keyRow = getSshKeyById(keyId);
      if (!keyRow) {
        return {
          ok: false,
          status: 404,
          code: "not_found",
          message: `SSH key not found: ${keyId}`,
        };
      }
      if (keyRow.owner_wallet !== callerWallet) {
        return {
          ok: false,
          status: 403,
          code: "forbidden",
          message: `SSH key not owned by caller: ${keyId}`,
        };
      }
      providerSshKeyIds.push(keyRow.provider_resource_id);
    }
  }

  try {
    const result = await provider.createServer({
      name: request.name,
      type: typeInfo.providerType,
      image: request.image,
      location: request.location,
      sshKeyIds: providerSshKeyIds,
      labels: { wallet: callerWallet },
      userData: request.user_data,
    });

    insertServer({
      id: spawnId,
      provider: providerName,
      provider_resource_id: result.server.providerResourceId,
      owner_wallet: callerWallet,
      name: request.name,
      type: request.type,
      image: request.image,
      location: request.location,
      status: "initializing",
      public_ipv4: result.server.ipv4,
      public_ipv6: result.server.ipv6,
      deposit_charged: CREATION_DEPOSIT,
      deposit_daily_burn: typeInfo.dailyBurn,
    });

    const row = getServerById(spawnId);
    if (!row) throw new Error("Failed to retrieve server after insert");

    return {
      ok: true,
      data: {
        server: rowToServerResponse(row),
        action: {
          id: result.action.id,
          command: result.action.command,
          status: result.action.status,
          started_at: result.action.startedAt,
          finished_at: result.action.finishedAt,
        },
        deposit_charged: CREATION_DEPOSIT,
        deposit_remaining: "0.00",
      },
    };
  } catch (err) {
    if (err instanceof ProviderError) {
      return {
        ok: false,
        status: 502,
        code: err.code,
        message: err.message,
      };
    }
    throw err;
  }
}

export function listServers(callerWallet: string, limit: number, page: number): PaginatedList<ServerResponse> {
  const offset = (page - 1) * limit;
  const rows = getServersByOwner(callerWallet, limit, offset);
  const total = countServersByOwner(callerWallet);

  return {
    data: rows.map(rowToServerResponse),
    pagination: {
      total,
      page,
      per_page: limit,
      cursor: null,
      has_more: offset + rows.length < total,
    },
  };
}

export async function getServer(
  serverId: string,
  callerWallet: string,
): Promise<ServiceResult<ServerResponse>> {
  const check = checkServerOwnership(serverId, callerWallet);
  if (!check.ok) return check;

  const { row } = check;

  // Refresh status from provider if not in a terminal state
  if (row.status !== "destroying" && row.status !== "deleted") {
    try {
      const provider = getProvider(row.provider);
      const live = await provider.getServer(row.provider_resource_id);
      if (live.status !== row.status || live.ipv4 !== row.public_ipv4) {
        updateServerStatus(row.id, live.status, live.ipv4 ?? undefined, live.ipv6 ?? undefined);
        row.status = live.status;
        row.public_ipv4 = live.ipv4;
        row.public_ipv6 = live.ipv6;
      }
    } catch {
      // Provider unreachable — return stale DB data rather than failing
    }
  }

  return { ok: true, data: rowToServerResponse(row) };
}

export async function deleteServer(
  serverId: string,
  callerWallet: string,
): Promise<ServiceResult<DeleteServerResponse>> {
  const check = checkServerOwnership(serverId, callerWallet);
  if (!check.ok) return check;

  const { row } = check;

  try {
    const provider = getProvider(row.provider);
    await provider.deleteServer(row.provider_resource_id);
  } catch (err) {
    if (err instanceof ProviderError) {
      return {
        ok: false,
        status: 502,
        code: err.code,
        message: err.message,
      };
    }
    throw err;
  }

  updateServerStatus(serverId, "destroying");

  const depositRefunded = "0.00";

  return {
    ok: true,
    data: {
      status: "deleted",
      deposit_refunded: depositRefunded,
    },
  };
}

// ─── VM lifecycle actions ─────────────────────────────────────────────────

export async function startServer(
  serverId: string,
  callerWallet: string,
): Promise<ServiceResult<ActionOnlyResponse>> {
  const check = checkServerOwnership(serverId, callerWallet);
  if (!check.ok) return check;

  try {
    const provider = getProvider(check.row.provider);
    const action = await provider.startServer(check.row.provider_resource_id);
    return {
      ok: true,
      data: {
        action: {
          id: action.id,
          command: action.command,
          status: action.status,
          started_at: action.startedAt,
          finished_at: action.finishedAt,
        },
      },
    };
  } catch (err) {
    if (err instanceof ProviderError) {
      return { ok: false, status: 502, code: err.code, message: err.message };
    }
    throw err;
  }
}

export async function stopServer(
  serverId: string,
  callerWallet: string,
): Promise<ServiceResult<ActionOnlyResponse>> {
  const check = checkServerOwnership(serverId, callerWallet);
  if (!check.ok) return check;

  try {
    const provider = getProvider(check.row.provider);
    const action = await provider.stopServer(check.row.provider_resource_id);
    return {
      ok: true,
      data: {
        action: {
          id: action.id,
          command: action.command,
          status: action.status,
          started_at: action.startedAt,
          finished_at: action.finishedAt,
        },
      },
    };
  } catch (err) {
    if (err instanceof ProviderError) {
      return { ok: false, status: 502, code: err.code, message: err.message };
    }
    throw err;
  }
}

export async function rebootServer(
  serverId: string,
  callerWallet: string,
): Promise<ServiceResult<ActionOnlyResponse>> {
  const check = checkServerOwnership(serverId, callerWallet);
  if (!check.ok) return check;

  try {
    const provider = getProvider(check.row.provider);
    const action = await provider.rebootServer(check.row.provider_resource_id);
    return {
      ok: true,
      data: {
        action: {
          id: action.id,
          command: action.command,
          status: action.status,
          started_at: action.startedAt,
          finished_at: action.finishedAt,
        },
      },
    };
  } catch (err) {
    if (err instanceof ProviderError) {
      return { ok: false, status: 502, code: err.code, message: err.message };
    }
    throw err;
  }
}

export async function resizeServer(
  serverId: string,
  callerWallet: string,
  request: ResizeRequest,
): Promise<ServiceResult<ResizeResponse>> {
  const check = checkServerOwnership(serverId, callerWallet);
  if (!check.ok) return check;

  const provider = getProvider(check.row.provider);
  const serverTypes = provider.serverTypes();
  const typeInfo = serverTypes.find((t) => t.name === request.type);

  if (!typeInfo) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: `Invalid server type. Must be one of: ${serverTypes.map((t) => t.name).join(", ")}`,
    };
  }

  try {
    const action = await provider.resizeServer(
      check.row.provider_resource_id,
      typeInfo.providerType,
      request.upgrade_disk ?? false,
    );
    updateServerTypeAndImage(serverId, request.type);
    return {
      ok: true,
      data: {
        action: {
          id: action.id,
          command: action.command,
          status: action.status,
          started_at: action.startedAt,
          finished_at: action.finishedAt,
        },
        new_type: request.type,
        deposit_delta: "0.00",
      },
    };
  } catch (err) {
    if (err instanceof ProviderError) {
      return { ok: false, status: 502, code: err.code, message: err.message };
    }
    throw err;
  }
}

export async function rebuildServer(
  serverId: string,
  callerWallet: string,
  request: RebuildRequest,
): Promise<ServiceResult<RebuildResponse>> {
  const check = checkServerOwnership(serverId, callerWallet);
  if (!check.ok) return check;

  const provider = getProvider(check.row.provider);
  const images = provider.images();

  if (!images.includes(request.image)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: `Invalid image. Must be one of: ${images.join(", ")}`,
    };
  }

  try {
    const result = await provider.rebuildServer(check.row.provider_resource_id, request.image);
    updateServerTypeAndImage(serverId, undefined, request.image);
    return {
      ok: true,
      data: {
        action: {
          id: result.action.id,
          command: result.action.command,
          status: result.action.status,
          started_at: result.action.startedAt,
          finished_at: result.action.finishedAt,
        },
        root_password: result.rootPassword,
      },
    };
  } catch (err) {
    if (err instanceof ProviderError) {
      return { ok: false, status: 502, code: err.code, message: err.message };
    }
    throw err;
  }
}

// ─── SSH key management ───────────────────────────────────────────────────

export async function registerSshKey(
  request: CreateSshKeyRequest,
  callerWallet: string,
  providerName?: string,
): Promise<ServiceResult<SshKeyResponse>> {
  if (!request.name || !request.public_key) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "name and public_key are required",
    };
  }

  const resolvedProvider = providerName ?? DEFAULT_PROVIDER;
  let provider: CloudProvider;
  try {
    provider = getProvider(resolvedProvider);
  } catch {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: `Unknown provider: ${resolvedProvider}`,
    };
  }

  try {
    const result = await provider.createSshKey({
      name: request.name,
      publicKey: request.public_key,
      labels: { wallet: callerWallet },
    });

    const skId = generateSshKeyId();

    insertSshKey({
      id: skId,
      provider: resolvedProvider,
      provider_resource_id: result.providerResourceId,
      owner_wallet: callerWallet,
      name: result.name,
      fingerprint: result.fingerprint,
    });

    const row = getSshKeyById(skId);
    if (!row) throw new Error("Failed to retrieve ssh key after insert");

    return { ok: true, data: rowToSshKeyResponse(row) };
  } catch (err) {
    if (err instanceof ProviderError) {
      return { ok: false, status: 502, code: err.code, message: err.message };
    }
    throw err;
  }
}

export function listSshKeys(callerWallet: string): PaginatedList<SshKeyResponse> {
  const rows = getSshKeysByOwner(callerWallet);
  return {
    data: rows.map(rowToSshKeyResponse),
    pagination: {
      total: rows.length,
      page: 1,
      per_page: rows.length,
      cursor: null,
      has_more: false,
    },
  };
}

export async function deleteSshKey(
  keyId: string,
  callerWallet: string,
): Promise<ServiceResult<{ status: "deleted" }>> {
  const row = getSshKeyById(keyId);

  if (!row) {
    return { ok: false, status: 404, code: "not_found", message: "SSH key not found" };
  }

  if (row.owner_wallet !== callerWallet) {
    return { ok: false, status: 403, code: "forbidden", message: "Forbidden" };
  }

  try {
    const provider = getProvider(row.provider);
    await provider.deleteSshKey(row.provider_resource_id);
  } catch (err) {
    if (err instanceof ProviderError) {
      return { ok: false, status: 502, code: err.code, message: err.message };
    }
    throw err;
  }

  deleteSshKeyRow(keyId);

  return { ok: true, data: { status: "deleted" } };
}
