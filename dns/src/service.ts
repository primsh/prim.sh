import type {
  Zone,
  ZoneCreateRequest,
  ZoneCreateResponse,
  ZoneListResponse,
  DnsRecord,
  RecordUpsertRequest,
  RecordUpsertResponse,
  RecordDeleteResponse,
} from "./api.ts";
import {
  type CloudflareZone,
  type CloudflareDnsRecord,
  type CloudflareZoneListResult,
  CloudflareError,
  createZone as createCloudflareZone,
  listZones as listCloudflareZones,
  listDnsRecordsByNameAndType,
  createDnsRecord,
  updateDnsRecord,
  deleteDnsRecord,
} from "./cloudflare.ts";

type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string };

// ─── Mappers ───────────────────────────────────────────────────────────────

function mapZone(zone: CloudflareZone): Zone {
  return {
    id: zone.id,
    name: zone.name,
    status: zone.status,
    name_servers: zone.name_servers ?? [],
    created_at: new Date(zone.created_on).toISOString(),
  };
}

function mapZoneListResult(result: CloudflareZoneListResult): ZoneListResponse {
  return {
    zones: result.result.map(mapZone),
    meta: {
      page: result.result_info.page,
      per_page: result.result_info.per_page,
      total: result.result_info.total_count,
    },
  };
}

function mapRecord(record: CloudflareDnsRecord): DnsRecord {
  return {
    id: record.id,
    zone_id: record.zone_id,
    type: record.type as DnsRecord["type"],
    name: record.name,
    content: record.content,
    ttl: record.ttl,
    proxied: record.proxied ?? false,
    created_at: new Date(record.created_on).toISOString(),
    updated_at: new Date(record.modified_on).toISOString(),
  };
}

// ─── Validation helpers ────────────────────────────────────────────────────

function isValidHostname(name: string): boolean {
  if (name.length === 0 || name.length > 253) return false;
  const labels = name.split(".");
  if (labels.some((label) => label.length === 0 || label.length > 63)) return false;
  if (labels.some((label) => !/^[a-zA-Z0-9-]+$/.test(label))) return false;
  if (labels.some((label) => label.startsWith("-") || label.endsWith("-"))) return false;
  return true;
}

function normalizeTtl(ttl: number | undefined): number | undefined {
  if (ttl === undefined) return undefined;
  if (!Number.isFinite(ttl)) return undefined;
  const value = Math.trunc(ttl);
  if (value === 1) return 1;
  if (value < 60 || value > 86400) return undefined;
  return value;
}

// ─── Service functions ─────────────────────────────────────────────────────

export async function createZone(
  request: ZoneCreateRequest,
  _callerWallet: string,
): Promise<ServiceResult<ZoneCreateResponse>> {
  if (!request.name || !isValidHostname(request.name)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Zone name must be a valid hostname",
    };
  }

  try {
    const zone = await createCloudflareZone({
      name: request.name,
      jump_start: request.jump_start,
      type: request.type,
    });

    return {
      ok: true,
      data: {
        zone: mapZone(zone),
      },
    };
  } catch (err) {
    if (err instanceof CloudflareError) {
      return {
        ok: false,
        status: err.statusCode,
        code: err.code,
        message: err.message,
      };
    }
    throw err;
  }
}

export async function listZones(
  _callerWallet: string,
  page: number,
  perPage: number,
): Promise<ZoneListResponse> {
  const safePage = Math.max(page || 1, 1);
  const safePerPage = Math.min(Math.max(perPage || 20, 1), 100);
  const result = await listCloudflareZones(safePage, safePerPage);
  return mapZoneListResult(result);
}

export async function upsertRecord(
  zoneId: string,
  request: RecordUpsertRequest,
  _callerWallet: string,
): Promise<ServiceResult<RecordUpsertResponse>> {
  if (!zoneId) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "zoneId is required",
    };
  }

  if (!request.name || !isValidHostname(request.name)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Record name must be a valid hostname",
    };
  }

  if (!request.type) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Record type is required",
    };
  }

  if (!request.content) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Record content is required",
    };
  }

  const ttl = normalizeTtl(request.ttl);
  if (request.ttl !== undefined && ttl === undefined) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "ttl must be 1 (automatic) or between 60 and 86400 seconds",
    };
  }

  try {
    const existing = await listDnsRecordsByNameAndType(zoneId, request.name, request.type);
    const basePayload = {
      type: request.type,
      name: request.name,
      content: request.content,
      ttl: ttl,
      proxied: request.proxied,
    };

    if (existing.result.length > 0) {
      const record = await updateDnsRecord(zoneId, existing.result[0].id, basePayload);
      return {
        ok: true,
        data: {
          record: mapRecord(record),
          action: "updated",
        },
      };
    }

    const created = await createDnsRecord(zoneId, basePayload);
    return {
      ok: true,
      data: {
        record: mapRecord(created),
        action: "created",
      },
    };
  } catch (err) {
    if (err instanceof CloudflareError) {
      return {
        ok: false,
        status: err.statusCode,
        code: err.code,
        message: err.message,
      };
    }
    throw err;
  }
}

export async function deleteRecord(
  zoneId: string,
  recordId: string,
  _callerWallet: string,
): Promise<ServiceResult<RecordDeleteResponse>> {
  if (!zoneId || !recordId) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "zoneId and recordId are required",
    };
  }

  try {
    await deleteDnsRecord(zoneId, recordId);
    return {
      ok: true,
      data: {
        id: recordId,
        status: "deleted",
      },
    };
  } catch (err) {
    if (err instanceof CloudflareError) {
      return {
        ok: false,
        status: err.statusCode,
        code: err.code,
        message: err.message,
      };
    }
    throw err;
  }
}

