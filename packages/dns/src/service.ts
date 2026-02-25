import { randomBytes } from "node:crypto";
import {
  insertZone,
  getZoneById,
  getZoneByDomain,
  getZonesByOwner,
  countZonesByOwner,
  deleteZoneRow,
  insertRecord,
  getRecordById,
  getRecordsByZone,
  updateRecordRow,
  deleteRecordRow,
  deleteRecordsByZone,
} from "./db.ts";
import {
  CloudflareError,
  createZone as cfCreateZone,
  deleteZone as cfDeleteZone,
  createDnsRecord as cfCreateRecord,
  updateDnsRecord as cfUpdateRecord,
  deleteDnsRecord as cfDeleteRecord,
} from "./cloudflare.ts";
import type {
  ZoneResponse,
  ZoneListResponse,
  CreateZoneRequest,
  CreateZoneResponse,
  RecordResponse,
  RecordListResponse,
  CreateRecordRequest,
  UpdateRecordRequest,
  RecordType,
} from "./api.ts";
import type { ZoneRow, RecordRow } from "./db.ts";

// ─── Constants ───────────────────────────────────────────────────────────

const VALID_RECORD_TYPES: RecordType[] = ["A", "AAAA", "CNAME", "MX", "TXT", "SRV", "CAA", "NS"];

// ─── Helpers ─────────────────────────────────────────────────────────────

function generateZoneId(): string {
  return `z_${randomBytes(4).toString("hex")}`;
}

function generateRecordId(): string {
  return `r_${randomBytes(4).toString("hex")}`;
}

function rowToZoneResponse(row: ZoneRow): ZoneResponse {
  return {
    id: row.id,
    domain: row.domain,
    status: row.status as ZoneResponse["status"],
    name_servers: JSON.parse(row.nameservers) as string[],
    owner_wallet: row.owner_wallet,
    created_at: new Date(row.created_at).toISOString(),
  };
}

function rowToRecordResponse(row: RecordRow): RecordResponse {
  return {
    id: row.id,
    zone_id: row.zone_id,
    type: row.type as RecordType,
    name: row.name,
    content: row.content,
    ttl: row.ttl,
    proxied: row.proxied === 1,
    priority: row.priority,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
  };
}

// ─── Ownership ───────────────────────────────────────────────────────────

type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string };

type ZoneCheck =
  | { ok: true; row: ZoneRow }
  | { ok: false; status: 403 | 404; code: string; message: string };

function checkZoneOwnership(zoneId: string, caller: string): ZoneCheck {
  const row = getZoneById(zoneId);
  if (!row) {
    return { ok: false, status: 404, code: "not_found", message: "Zone not found" };
  }
  if (row.owner_wallet !== caller) {
    return { ok: false, status: 403, code: "forbidden", message: "Forbidden" };
  }
  return { ok: true, row };
}

// ─── Validation ──────────────────────────────────────────────────────────

function isValidDomain(domain: string): boolean {
  if (!domain || domain.length > 253) return false;
  if (domain.startsWith("http://") || domain.startsWith("https://")) return false;
  if (domain.endsWith(".")) return false;
  if (!domain.includes(".")) return false;
  const labels = domain.split(".");
  return labels.every(
    (label) => label.length > 0 && label.length <= 63 && /^[a-zA-Z0-9-]+$/.test(label) && !label.startsWith("-") && !label.endsWith("-"),
  );
}

// ─── Zone service ────────────────────────────────────────────────────────

export async function createZone(
  request: CreateZoneRequest,
  callerWallet: string,
): Promise<ServiceResult<CreateZoneResponse>> {
  if (!isValidDomain(request.domain)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Invalid domain format",
    };
  }

  const existing = getZoneByDomain(request.domain);
  if (existing) {
    return {
      ok: false,
      status: 400,
      code: "domain_taken",
      message: "Domain already registered",
    };
  }

  try {
    const cfZone = await cfCreateZone(request.domain);
    const zoneId = generateZoneId();

    insertZone({
      id: zoneId,
      cloudflare_id: cfZone.id,
      domain: request.domain,
      owner_wallet: callerWallet,
      status: cfZone.status,
      nameservers: cfZone.name_servers ?? [],
    });

    const row = getZoneById(zoneId);
    if (!row) throw new Error("Failed to retrieve zone after insert");

    return { ok: true, data: { zone: rowToZoneResponse(row) } };
  } catch (err) {
    if (err instanceof CloudflareError) {
      return { ok: false, status: err.statusCode, code: err.code, message: err.message };
    }
    throw err;
  }
}

export function listZones(
  callerWallet: string,
  limit: number,
  page: number,
): ZoneListResponse {
  const offset = (page - 1) * limit;
  const rows = getZonesByOwner(callerWallet, limit, offset);
  const total = countZonesByOwner(callerWallet);

  return {
    zones: rows.map(rowToZoneResponse),
    meta: { page, per_page: limit, total },
  };
}

export function getZone(
  zoneId: string,
  callerWallet: string,
): ServiceResult<ZoneResponse> {
  const check = checkZoneOwnership(zoneId, callerWallet);
  if (!check.ok) return check;
  return { ok: true, data: rowToZoneResponse(check.row) };
}

export async function deleteZone(
  zoneId: string,
  callerWallet: string,
): Promise<ServiceResult<{ status: "deleted" }>> {
  const check = checkZoneOwnership(zoneId, callerWallet);
  if (!check.ok) return check;

  try {
    await cfDeleteZone(check.row.cloudflare_id);
  } catch (err) {
    if (err instanceof CloudflareError) {
      return { ok: false, status: err.statusCode, code: err.code, message: err.message };
    }
    throw err;
  }

  deleteRecordsByZone(zoneId);
  deleteZoneRow(zoneId);

  return { ok: true, data: { status: "deleted" } };
}

// ─── Record service ──────────────────────────────────────────────────────

export async function createRecord(
  zoneId: string,
  request: CreateRecordRequest,
  callerWallet: string,
): Promise<ServiceResult<RecordResponse>> {
  const check = checkZoneOwnership(zoneId, callerWallet);
  if (!check.ok) return check;

  if (!request.type || !VALID_RECORD_TYPES.includes(request.type)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: `Invalid record type. Must be one of: ${VALID_RECORD_TYPES.join(", ")}`,
    };
  }

  if (!request.name) {
    return { ok: false, status: 400, code: "invalid_request", message: "Record name is required" };
  }

  if (!request.content) {
    return { ok: false, status: 400, code: "invalid_request", message: "Record content is required" };
  }

  if (request.type === "MX" && request.priority === undefined) {
    return { ok: false, status: 400, code: "invalid_request", message: "MX records require a priority" };
  }

  const ttl = request.ttl ?? 3600;

  try {
    const cfRecord = await cfCreateRecord(check.row.cloudflare_id, {
      type: request.type,
      name: request.name,
      content: request.content,
      ttl,
      proxied: request.proxied ?? false,
      priority: request.priority,
    });

    const recordId = generateRecordId();

    insertRecord({
      id: recordId,
      cloudflare_id: cfRecord.id,
      zone_id: zoneId,
      type: request.type,
      name: cfRecord.name,
      content: cfRecord.content,
      ttl: cfRecord.ttl,
      proxied: cfRecord.proxied ?? false,
      priority: cfRecord.priority ?? null,
    });

    const row = getRecordById(recordId);
    if (!row) throw new Error("Failed to retrieve record after insert");

    return { ok: true, data: rowToRecordResponse(row) };
  } catch (err) {
    if (err instanceof CloudflareError) {
      return { ok: false, status: err.statusCode, code: err.code, message: err.message };
    }
    throw err;
  }
}

export function listRecords(
  zoneId: string,
  callerWallet: string,
): ServiceResult<RecordListResponse> {
  const check = checkZoneOwnership(zoneId, callerWallet);
  if (!check.ok) return check;

  const rows = getRecordsByZone(zoneId);
  return { ok: true, data: { records: rows.map(rowToRecordResponse) } };
}

export function getRecord(
  zoneId: string,
  recordId: string,
  callerWallet: string,
): ServiceResult<RecordResponse> {
  const check = checkZoneOwnership(zoneId, callerWallet);
  if (!check.ok) return check;

  const row = getRecordById(recordId);
  if (!row || row.zone_id !== zoneId) {
    return { ok: false, status: 404, code: "not_found", message: "Record not found" };
  }

  return { ok: true, data: rowToRecordResponse(row) };
}

export async function updateRecord(
  zoneId: string,
  recordId: string,
  request: UpdateRecordRequest,
  callerWallet: string,
): Promise<ServiceResult<RecordResponse>> {
  const check = checkZoneOwnership(zoneId, callerWallet);
  if (!check.ok) return check;

  const row = getRecordById(recordId);
  if (!row || row.zone_id !== zoneId) {
    return { ok: false, status: 404, code: "not_found", message: "Record not found" };
  }

  if (request.type && !VALID_RECORD_TYPES.includes(request.type)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: `Invalid record type. Must be one of: ${VALID_RECORD_TYPES.join(", ")}`,
    };
  }

  const updatedType = request.type ?? row.type;
  const updatedName = request.name ?? row.name;
  const updatedContent = request.content ?? row.content;
  const updatedTtl = request.ttl ?? row.ttl;
  const updatedProxied = request.proxied ?? (row.proxied === 1);
  const updatedPriority = request.priority ?? row.priority;

  try {
    const cfRecord = await cfUpdateRecord(check.row.cloudflare_id, row.cloudflare_id, {
      type: updatedType,
      name: updatedName,
      content: updatedContent,
      ttl: updatedTtl,
      proxied: updatedProxied,
      priority: updatedPriority ?? undefined,
    });

    updateRecordRow(recordId, {
      cloudflare_id: cfRecord.id,
      type: cfRecord.type,
      name: cfRecord.name,
      content: cfRecord.content,
      ttl: cfRecord.ttl,
      proxied: cfRecord.proxied ?? false,
      priority: cfRecord.priority ?? null,
    });

    const updated = getRecordById(recordId);
    if (!updated) throw new Error("Failed to retrieve record after update");

    return { ok: true, data: rowToRecordResponse(updated) };
  } catch (err) {
    if (err instanceof CloudflareError) {
      return { ok: false, status: err.statusCode, code: err.code, message: err.message };
    }
    throw err;
  }
}

export async function deleteRecord(
  zoneId: string,
  recordId: string,
  callerWallet: string,
): Promise<ServiceResult<{ status: "deleted" }>> {
  const check = checkZoneOwnership(zoneId, callerWallet);
  if (!check.ok) return check;

  const row = getRecordById(recordId);
  if (!row || row.zone_id !== zoneId) {
    return { ok: false, status: 404, code: "not_found", message: "Record not found" };
  }

  try {
    await cfDeleteRecord(check.row.cloudflare_id, row.cloudflare_id);
  } catch (err) {
    if (err instanceof CloudflareError) {
      return { ok: false, status: err.statusCode, code: err.code, message: err.message };
    }
    throw err;
  }

  deleteRecordRow(recordId);

  return { ok: true, data: { status: "deleted" } };
}
