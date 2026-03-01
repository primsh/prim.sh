import { randomBytes } from "node:crypto";
import { createLogger } from "@primsh/x402-middleware";
import type { PaginatedList } from "@primsh/x402-middleware";

const log = createLogger("domain.sh");
import type {
  ActivateResponse,
  BatchRecordsRequest,
  BatchRecordsResponse,
  ConfigureNsResponse,
  CreateRecordRequest,
  CreateZoneRequest,
  CreateZoneResponse,
  DomainSearchResponse,
  MailSetupRecordResult,
  MailSetupRequest,
  MailSetupResponse,
  QuoteRequest,
  QuoteResponse,
  RecordResponse,
  RecordType,
  RecoverResponse,
  RegisterResponse,
  RegistrationStatusResponse,
  UpdateRecordRequest,
  VerifyResponse,
  ZoneResponse,
  ZoneStatus,
} from "./api.ts";
import {
  CloudflareError,
  batchDnsRecords as cfBatchDnsRecords,
  createDnsRecord as cfCreateRecord,
  createZone as cfCreateZone,
  deleteDnsRecord as cfDeleteRecord,
  deleteZone as cfDeleteZone,
  getZone as cfGetZone,
  listDnsRecords as cfListDnsRecords,
  triggerActivationCheck as cfTriggerActivationCheck,
  updateDnsRecord as cfUpdateRecord,
} from "./cloudflare.ts";
import type { CfBatchResult, CfDnsRecord } from "./cloudflare.ts";
import {
  countZonesByOwner,
  deleteRecordRow,
  deleteRecordsByZone,
  deleteZoneRow,
  getQuoteById,
  getRecordByCloudflareId,
  getRecordById,
  getRecordsByZone,
  getRegistrationByDomain,
  getRegistrationByRecoveryToken,
  getZoneByDomain,
  getZoneById,
  getZonesByOwner,
  insertQuote,
  insertRecord,
  insertRegistration,
  insertZone,
  runInTransaction,
  updateRecordRow,
  updateRegistration,
  updateZoneStatus,
} from "./db.ts";
import type { RecordRow, ZoneRow } from "./db.ts";
import { verifyNameservers, verifyRecords } from "./dns-verify.ts";
import { NameSiloError, getRegistrar } from "./namesilo.ts";

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
    (label) =>
      label.length > 0 &&
      label.length <= 63 &&
      /^[a-zA-Z0-9-]+$/.test(label) &&
      !label.startsWith("-") &&
      !label.endsWith("-"),
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

export function listZones(callerWallet: string, limit: number, page: number): PaginatedList<ZoneResponse> {
  const offset = (page - 1) * limit;
  const rows = getZonesByOwner(callerWallet, limit, offset);
  const total = countZonesByOwner(callerWallet);

  return {
    data: rows.map(rowToZoneResponse),
    pagination: {
      total,
      page,
      per_page: limit,
      cursor: null,
      has_more: offset + rows.length < total,
    },
  };
}

export async function refreshZoneStatus(
  zoneId: string,
  callerWallet: string,
): Promise<ServiceResult<ZoneResponse>> {
  const check = checkZoneOwnership(zoneId, callerWallet);
  if (!check.ok) return check;

  // Skip CF call if already active (avoid unnecessary API hits)
  if (check.row.status === "active") {
    return { ok: true, data: rowToZoneResponse(check.row) };
  }

  try {
    const cfZone = await cfGetZone(check.row.cloudflare_id);
    if (cfZone.status !== check.row.status) {
      updateZoneStatus(zoneId, cfZone.status);
    }
    const updatedRow = getZoneById(zoneId);
    if (!updatedRow) throw new Error("Zone not found after status update");
    return { ok: true, data: rowToZoneResponse(updatedRow) };
  } catch (err) {
    if (err instanceof CloudflareError) {
      return { ok: false, status: err.statusCode, code: err.code, message: err.message };
    }
    throw err;
  }
}

export async function getZone(
  zoneId: string,
  callerWallet: string,
): Promise<ServiceResult<ZoneResponse>> {
  const check = checkZoneOwnership(zoneId, callerWallet);
  if (!check.ok) return check;

  // Auto-refresh pending zones — sync with CF for latest activation status
  if (check.row.status === "pending") {
    return refreshZoneStatus(zoneId, callerWallet);
  }

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
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Record content is required",
    };
  }

  if (request.type === "MX" && request.priority === undefined) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "MX records require a priority",
    };
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
): ServiceResult<PaginatedList<RecordResponse>> {
  const check = checkZoneOwnership(zoneId, callerWallet);
  if (!check.ok) return check;

  const rows = getRecordsByZone(zoneId);
  return {
    ok: true,
    data: {
      data: rows.map(rowToRecordResponse),
      pagination: {
        total: rows.length,
        page: 1,
        per_page: rows.length,
        cursor: null,
        has_more: false,
      },
    },
  };
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
  const updatedProxied = request.proxied ?? row.proxied === 1;
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

// ─── Mail setup ───────────────────────────────────────────────────────────

export async function mailSetup(
  zoneId: string,
  request: MailSetupRequest,
  callerWallet: string,
): Promise<ServiceResult<MailSetupResponse>> {
  const check = checkZoneOwnership(zoneId, callerWallet);
  if (!check.ok) return check;

  if (!request.mail_server) {
    return { ok: false, status: 400, code: "invalid_request", message: "mail_server is required" };
  }
  if (!request.mail_server_ip) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "mail_server_ip is required",
    };
  }

  const domain = check.row.domain;
  const cfZoneId = check.row.cloudflare_id;
  const { mail_server, mail_server_ip, dkim } = request;

  // Build record descriptors
  interface RecordSpec {
    type: string;
    name: string;
    content: string;
    ttl: number;
    priority?: number;
    matchFn: (r: CfDnsRecord) => boolean;
  }

  const specs: RecordSpec[] = [
    {
      type: "A",
      name: `mail.${domain}`,
      content: mail_server_ip,
      ttl: 3600,
      matchFn: (r) => r.type === "A" && r.name === `mail.${domain}`,
    },
    {
      type: "MX",
      name: domain,
      content: mail_server,
      ttl: 3600,
      priority: 10,
      matchFn: (r) => r.type === "MX" && r.name === domain && r.priority === 10,
    },
    {
      type: "TXT",
      name: domain,
      content: `v=spf1 a:${mail_server} -all`,
      ttl: 3600,
      matchFn: (r) => r.type === "TXT" && r.name === domain && r.content.startsWith("v=spf1"),
    },
    {
      type: "TXT",
      name: `_dmarc.${domain}`,
      content: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}; pct=100`,
      ttl: 3600,
      matchFn: (r) => r.type === "TXT" && r.name === `_dmarc.${domain}`,
    },
  ];

  if (dkim?.rsa) {
    specs.push({
      type: "TXT",
      name: `${dkim.rsa.selector}._domainkey.${domain}`,
      content: `v=DKIM1; k=rsa; p=${dkim.rsa.public_key}`,
      ttl: 3600,
      matchFn: (r) => r.type === "TXT" && r.name === `${dkim.rsa?.selector}._domainkey.${domain}`,
    });
  }

  if (dkim?.ed25519) {
    specs.push({
      type: "TXT",
      name: `${dkim.ed25519.selector}._domainkey.${domain}`,
      content: `v=DKIM1; k=ed25519; p=${dkim.ed25519.public_key}`,
      ttl: 3600,
      matchFn: (r) =>
        r.type === "TXT" && r.name === `${dkim.ed25519?.selector}._domainkey.${domain}`,
    });
  }

  const results: MailSetupRecordResult[] = [];

  for (const spec of specs) {
    try {
      const existing = await cfListDnsRecords(cfZoneId, { type: spec.type, name: spec.name });
      const match = existing.find(spec.matchFn);

      if (match) {
        // Update existing CF record
        await cfUpdateRecord(cfZoneId, match.id, {
          type: spec.type,
          name: spec.name,
          content: spec.content,
          ttl: spec.ttl,
          ...(spec.priority !== undefined ? { priority: spec.priority } : {}),
        });

        // Sync SQLite: update our row if we track this record
        const primRow = getRecordByCloudflareId(match.id);
        if (primRow) {
          updateRecordRow(primRow.id, {
            content: spec.content,
            ttl: spec.ttl,
            ...(spec.priority !== undefined ? { priority: spec.priority } : {}),
          });
        }

        results.push({ type: spec.type as RecordType, name: spec.name, action: "updated" });
      } else {
        // Create new CF record
        const cfRecord = await cfCreateRecord(cfZoneId, {
          type: spec.type,
          name: spec.name,
          content: spec.content,
          ttl: spec.ttl,
          proxied: false,
          ...(spec.priority !== undefined ? { priority: spec.priority } : {}),
        });

        const recordId = generateRecordId();
        insertRecord({
          id: recordId,
          cloudflare_id: cfRecord.id,
          zone_id: zoneId,
          type: cfRecord.type as RecordType,
          name: cfRecord.name,
          content: cfRecord.content,
          ttl: cfRecord.ttl,
          proxied: cfRecord.proxied ?? false,
          priority: cfRecord.priority ?? null,
        });

        results.push({ type: spec.type as RecordType, name: spec.name, action: "created" });
      }
    } catch (err) {
      if (err instanceof CloudflareError) {
        return { ok: false, status: err.statusCode, code: err.code, message: err.message };
      }
      throw err;
    }
  }

  return { ok: true, data: { records: results } };
}

// ─── Batch record operations ──────────────────────────────────────────────

const MAX_BATCH_OPS = 200;

export async function batchRecords(
  zoneId: string,
  request: BatchRecordsRequest,
  callerWallet: string,
): Promise<ServiceResult<BatchRecordsResponse>> {
  const check = checkZoneOwnership(zoneId, callerWallet);
  if (!check.ok) return check;

  const creates = request.create ?? [];
  const updates = request.update ?? [];
  const deletes = request.delete ?? [];

  const totalOps = creates.length + updates.length + deletes.length;
  if (totalOps === 0) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Batch request must have at least one operation",
    };
  }
  if (totalOps > MAX_BATCH_OPS) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: `Batch request exceeds ${MAX_BATCH_OPS} operation limit`,
    };
  }

  // Validate create entries
  for (const entry of creates) {
    if (!entry.type || !VALID_RECORD_TYPES.includes(entry.type)) {
      return {
        ok: false,
        status: 400,
        code: "invalid_request",
        message: `Invalid record type: ${entry.type}. Must be one of: ${VALID_RECORD_TYPES.join(", ")}`,
      };
    }
    if (!entry.name) {
      return {
        ok: false,
        status: 400,
        code: "invalid_request",
        message: "Record name is required",
      };
    }
    if (!entry.content) {
      return {
        ok: false,
        status: 400,
        code: "invalid_request",
        message: "Record content is required",
      };
    }
    if (entry.type === "MX" && entry.priority === undefined) {
      return {
        ok: false,
        status: 400,
        code: "invalid_request",
        message: "MX records require a priority",
      };
    }
  }

  // Look up update/delete IDs — must exist and belong to this zone
  interface UpdateRowInfo {
    primId: string;
    cfId: string;
    entry: (typeof updates)[0];
  }
  const updateRows: UpdateRowInfo[] = [];
  for (const entry of updates) {
    const row = getRecordById(entry.id);
    if (!row || row.zone_id !== zoneId) {
      return {
        ok: false,
        status: 404,
        code: "not_found",
        message: `Record not found: ${entry.id}`,
      };
    }
    updateRows.push({ primId: entry.id, cfId: row.cloudflare_id, entry });
  }

  interface DeleteRowInfo {
    primId: string;
    cfId: string;
  }
  const deleteRows: DeleteRowInfo[] = [];
  for (const entry of deletes) {
    const row = getRecordById(entry.id);
    if (!row || row.zone_id !== zoneId) {
      return {
        ok: false,
        status: 404,
        code: "not_found",
        message: `Record not found: ${entry.id}`,
      };
    }
    deleteRows.push({ primId: entry.id, cfId: row.cloudflare_id });
  }

  // Build Cloudflare batch request
  const cfPosts = creates.map((e) => ({
    type: e.type,
    name: e.name,
    content: e.content,
    ttl: e.ttl ?? 3600,
    proxied: e.proxied ?? false,
    ...(e.priority !== undefined ? { priority: e.priority } : {}),
  }));

  const cfPatches = updateRows.map(({ cfId, entry }) => {
    const { id: _id, ...fields } = entry;
    return { id: cfId, ...fields };
  });

  const cfDeletes = deleteRows.map(({ cfId }) => ({ id: cfId }));

  // Generate prim IDs for creates upfront so they're available after the transaction
  const createPrimIds = creates.map(() => generateRecordId());

  // Call Cloudflare batch API
  let batchResult: CfBatchResult;
  try {
    batchResult = await cfBatchDnsRecords(check.row.cloudflare_id, {
      ...(cfPosts.length > 0 ? { posts: cfPosts } : {}),
      ...(cfPatches.length > 0 ? { patches: cfPatches } : {}),
      ...(cfDeletes.length > 0 ? { deletes: cfDeletes } : {}),
    });
  } catch (err) {
    if (err instanceof CloudflareError) {
      return { ok: false, status: err.statusCode, code: err.code, message: err.message };
    }
    throw err;
  }

  // Apply SQLite changes in a transaction
  try {
    runInTransaction(() => {
      // Persist created records
      const cfPostResults = batchResult.posts ?? [];
      for (let i = 0; i < cfPostResults.length; i++) {
        const cf = cfPostResults[i];
        insertRecord({
          id: createPrimIds[i],
          cloudflare_id: cf.id,
          zone_id: zoneId,
          type: cf.type,
          name: cf.name,
          content: cf.content,
          ttl: cf.ttl,
          proxied: cf.proxied ?? false,
          priority: cf.priority ?? null,
        });
      }
      // Persist updated records
      for (const cf of batchResult.patches ?? []) {
        const ur = updateRows.find((r) => r.cfId === cf.id);
        if (!ur) continue;
        updateRecordRow(ur.primId, {
          type: cf.type,
          name: cf.name,
          content: cf.content,
          ttl: cf.ttl,
          proxied: cf.proxied ?? false,
          priority: cf.priority ?? null,
        });
      }
      // Remove deleted records
      for (const { primId } of deleteRows) {
        deleteRecordRow(primId);
      }
    });
  } catch (err) {
    log.error("batch SQLite transaction failed after CF batch succeeded", { error: String(err) });
    return {
      ok: false,
      status: 500,
      code: "internal_error",
      message: "Internal error applying batch — CF succeeded but local DB update failed",
    };
  }

  // Read back rows for response
  const createdRows = createPrimIds
    .map((id) => getRecordById(id))
    .filter((r): r is NonNullable<typeof r> => r !== null);
  const updatedRows = updateRows
    .map(({ primId }) => getRecordById(primId))
    .filter((r): r is NonNullable<typeof r> => r !== null);

  return {
    ok: true,
    data: {
      created: createdRows.map(rowToRecordResponse),
      updated: updatedRows.map(rowToRecordResponse),
      deleted: deleteRows.map(({ primId }) => ({ id: primId })),
    },
  };
}

// ─── Money helpers ────────────────────────────────────────────────────────

export function usdToCents(usd: number): number {
  return Math.round(usd * 100);
}

export function centsToAtomicUsdc(cents: number): string {
  return String(BigInt(cents) * 10000n);
}

export function centsToUsd(cents: number): number {
  return cents / 100;
}

const MARGIN_RATE = Number(process.env.DOMAIN_MARGIN_RATE ?? "0.15");
const MARGIN_MIN_CENTS = Number(process.env.DOMAIN_MARGIN_MIN_CENTS ?? "100");
const QUOTE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function generateQuoteId(): string {
  return `q_${randomBytes(4).toString("hex")}`;
}

function generateRegistrationId(): string {
  return `reg_${randomBytes(4).toString("hex")}`;
}

function generateRecoveryToken(): string {
  return `rt_${randomBytes(8).toString("hex")}`;
}

// ─── Quote domain ─────────────────────────────────────────────────────────

export async function quoteDomain(
  request: QuoteRequest,
  callerWallet: string,
): Promise<ServiceResult<QuoteResponse>> {
  if (!isValidDomain(request.domain)) {
    return { ok: false, status: 400, code: "invalid_request", message: "Invalid domain format" };
  }

  const registrar = getRegistrar();
  if (!registrar) {
    return {
      ok: false,
      status: 503,
      code: "registrar_unavailable" as string,
      message: "NAMESILO_API_KEY is not configured",
    };
  }

  const years = request.years ?? 1;
  const results = await registrar.search([request.domain]);
  const info = results[0];

  if (!info?.available || !info.price) {
    return {
      ok: false,
      status: 400,
      code: "domain_taken",
      message: "Domain is not available for registration",
    };
  }

  const registrarCostCents = usdToCents(info.price.register);
  const marginCents = Math.max(MARGIN_MIN_CENTS, Math.round(registrarCostCents * MARGIN_RATE));
  const totalCents = registrarCostCents + marginCents;

  const quoteId = generateQuoteId();
  const expiresAt = Date.now() + QUOTE_TTL_MS;

  insertQuote({
    id: quoteId,
    domain: request.domain,
    years,
    registrar_cost_cents: registrarCostCents,
    margin_cents: marginCents,
    total_cents: totalCents,
    caller_wallet: callerWallet,
    expires_at: expiresAt,
  });

  return {
    ok: true,
    data: {
      quote_id: quoteId,
      domain: request.domain,
      available: true,
      years,
      registrar_cost_usd: centsToUsd(registrarCostCents),
      total_cost_usd: centsToUsd(totalCents),
      currency: "USD",
      expires_at: new Date(expiresAt).toISOString(),
    },
  };
}

// ─── Register domain ──────────────────────────────────────────────────────

export async function registerDomain(
  quoteId: string,
  callerWallet: string,
): Promise<ServiceResult<RegisterResponse>> {
  const quote = getQuoteById(quoteId);
  if (!quote) {
    return { ok: false, status: 404, code: "not_found", message: "Quote not found" };
  }
  if (quote.expires_at < Date.now()) {
    return {
      ok: false,
      status: 410,
      code: "quote_expired",
      message: "Quote has expired — request a new one",
    };
  }

  const existing = getRegistrationByDomain(quote.domain);
  if (existing) {
    return {
      ok: false,
      status: 409,
      code: "domain_taken" as string,
      message: "Domain is already registered",
    };
  }

  const registrar = getRegistrar();
  if (!registrar) {
    return {
      ok: false,
      status: 503,
      code: "registrar_unavailable" as string,
      message: "NAMESILO_API_KEY is not configured",
    };
  }

  // Step 1: NameSilo purchase
  let orderId: string;
  try {
    const result = await registrar.register(quote.domain, quote.years);
    orderId = result.orderId;
  } catch (err) {
    if (err instanceof NameSiloError) {
      const code = err.code === 261 ? "domain_taken" : "registrar_error";
      const status = err.code === 261 ? 400 : 502;
      return { ok: false, status, code, message: err.message };
    }
    throw err;
  }

  const regId = generateRegistrationId();
  const recoveryToken = generateRecoveryToken();

  // Step 2: Insert registration immediately (money is spent)
  insertRegistration({
    id: regId,
    domain: quote.domain,
    quote_id: quoteId,
    recovery_token: recoveryToken,
    namesilo_order_id: orderId,
    zone_id: null,
    ns_configured: false,
    owner_wallet: callerWallet,
    total_cents: quote.total_cents,
  });

  // Step 3: Cloudflare zone creation
  let cfZone: Awaited<ReturnType<typeof cfCreateZone>> | null = null;
  try {
    cfZone = await cfCreateZone(quote.domain);
    const zoneId = generateZoneId();
    insertZone({
      id: zoneId,
      cloudflare_id: cfZone.id,
      domain: quote.domain,
      owner_wallet: callerWallet,
      status: cfZone.status,
      nameservers: cfZone.name_servers ?? [],
    });
    updateRegistration(regId, { zone_id: zoneId });
  } catch {
    // CF failed — return 201 with recovery_token
    return {
      ok: true,
      data: {
        domain: quote.domain,
        registered: true,
        zone_id: null,
        nameservers: null,
        order_amount_usd: centsToUsd(quote.total_cents),
        ns_configured: false,
        recovery_token: recoveryToken,
      },
    };
  }

  // Get the zone we just created to fetch its prim ID and NS
  const zoneRow = getZoneByDomain(quote.domain);
  const nameservers: string[] = zoneRow
    ? (JSON.parse(zoneRow.nameservers) as string[])
    : (cfZone.name_servers ?? []);

  // Step 4: Set Cloudflare nameservers at registrar
  let nsConfigured = false;
  try {
    await registrar.setNameservers(quote.domain, nameservers);
    nsConfigured = true;
    updateRegistration(regId, { ns_configured: true, recovery_token: null });
  } catch {
    // NS failed — zone exists, no recovery_token needed (configure-ns handles retry)
    updateRegistration(regId, { recovery_token: null });
  }

  return {
    ok: true,
    data: {
      domain: quote.domain,
      registered: true,
      zone_id: zoneRow?.id ?? null,
      nameservers,
      order_amount_usd: centsToUsd(quote.total_cents),
      ns_configured: nsConfigured,
      recovery_token: null,
    },
  };
}

// ─── Recover registration ─────────────────────────────────────────────────

export async function recoverRegistration(
  recoveryToken: string,
  callerWallet: string,
): Promise<ServiceResult<RecoverResponse>> {
  const reg = getRegistrationByRecoveryToken(recoveryToken);
  if (!reg) {
    return { ok: false, status: 404, code: "not_found", message: "Recovery token not found" };
  }
  if (reg.owner_wallet !== callerWallet) {
    return { ok: false, status: 403, code: "forbidden", message: "Forbidden" };
  }

  const registrar = getRegistrar();

  // If zone doesn't exist yet, create it
  let zoneId = reg.zone_id;
  let nameservers: string[] = [];

  if (!zoneId) {
    try {
      const cfZone = await cfCreateZone(reg.domain);
      const newZoneId = generateZoneId();
      insertZone({
        id: newZoneId,
        cloudflare_id: cfZone.id,
        domain: reg.domain,
        owner_wallet: reg.owner_wallet,
        status: cfZone.status,
        nameservers: cfZone.name_servers ?? [],
      });
      zoneId = newZoneId;
      nameservers = cfZone.name_servers ?? [];
      updateRegistration(reg.id, { zone_id: zoneId });
    } catch (err) {
      if (err instanceof CloudflareError) {
        return { ok: false, status: err.statusCode, code: err.code, message: err.message };
      }
      throw err;
    }
  } else {
    const zoneRow = getZoneById(zoneId);
    nameservers = zoneRow ? (JSON.parse(zoneRow.nameservers) as string[]) : [];
  }

  // Set nameservers at registrar
  let nsConfigured = reg.ns_configured === 1;
  if (!nsConfigured && registrar) {
    try {
      await registrar.setNameservers(reg.domain, nameservers);
      nsConfigured = true;
      updateRegistration(reg.id, { ns_configured: true, recovery_token: null });
    } catch {
      updateRegistration(reg.id, { recovery_token: null });
    }
  } else if (nsConfigured) {
    updateRegistration(reg.id, { recovery_token: null });
  }

  return {
    ok: true,
    data: {
      domain: reg.domain,
      zone_id: zoneId,
      nameservers,
      ns_configured: nsConfigured,
    },
  };
}

// ─── Configure nameservers ────────────────────────────────────────────────

export async function configureNs(
  domain: string,
  callerWallet: string,
): Promise<ServiceResult<ConfigureNsResponse>> {
  const reg = getRegistrationByDomain(domain);
  if (!reg) {
    return { ok: false, status: 404, code: "not_found", message: "Registration not found" };
  }
  if (reg.owner_wallet !== callerWallet) {
    return { ok: false, status: 403, code: "forbidden", message: "Forbidden" };
  }

  if (!reg.zone_id) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Zone not yet created — use /recover first",
    };
  }

  const zoneRow = getZoneById(reg.zone_id);
  if (!zoneRow) {
    return { ok: false, status: 404, code: "not_found", message: "Zone not found" };
  }

  const nameservers: string[] = JSON.parse(zoneRow.nameservers) as string[];
  const registrar = getRegistrar();
  if (!registrar) {
    return {
      ok: false,
      status: 503,
      code: "registrar_unavailable" as string,
      message: "NAMESILO_API_KEY is not configured",
    };
  }

  try {
    await registrar.setNameservers(domain, nameservers);
  } catch (err) {
    if (err instanceof NameSiloError) {
      return { ok: false, status: 502, code: "registrar_error", message: err.message };
    }
    throw err;
  }

  updateRegistration(reg.id, { ns_configured: true });

  return {
    ok: true,
    data: { domain, nameservers, ns_configured: true },
  };
}

// ─── Zone verification ────────────────────────────────────────────────────

export async function verifyZone(
  zoneId: string,
  callerWallet: string,
): Promise<ServiceResult<VerifyResponse>> {
  const check = checkZoneOwnership(zoneId, callerWallet);
  if (!check.ok) return check;

  const expectedNs: string[] = JSON.parse(check.row.nameservers) as string[];
  const [nsResult, records] = await Promise.all([
    verifyNameservers(check.row.domain, expectedNs),
    Promise.resolve(getRecordsByZone(zoneId)),
  ]);

  const recordResults = await verifyRecords(records, expectedNs);

  const allPropagated = nsResult.propagated && recordResults.every((r) => r.propagated);

  // Refresh zone status from CF if still pending
  let zoneStatus: ZoneStatus = check.row.status as ZoneStatus;
  if (check.row.status === "pending") {
    try {
      const cfZone = await cfGetZone(check.row.cloudflare_id);
      const newStatus = cfZone.status as ZoneStatus;
      if (newStatus !== check.row.status) {
        updateZoneStatus(zoneId, newStatus);
        zoneStatus = newStatus;
      }
    } catch {
      // CF error during status refresh — use existing local status
    }
  }

  return {
    ok: true,
    data: {
      domain: check.row.domain,
      nameservers: nsResult,
      records: recordResults,
      all_propagated: allPropagated,
      zone_status: zoneStatus,
    },
  };
}

// ─── Registration status ──────────────────────────────────────────────────

export async function getRegistrationStatus(
  domain: string,
  callerWallet: string,
): Promise<ServiceResult<RegistrationStatusResponse>> {
  const reg = getRegistrationByDomain(domain);
  if (!reg) {
    return { ok: false, status: 404, code: "not_found", message: "Registration not found" };
  }
  if (reg.owner_wallet !== callerWallet) {
    return { ok: false, status: 403, code: "forbidden", message: "Forbidden" };
  }

  // No CF zone created yet
  if (!reg.zone_id) {
    return {
      ok: true,
      data: {
        domain,
        purchased: true,
        zone_id: null,
        zone_status: null,
        ns_configured_at_registrar: reg.ns_configured === 1,
        ns_propagated: false,
        ns_expected: [],
        ns_actual: [],
        zone_active: false,
        all_ready: false,
        next_action: `call POST /v1/domains/${domain}/recover`,
      },
    };
  }

  const zoneRow = getZoneById(reg.zone_id);
  if (!zoneRow) {
    return { ok: false, status: 404, code: "not_found", message: "Zone not found" };
  }

  const expectedNs: string[] = JSON.parse(zoneRow.nameservers) as string[];

  // Live NS check + zone status refresh (if pending) in parallel
  let zoneStatus: ZoneStatus = zoneRow.status as ZoneStatus;
  const [nsResult] = await Promise.all([
    verifyNameservers(domain, expectedNs),
    (async () => {
      if (zoneRow.status === "pending") {
        try {
          const cfZone = await cfGetZone(zoneRow.cloudflare_id);
          const newStatus = cfZone.status as ZoneStatus;
          if (newStatus !== zoneRow.status) {
            // reg.zone_id is non-null — checked at the top of this function
            updateZoneStatus(reg.zone_id as string, newStatus);
            zoneStatus = newStatus;
          }
        } catch {
          // CF error — use local status
        }
      }
    })(),
  ]);

  const nsConfigured = reg.ns_configured === 1;
  const zoneActive = zoneStatus === "active";
  const allReady = zoneActive; // CF activation is the source of truth

  // Compute next_action per decision table
  let nextAction: string | null = null;
  if (!nsConfigured) {
    nextAction = `call POST /v1/domains/${domain}/configure-ns`;
  } else if (!nsResult.propagated && zoneStatus === "pending") {
    nextAction = "wait for NS propagation";
  } else if (nsResult.propagated && zoneStatus === "pending") {
    nextAction = "wait for Cloudflare activation";
  }
  // zone_status === "active" → nextAction stays null

  return {
    ok: true,
    data: {
      domain,
      purchased: true,
      zone_id: reg.zone_id,
      zone_status: zoneStatus,
      ns_configured_at_registrar: nsConfigured,
      ns_propagated: nsResult.propagated,
      ns_expected: expectedNs,
      ns_actual: nsResult.actual,
      zone_active: zoneActive,
      all_ready: allReady,
      next_action: nextAction,
    },
  };
}

// ─── Zone activation trigger ──────────────────────────────────────────────

export async function activateZone(
  zoneId: string,
  callerWallet: string,
): Promise<ServiceResult<ActivateResponse>> {
  const check = checkZoneOwnership(zoneId, callerWallet);
  if (!check.ok) return check;

  try {
    const cfZone = await cfTriggerActivationCheck(check.row.cloudflare_id);
    if (cfZone.status !== check.row.status) {
      updateZoneStatus(zoneId, cfZone.status);
    }
    const updatedRow = getZoneById(zoneId);
    return {
      ok: true,
      data: {
        zone_id: zoneId,
        status: (updatedRow?.status ?? cfZone.status) as ZoneStatus,
        activation_requested: true,
      },
    };
  } catch (err) {
    if (err instanceof CloudflareError) {
      return { ok: false, status: err.statusCode, code: err.code, message: err.message };
    }
    throw err;
  }
}

// ─── Domain search ────────────────────────────────────────────────────────

const DEFAULT_TLDS = ["com", "net", "org", "io", "dev", "sh"];

export async function searchDomains(
  query: string,
  tlds: string[],
): Promise<ServiceResult<DomainSearchResponse>> {
  const registrar = getRegistrar();
  if (!registrar) {
    return {
      ok: false,
      status: 503,
      code: "registrar_unavailable",
      message: "NAMESILO_API_KEY is not configured — registrar features are unavailable",
    };
  }

  const effectiveTlds = tlds.length > 0 ? tlds : DEFAULT_TLDS;
  const domains = effectiveTlds.map((tld) => `${query}.${tld}`);

  const results = await registrar.search(domains);

  return {
    ok: true,
    data: { results },
  };
}
