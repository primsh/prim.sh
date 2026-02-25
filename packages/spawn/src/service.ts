import { randomBytes } from "node:crypto";
import {
  insertServer,
  getServerById,
  getServersByOwner,
  countServersByOwner,
  updateServerStatus,
  updateServerTypeAndImage,
  insertSshKey,
  getSshKeyById,
  getSshKeysByOwner,
  deleteSshKeyRow,
} from "./db.ts";
import {
  createHetznerServer,
  deleteHetznerServer,
  powerOnServer,
  shutdownServer,
  rebootServer as rebootHetznerServer,
  changeServerType,
  rebuildServer as rebuildHetznerServer,
  createHetznerSshKey,
  deleteHetznerSshKey,
  HetznerError,
} from "./hetzner.ts";
import type {
  CreateServerRequest,
  CreateServerResponse,
  ServerListResponse,
  ServerResponse,
  DeleteServerResponse,
  ActionOnlyResponse,
  ResizeRequest,
  ResizeResponse,
  RebuildRequest,
  RebuildResponse,
  CreateSshKeyRequest,
  SshKeyResponse,
  SshKeyListResponse,
} from "./api.ts";
import { SPAWN_SERVER_TYPES, SPAWN_IMAGES, SPAWN_LOCATIONS } from "./api.ts";
import type { ServerRow, SshKeyRow } from "./db.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────

function generateSshKeyId(): string {
  return `sk_${randomBytes(4).toString("hex")}`;
}

function rowToSshKeyResponse(row: SshKeyRow): SshKeyResponse {
  return {
    id: row.id,
    hetzner_id: row.hetzner_id,
    name: row.name,
    fingerprint: row.fingerprint,
    owner_wallet: row.owner_wallet,
    created_at: new Date(row.created_at).toISOString(),
  };
}

function mapActionResponse(action: { id: number; command: string; status: string; started: string; finished: string | null }) {
  return {
    id: action.id,
    command: action.command,
    status: action.status,
    started_at: action.started,
    finished_at: action.finished,
  };
}

// ─── Constants ────────────────────────────────────────────────────────────

const HETZNER_TYPE_MAP: Record<string, string> = {
  small: "cx23",
  medium: "cx33",
  large: "cx43",
  "arm-small": "cax11",
};

// Daily burn rates in USDC (as decimal strings)
const DAILY_BURN_MAP: Record<string, string> = {
  small: "0.15",
  medium: "0.22",
  large: "0.40",
  "arm-small": "0.16",
};

// Upfront deposit charged per server creation (in USDC)
const CREATION_DEPOSIT = "0.01";

// ─── Helpers ──────────────────────────────────────────────────────────────

function generateServerId(): string {
  return `srv_${randomBytes(4).toString("hex")}`;
}

function rowToServerResponse(row: ServerRow): ServerResponse {
  return {
    id: row.id,
    hetzner_id: row.hetzner_id,
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

type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string };

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

  // Validate type
  if (!SPAWN_SERVER_TYPES.includes(request.type)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: `Invalid server type. Must be one of: ${SPAWN_SERVER_TYPES.join(", ")}`,
    };
  }

  // Validate image
  if (!SPAWN_IMAGES.includes(request.image)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: `Invalid image. Must be one of: ${SPAWN_IMAGES.join(", ")}`,
    };
  }

  // Validate location
  if (!SPAWN_LOCATIONS.includes(request.location)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: `Invalid location. Must be one of: ${SPAWN_LOCATIONS.join(", ")}`,
    };
  }

  const spawnId = generateServerId();
  const hetznerType = HETZNER_TYPE_MAP[request.type];
  const dailyBurn = DAILY_BURN_MAP[request.type];

  try {
    const hetznerResult = await createHetznerServer({
      name: request.name,
      server_type: hetznerType,
      image: request.image,
      location: request.location,
      ssh_keys: request.ssh_keys,
      labels: { wallet: callerWallet },
      user_data: request.user_data,
    });

    const { server: hs, action: ha } = hetznerResult;

    insertServer({
      id: spawnId,
      hetzner_id: hs.id,
      owner_wallet: callerWallet,
      name: request.name,
      type: request.type,
      image: request.image,
      location: request.location,
      status: "initializing",
      public_ipv4: hs.public_net?.ipv4?.ip ?? null,
      public_ipv6: hs.public_net?.ipv6?.ip ?? null,
      deposit_charged: CREATION_DEPOSIT,
      deposit_daily_burn: dailyBurn,
    });

    const row = getServerById(spawnId);
    if (!row) throw new Error("Failed to retrieve server after insert");

    return {
      ok: true,
      data: {
        server: rowToServerResponse(row),
        action: {
          id: ha.id,
          command: ha.command,
          status: ha.status,
          started_at: ha.started,
          finished_at: ha.finished,
        },
        deposit_charged: CREATION_DEPOSIT,
        deposit_remaining: "0.00",
      },
    };
  } catch (err) {
    if (err instanceof HetznerError) {
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

export function listServers(
  callerWallet: string,
  limit: number,
  page: number,
): ServerListResponse {
  const offset = (page - 1) * limit;
  const rows = getServersByOwner(callerWallet, limit, offset);
  const total = countServersByOwner(callerWallet);

  return {
    servers: rows.map(rowToServerResponse),
    meta: {
      page,
      per_page: limit,
      total,
    },
  };
}

export function getServer(
  serverId: string,
  callerWallet: string,
): ServiceResult<ServerResponse> {
  const check = checkServerOwnership(serverId, callerWallet);
  if (!check.ok) return check;

  return { ok: true, data: rowToServerResponse(check.row) };
}

export async function deleteServer(
  serverId: string,
  callerWallet: string,
): Promise<ServiceResult<DeleteServerResponse>> {
  const check = checkServerOwnership(serverId, callerWallet);
  if (!check.ok) return check;

  const { row } = check;

  try {
    await deleteHetznerServer(row.hetzner_id);
  } catch (err) {
    if (err instanceof HetznerError) {
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

  // Calculate deposit refund: charged minus accrued burn
  // For SP-2, we record deposit_charged but don't track actual accrued burn yet
  // Refund = 0 since full deposit covers API cost
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
    const result = await powerOnServer(check.row.hetzner_id);
    return { ok: true, data: { action: mapActionResponse(result.action) } };
  } catch (err) {
    if (err instanceof HetznerError) {
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
    const result = await shutdownServer(check.row.hetzner_id);
    return { ok: true, data: { action: mapActionResponse(result.action) } };
  } catch (err) {
    if (err instanceof HetznerError) {
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
    const result = await rebootHetznerServer(check.row.hetzner_id);
    return { ok: true, data: { action: mapActionResponse(result.action) } };
  } catch (err) {
    if (err instanceof HetznerError) {
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

  if (!SPAWN_SERVER_TYPES.includes(request.type)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: `Invalid server type. Must be one of: ${SPAWN_SERVER_TYPES.join(", ")}`,
    };
  }

  const hetznerType = HETZNER_TYPE_MAP[request.type];

  try {
    const result = await changeServerType(check.row.hetzner_id, hetznerType, request.upgrade_disk ?? false);
    updateServerTypeAndImage(serverId, request.type);
    return {
      ok: true,
      data: {
        action: mapActionResponse(result.action),
        new_type: request.type,
        deposit_delta: "0.00",
      },
    };
  } catch (err) {
    if (err instanceof HetznerError) {
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

  if (!SPAWN_IMAGES.includes(request.image)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: `Invalid image. Must be one of: ${SPAWN_IMAGES.join(", ")}`,
    };
  }

  try {
    const result = await rebuildHetznerServer(check.row.hetzner_id, request.image);
    updateServerTypeAndImage(serverId, undefined, request.image);
    return {
      ok: true,
      data: {
        action: mapActionResponse(result.action),
        root_password: result.root_password,
      },
    };
  } catch (err) {
    if (err instanceof HetznerError) {
      return { ok: false, status: 502, code: err.code, message: err.message };
    }
    throw err;
  }
}

// ─── SSH key management ───────────────────────────────────────────────────

export async function registerSshKey(
  request: CreateSshKeyRequest,
  callerWallet: string,
): Promise<ServiceResult<SshKeyResponse>> {
  if (!request.name || !request.public_key) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "name and public_key are required",
    };
  }

  try {
    const hetznerResult = await createHetznerSshKey({
      name: request.name,
      public_key: request.public_key,
      labels: { wallet: callerWallet },
    });

    const { ssh_key: hk } = hetznerResult;
    const skId = generateSshKeyId();

    insertSshKey({
      id: skId,
      hetzner_id: hk.id,
      owner_wallet: callerWallet,
      name: hk.name,
      fingerprint: hk.fingerprint,
    });

    const row = getSshKeyById(skId);
    if (!row) throw new Error("Failed to retrieve ssh key after insert");

    return { ok: true, data: rowToSshKeyResponse(row) };
  } catch (err) {
    if (err instanceof HetznerError) {
      return { ok: false, status: 502, code: err.code, message: err.message };
    }
    throw err;
  }
}

export function listSshKeys(callerWallet: string): SshKeyListResponse {
  const rows = getSshKeysByOwner(callerWallet);
  return { ssh_keys: rows.map(rowToSshKeyResponse) };
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
    await deleteHetznerSshKey(row.hetzner_id);
  } catch (err) {
    if (err instanceof HetznerError) {
      return { ok: false, status: 502, code: err.code, message: err.message };
    }
    throw err;
  }

  deleteSshKeyRow(keyId);

  return { ok: true, data: { status: "deleted" } };
}
