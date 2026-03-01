import { addToAllowlist } from "@primsh/x402-middleware/allowlist-db";
import type { ServiceResult } from "@primsh/x402-middleware";
import { createLogger } from "@primsh/x402-middleware";
import type {
  CodeDetail,
  CreateCodesRequest,
  CreateCodesResponse,
  ListCodesResponse,
  RedeemResponse,
} from "./api.ts";
import { generateCode, insertCodes, listCodes, revokeCode } from "./db.ts";
import type { CodeRow } from "./db.ts";
import { validateAndBurn } from "./db.ts";
import { fundWallet } from "./fund.ts";

const log = createLogger("gate.sh", { module: "service" });

type RedeemResult = ServiceResult<RedeemResponse>;

/**
 * Redeem an invite code: validate → allowlist → fund.
 *
 * @param code - Invite code to redeem
 * @param wallet - Checksummed EVM wallet address
 * @param allowlistDbPath - Path to shared allowlist SQLite DB
 */
export async function redeemInvite(
  code: string,
  wallet: string,
  allowlistDbPath: string,
): Promise<RedeemResult> {
  // 1. Validate and burn the code
  const validation = validateAndBurn(code, wallet);
  if (!validation.ok) {
    const messages = {
      invalid_code: "Invite code not recognized",
      code_redeemed: "Invite code already used",
    } as const;
    const status = validation.reason === "code_redeemed" ? 409 : 400;
    return { ok: false, status, code: validation.reason, message: messages[validation.reason] };
  }

  // 2. Add wallet to allowlist
  addToAllowlist(allowlistDbPath, wallet, "gate.sh", `invite:${code}`);
  log.info("Wallet allowlisted", { wallet, code });

  // 3. Fund the wallet
  try {
    const funded = await fundWallet(wallet);
    log.info("Wallet funded", { wallet, usdc: funded.usdc_amount, eth: funded.eth_amount });

    return {
      ok: true,
      data: {
        status: "redeemed",
        wallet,
        funded: {
          usdc: funded.usdc_amount,
          eth: funded.eth_amount,
          usdc_tx: funded.usdc_tx,
          eth_tx: funded.eth_tx,
        },
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("Funding failed (wallet is allowlisted but unfunded)", { wallet, error: message });
    return { ok: false, status: 502, code: "fund_error", message: `Funding failed: ${message}` };
  }
}

// ─── Code management ─────────────────────────────────────────────────────────

function toCodeDetail(row: CodeRow): CodeDetail {
  return {
    code: row.code,
    status: row.redeemed_at ? "redeemed" : "available",
    created_at: row.created_at,
    label: row.label,
    wallet: row.wallet,
    redeemed_at: row.redeemed_at,
  };
}

/** Create codes — either generate random ones, accept specific ones, or both. */
export function createCodes(
  req: CreateCodesRequest,
): ServiceResult<CreateCodesResponse> {
  if (!req.count && (!req.codes || req.codes.length === 0)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "At least one of count or codes is required",
    };
  }

  if (req.count !== undefined && (req.count < 1 || req.count > 100)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "count must be between 1 and 100",
    };
  }

  const generated: string[] = [];
  if (req.count) {
    for (let i = 0; i < req.count; i++) {
      generated.push(generateCode());
    }
  }

  const allCodes = [...generated, ...(req.codes ?? [])];
  const created = insertCodes(allCodes, req.label);

  return { ok: true, data: { codes: allCodes, created } };
}

/** List codes, optionally filtered by status. */
export function getCodes(
  status?: string,
): ServiceResult<ListCodesResponse> {
  if (status && status !== "available" && status !== "redeemed") {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "status must be 'available' or 'redeemed'",
    };
  }

  const rows = listCodes(status as "available" | "redeemed" | undefined);
  const codes = rows.map(toCodeDetail);
  return { ok: true, data: { codes, total: codes.length } };
}

/** Revoke (delete) an available code. */
export function deleteCode(
  code: string,
): ServiceResult<{ status: "revoked" }> {
  const result = revokeCode(code);
  if (!result.ok) {
    if (result.reason === "not_found") {
      return { ok: false, status: 404, code: "not_found", message: "Code not found" };
    }
    return { ok: false, status: 409, code: "code_redeemed", message: "Cannot revoke a redeemed code" };
  }
  return { ok: true, data: { status: "revoked" } };
}
