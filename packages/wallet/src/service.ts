import { randomBytes } from "node:crypto";
import { isAddress, getAddress, verifyMessage } from "viem";
import { getNetworkConfig } from "@primsh/x402-middleware";
import {
  insertWallet,
  getWalletByAddress,
  getWalletsByOwner,
  deactivateWallet as dbDeactivateWallet,
  insertFundRequest,
  getFundRequestById,
  getFundRequestsByWallet,
  updateFundRequestStatus,
  getPolicy,
  upsertPolicy,
  setPauseState,
  resetDailySpentIfNeeded,
} from "./db.ts";
import type {
  WalletRegisterRequest,
  WalletRegisterResponse,
  WalletListResponse,
  WalletDetailResponse,
  WalletDeactivateResponse,
  FundRequestCreateRequest,
  FundRequestResponse,
  FundRequestListResponse,
  FundRequestApproveResponse,
  FundRequestDenyResponse,
  PolicyResponse,
  PolicyUpdateRequest,
  PauseScope,
  PauseResponse,
  ResumeResponse,
} from "./api.ts";
import { getUsdcBalance } from "./balance.ts";

const DEFAULT_CHAIN = "eip155:8453";
const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Builds the canonical message agents must sign for registration.
 * Address is always checksummed via getAddress() before inclusion.
 */
function buildRegistrationMessage(address: string, timestamp: string): string {
  return `Register ${getAddress(address)} with prim.sh at ${timestamp}`;
}

type RegisterResult =
  | { ok: true; data: WalletRegisterResponse }
  | { ok: false; status: number; code: string; message: string };

export async function registerWallet(request: WalletRegisterRequest): Promise<RegisterResult> {
  const { address, signature, timestamp, chain, label } = request;

  // 1. Validate address
  if (!address || !isAddress(address)) {
    return { ok: false, status: 400, code: "invalid_request", message: "Invalid Ethereum address" };
  }

  const normalizedAddress = getAddress(address);

  // 2. Check timestamp freshness
  const ts = new Date(timestamp);
  if (Number.isNaN(ts.getTime())) {
    return { ok: false, status: 400, code: "invalid_request", message: "Invalid timestamp" };
  }
  const age = Date.now() - ts.getTime();
  if (age > SIGNATURE_MAX_AGE_MS || age < -SIGNATURE_MAX_AGE_MS) {
    return { ok: false, status: 400, code: "signature_expired", message: "Signature timestamp expired (>5 minutes)" };
  }

  // 3. Verify EIP-191 signature
  const message = buildRegistrationMessage(normalizedAddress, timestamp);
  let valid: boolean;
  try {
    valid = await verifyMessage({ address: normalizedAddress, message, signature: signature as `0x${string}` });
  } catch {
    valid = false;
  }
  if (!valid) {
    return { ok: false, status: 403, code: "invalid_signature", message: "Signature verification failed" };
  }

  // 4. Check for existing registration
  const existing = getWalletByAddress(normalizedAddress);
  if (existing && !existing.deactivated_at) {
    return { ok: false, status: 409, code: "already_registered", message: "Wallet already registered" };
  }

  // 5. Insert wallet
  const effectiveChain = chain ?? DEFAULT_CHAIN;
  insertWallet({ address: normalizedAddress, chain: effectiveChain, createdBy: normalizedAddress, label });

  return {
    ok: true,
    data: {
      address: normalizedAddress,
      chain: effectiveChain,
      label: label ?? null,
      registeredAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    },
  };
}

export async function listWallets(owner: string, limit: number, after?: string): Promise<WalletListResponse> {
  const rows = getWalletsByOwner(owner, limit, after);
  const activeRows = rows.filter((r) => !r.deactivated_at);

  const wallets = await Promise.all(
    activeRows.map(async (r) => {
      const { balance, funded } = await getUsdcBalance(r.address as `0x${string}`);
      const policy = getPolicy(r.address);
      const paused = policy !== null && policy.pause_scope !== null;
      return {
        address: r.address,
        chain: r.chain,
        balance,
        funded,
        paused,
        createdAt: new Date(r.created_at).toISOString(),
      };
    }),
  );

  const lastRow = rows[rows.length - 1];
  const cursor = rows.length === limit && lastRow ? lastRow.address : null;

  return { wallets, cursor };
}

type OwnershipCheckResult =
  | { ok: true; row: NonNullable<ReturnType<typeof getWalletByAddress>> }
  | { ok: false; status: 403 | 404; code: string; message: string };

function checkOwnership(address: string, caller: string): OwnershipCheckResult {
  const row = getWalletByAddress(address);

  if (!row) {
    return { ok: false, status: 404, code: "not_found", message: "Wallet not found" };
  }

  // Deactivated wallets are invisible
  if (row.deactivated_at) {
    return { ok: false, status: 404, code: "not_found", message: "Wallet not found" };
  }

  // Owned by someone else
  if (row.created_by !== caller) {
    return { ok: false, status: 403, code: "forbidden", message: "Forbidden" };
  }

  return { ok: true, row };
}

export async function getWallet(
  address: string,
  caller: string,
): Promise<{ ok: true; data: WalletDetailResponse } | { ok: false; status: 403 | 404; code: string; message: string }> {
  const check = checkOwnership(address, caller);
  if (!check.ok) return check;

  const { row } = check;
  const { balance, funded } = await getUsdcBalance(row.address as `0x${string}`);
  const policyRow = getPolicy(row.address);
  const paused = policyRow !== null && policyRow.pause_scope !== null;

  // Build SpendingPolicy from row if present
  let spendingPolicy = null;
  if (policyRow) {
    resetDailySpentIfNeeded(row.address);
    const refreshed = getPolicy(row.address) ?? policyRow;
    spendingPolicy = {
      maxPerTx: refreshed.max_per_tx,
      maxPerDay: refreshed.max_per_day,
      dailySpent: refreshed.daily_spent,
      dailyResetAt: refreshed.daily_reset_at,
    };
  }

  return {
    ok: true,
    data: {
      address: row.address,
      chain: row.chain,
      balance,
      funded,
      paused,
      createdBy: row.created_by,
      policy: spendingPolicy,
      createdAt: new Date(row.created_at).toISOString(),
    },
  };
}

export function deactivateWallet(
  address: string,
  caller: string,
): { ok: true; data: WalletDeactivateResponse } | { ok: false; status: 403 | 404; code: string; message: string } {
  const check = checkOwnership(address, caller);
  if (!check.ok) return check;

  dbDeactivateWallet(address);
  const deactivatedAt = new Date().toISOString();

  return {
    ok: true,
    data: {
      address,
      deactivated: true,
      deactivatedAt,
    },
  };
}

// ─── Fund request functions ──────────────────────────────────────────────

type FundRequestResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string };

function fundRequestToResponse(row: import("./db.ts").FundRequestRow): FundRequestResponse {
  return {
    id: row.id,
    walletAddress: row.wallet_address,
    amount: row.amount,
    reason: row.reason,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export function createFundRequest(
  walletAddress: string,
  request: FundRequestCreateRequest,
  caller: string,
): FundRequestResult<FundRequestResponse> {
  const check = checkOwnership(walletAddress, caller);
  if (!check.ok) return check;

  const amountNum = Number.parseFloat(request.amount);
  if (Number.isNaN(amountNum) || amountNum <= 0) {
    return { ok: false, status: 400, code: "invalid_request", message: "amount must be a positive decimal string" };
  }
  if (!request.reason || request.reason.trim() === "") {
    return { ok: false, status: 400, code: "invalid_request", message: "reason must be non-empty" };
  }

  const id = `fr_${randomBytes(4).toString("hex")}`;
  insertFundRequest({ id, walletAddress, amount: request.amount, reason: request.reason, createdBy: caller });

  const row = getFundRequestById(id);
  if (!row) {
    return { ok: false, status: 500, code: "internal_error", message: "Failed to create fund request" };
  }

  return { ok: true, data: fundRequestToResponse(row) };
}

export function listFundRequests(
  walletAddress: string,
  caller: string,
  limit: number,
  after?: string,
): FundRequestResult<FundRequestListResponse> {
  const check = checkOwnership(walletAddress, caller);
  if (!check.ok) return check;

  const rows = getFundRequestsByWallet(walletAddress, limit, after);
  const lastRow = rows[rows.length - 1];
  const cursor = rows.length === limit && lastRow ? lastRow.id : null;

  return {
    ok: true,
    data: {
      requests: rows.map(fundRequestToResponse),
      cursor,
    },
  };
}

export function approveFundRequest(
  requestId: string,
  caller: string,
): FundRequestResult<FundRequestApproveResponse> {
  const req = getFundRequestById(requestId);
  if (!req) {
    return { ok: false, status: 404, code: "not_found", message: "Fund request not found" };
  }
  if (req.status !== "pending") {
    return { ok: false, status: 409, code: "conflict", message: `Fund request is already ${req.status}` };
  }

  // Verify caller owns the wallet
  const check = checkOwnership(req.wallet_address, caller);
  if (!check.ok) return check;

  // Non-custodial: mark as approved, return funding details for human to send directly
  updateFundRequestStatus(requestId, "approved");

  const netConfig = getNetworkConfig();
  const approvedAt = new Date().toISOString();
  return {
    ok: true,
    data: {
      id: requestId,
      status: "approved",
      fundingAddress: req.wallet_address,
      amount: req.amount,
      chain: netConfig.network,
      approvedAt,
    },
  };
}

export function denyFundRequest(
  requestId: string,
  caller: string,
  reason?: string,
): FundRequestResult<FundRequestDenyResponse> {
  const req = getFundRequestById(requestId);
  if (!req) {
    return { ok: false, status: 404, code: "not_found", message: "Fund request not found" };
  }
  if (req.status !== "pending") {
    return { ok: false, status: 409, code: "conflict", message: `Fund request is already ${req.status}` };
  }

  // Verify caller owns the wallet
  const check = checkOwnership(req.wallet_address, caller);
  if (!check.ok) return check;

  updateFundRequestStatus(requestId, "denied", undefined, reason);

  const deniedAt = new Date().toISOString();
  return {
    ok: true,
    data: { id: requestId, status: "denied", reason: reason ?? null, deniedAt },
  };
}

// ─── Policy + pause/resume service functions ─────────────────────────────

type PolicyResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string };

function policyRowToResponse(walletAddress: string, row: ReturnType<typeof getPolicy>): PolicyResponse {
  return {
    walletAddress,
    maxPerTx: row?.max_per_tx ?? null,
    maxPerDay: row?.max_per_day ?? null,
    allowedPrimitives: row?.allowed_primitives ? (JSON.parse(row.allowed_primitives) as string[]) : null,
    dailySpent: row?.daily_spent ?? "0.00",
    dailyResetAt: row?.daily_reset_at ?? new Date(Date.now() + 86400000).toISOString(),
  };
}

export function getSpendingPolicy(
  address: string,
  caller: string,
): PolicyResult<PolicyResponse> {
  const check = checkOwnership(address, caller);
  if (!check.ok) return check;

  resetDailySpentIfNeeded(address);
  const row = getPolicy(address);
  return { ok: true, data: policyRowToResponse(address, row) };
}

export function updateSpendingPolicy(
  address: string,
  caller: string,
  updates: PolicyUpdateRequest,
): PolicyResult<PolicyResponse> {
  const check = checkOwnership(address, caller);
  if (!check.ok) return check;

  if (updates.maxPerTx !== undefined && updates.maxPerTx !== null) {
    const v = Number.parseFloat(updates.maxPerTx);
    if (Number.isNaN(v) || v <= 0) {
      return { ok: false, status: 400, code: "invalid_request", message: "maxPerTx must be a positive decimal" };
    }
  }
  if (updates.maxPerDay !== undefined && updates.maxPerDay !== null) {
    const v = Number.parseFloat(updates.maxPerDay);
    if (Number.isNaN(v) || v <= 0) {
      return { ok: false, status: 400, code: "invalid_request", message: "maxPerDay must be a positive decimal" };
    }
  }

  const dbUpdates: Parameters<typeof upsertPolicy>[1] = {};
  if ("maxPerTx" in updates) dbUpdates.max_per_tx = updates.maxPerTx ?? null;
  if ("maxPerDay" in updates) dbUpdates.max_per_day = updates.maxPerDay ?? null;
  if ("allowedPrimitives" in updates) {
    dbUpdates.allowed_primitives = updates.allowedPrimitives ? JSON.stringify(updates.allowedPrimitives) : null;
  }

  upsertPolicy(address, dbUpdates);
  const row = getPolicy(address);
  return { ok: true, data: policyRowToResponse(address, row) };
}

export function pauseWallet(
  address: string,
  caller: string,
  scope: PauseScope,
): PolicyResult<PauseResponse> {
  const check = checkOwnership(address, caller);
  if (!check.ok) return check;

  const pausedAt = new Date().toISOString();
  setPauseState(address, scope, pausedAt);

  return {
    ok: true,
    data: { walletAddress: address, paused: true, scope, pausedAt },
  };
}

export function resumeWallet(
  address: string,
  caller: string,
  scope: PauseScope,
): PolicyResult<ResumeResponse> {
  const check = checkOwnership(address, caller);
  if (!check.ok) return check;

  setPauseState(address, null, null);

  return {
    ok: true,
    data: { walletAddress: address, paused: false, scope, resumedAt: new Date().toISOString() },
  };
}
