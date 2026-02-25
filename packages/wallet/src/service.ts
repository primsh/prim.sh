import { randomBytes, createHash } from "node:crypto";
import { createWalletClient, http, isAddress, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import type { Hex } from "viem";
import { generateWallet, encryptPrivateKey, decryptPrivateKey } from "./keystore.ts";
import {
  insertWallet,
  getWalletByAddress,
  getWalletsByOwner,
  claimWallet as dbClaimWallet,
  deactivateWallet as dbDeactivateWallet,
  getExecution,
  insertExecution,
  completeExecution,
  tryClaim,
  appendEvent,
  insertDeadLetter,
  getExecutionsByWallet,
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
  WalletCreateResponse,
  WalletListResponse,
  WalletDetailResponse,
  WalletDeactivateResponse,
  SendRequest,
  SendResponse,
  HistoryResponse,
  TransactionRecord,
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
import { isPaused } from "./circuit-breaker.ts";
import { checkPolicy, recordSpend } from "./policy.ts";

const DEFAULT_CHAIN = "eip155:8453";

function generateClaimToken(): string {
  return `ctk_${randomBytes(32).toString("hex")}`;
}

export function createWallet(chain?: string): WalletCreateResponse {
  const effectiveChain = chain ?? DEFAULT_CHAIN;
  const { address, privateKey } = generateWallet();
  const encryptedKey = encryptPrivateKey(privateKey);
  const claimToken = generateClaimToken();

  insertWallet({ address, chain: effectiveChain, encryptedKey, claimToken });

  return {
    address,
    chain: effectiveChain,
    balance: "0.00",
    funded: false,
    claimToken,
    createdAt: new Date().toISOString(),
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

  // Unclaimed wallet — must claim first
  if (!row.created_by) {
    return { ok: false, status: 403, code: "forbidden", message: "Wallet not claimed" };
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
      createdBy: row.created_by ?? "",
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

export function claimWallet(address: string, claimToken: string, caller: string): boolean {
  return dbClaimWallet(address, claimToken, caller);
}

const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const USDC_DECIMALS = 6;

const ERC20_TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

function payloadHash(to: string, amount: string): string {
  const canonical = JSON.stringify({ amount, to });
  return createHash("sha256").update(canonical).digest("hex");
}

type SendResult =
  | { ok: true; data: SendResponse }
  | { ok: false; status: number; code: string; message: string };

export async function sendUsdc(
  address: string,
  request: SendRequest,
  caller: string,
): Promise<SendResult> {
  // 0. Circuit breaker check (global override — before everything else)
  if (isPaused("send")) {
    return { ok: false, status: 503, code: "service_paused", message: "Send operations are paused" };
  }

  // 1. Ownership check
  const check = checkOwnership(address, caller);
  if (!check.ok) return check;
  const { row } = check;

  // 1a. Policy check (per-wallet: pause, maxPerTx, maxPerDay)
  const policyResult = checkPolicy(address, request.amount);
  if (!policyResult.ok) {
    const status = policyResult.code === "wallet_paused" ? 403 : 422;
    return { ok: false, status, code: policyResult.code, message: policyResult.message };
  }

  // 2. Idempotency check
  const hash = payloadHash(request.to, request.amount);
  const existing = getExecution(request.idempotencyKey);
  if (existing) {
    if (existing.payload_hash !== hash) {
      return { ok: false, status: 409, code: "duplicate_request", message: "Idempotency key already used with different payload" };
    }
    // Same payload — return cached result
    const result = existing.result ? (JSON.parse(existing.result) as Record<string, unknown>) : null;
    if (result?.txHash) {
      return {
        ok: true,
        data: {
          txHash: result.txHash as string,
          from: address,
          to: request.to,
          amount: request.amount,
          chain: row.chain,
          status: existing.status === "succeeded" ? "pending" : "failed",
          confirmedAt: null,
        },
      };
    }
  }

  // 3. Balance check
  const { balance } = await getUsdcBalance(address as `0x${string}`);
  const balanceNum = Number.parseFloat(balance);
  const amountNum = Number.parseFloat(request.amount);
  if (Number.isNaN(amountNum) || amountNum <= 0) {
    return { ok: false, status: 400, code: "invalid_request", message: "amount must be a positive decimal string" };
  }
  if (balanceNum < amountNum) {
    return { ok: false, status: 422, code: "insufficient_balance", message: "Insufficient USDC balance" };
  }

  // 4. Decrypt key
  const privateKey = decryptPrivateKey(row.encrypted_key) as Hex;

  // 5. Insert queued execution
  insertExecution({
    idempotencyKey: request.idempotencyKey,
    walletAddress: address,
    actionType: "send",
    payloadHash: hash,
  });

  // 6. Atomic claim — prevent double-execution
  const claimed = tryClaim(request.idempotencyKey);
  if (!claimed) {
    return { ok: false, status: 409, code: "duplicate_request", message: "Execution already running" };
  }

  appendEvent(request.idempotencyKey, "balance_checked", { balance });

  // 7. Sign and send
  const rpcUrl = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";
  const walletClient = createWalletClient({
    account: privateKeyToAccount(privateKey),
    chain: base,
    transport: http(rpcUrl),
  });

  appendEvent(request.idempotencyKey, "tx_sent", { to: request.to, amount: request.amount });

  try {
    const txHash = await walletClient.writeContract({
      address: USDC_ADDRESS,
      abi: ERC20_TRANSFER_ABI,
      functionName: "transfer",
      args: [request.to as `0x${string}`, parseUnits(request.amount, USDC_DECIMALS)],
    });

    // 8. Record success
    appendEvent(request.idempotencyKey, "tx_confirmed", { txHash });
    completeExecution(request.idempotencyKey, "succeeded", JSON.stringify({ txHash }));
    recordSpend(address, request.amount);

    return {
      ok: true,
      data: {
        txHash,
        from: address,
        to: request.to,
        amount: request.amount,
        chain: row.chain,
        status: "pending",
        confirmedAt: null,
      },
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    appendEvent(request.idempotencyKey, "tx_failed", { error: errMsg });
    completeExecution(request.idempotencyKey, "failed", JSON.stringify({ error: errMsg }));
    insertDeadLetter(request.idempotencyKey, errMsg, { to: request.to, amount: request.amount });
    return { ok: false, status: 502, code: "rpc_error", message: `Transaction failed: ${errMsg}` };
  }
}

type HistoryResult =
  | { ok: true; data: HistoryResponse }
  | { ok: false; status: 403 | 404; code: string; message: string };

export function getTransactionHistory(
  address: string,
  caller: string,
  limit: number,
  after?: string,
): HistoryResult {
  const check = checkOwnership(address, caller);
  if (!check.ok) return check;

  const rows = getExecutionsByWallet(address, limit, after);
  const transactions: TransactionRecord[] = rows.map((r) => {
    const result = r.result ? (JSON.parse(r.result) as Record<string, unknown>) : null;
    const txHash = (result?.txHash as string | undefined) ?? "";
    return {
      txHash,
      type: "send",
      from: r.wallet_address,
      to: "",
      amount: "",
      chain: "eip155:8453",
      status: r.status === "succeeded" ? "pending" : "failed",
      timestamp: new Date(r.created_at).toISOString(),
    };
  });

  const lastRow = rows[rows.length - 1];
  const cursor = rows.length === limit && lastRow ? String(lastRow.created_at) : null;

  return { ok: true, data: { transactions, cursor } };
}

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

export async function approveFundRequest(
  requestId: string,
  caller: string,
): Promise<FundRequestResult<FundRequestApproveResponse>> {
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

  // Transfer from owner's wallet (caller) to agent's wallet (req.wallet_address)
  const sendResult = await sendUsdc(
    caller,
    { to: req.wallet_address as `0x${string}`, amount: req.amount, idempotencyKey: `fr_approve_${requestId}` },
    caller,
  );

  if (!sendResult.ok) return sendResult;

  const { txHash } = sendResult.data;
  updateFundRequestStatus(requestId, "approved", txHash);

  const approvedAt = new Date().toISOString();
  return {
    ok: true,
    data: { id: requestId, status: "approved", txHash, approvedAt },
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
