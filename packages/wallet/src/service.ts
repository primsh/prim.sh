import { randomBytes } from "node:crypto";
import { generateWallet, encryptPrivateKey } from "./keystore.ts";
import {
  insertWallet,
  getWalletByAddress,
  getWalletsByOwner,
  claimWallet as dbClaimWallet,
  deactivateWallet as dbDeactivateWallet,
} from "./db.ts";
import type {
  WalletCreateResponse,
  WalletListResponse,
  WalletDetailResponse,
  WalletDeactivateResponse,
} from "./api.ts";

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

export function listWallets(owner: string, limit: number, after?: string): WalletListResponse {
  const rows = getWalletsByOwner(owner, limit, after);

  const wallets = rows
    .filter((r) => !r.deactivated_at)
    .map((r) => ({
      address: r.address,
      chain: r.chain,
      balance: "0.00",
      funded: false,
      paused: false,
      createdAt: new Date(r.created_at).toISOString(),
    }));

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

export function getWallet(
  address: string,
  caller: string,
): { ok: true; data: WalletDetailResponse } | { ok: false; status: 403 | 404; code: string; message: string } {
  const check = checkOwnership(address, caller);
  if (!check.ok) return check;

  const { row } = check;
  return {
    ok: true,
    data: {
      address: row.address,
      chain: row.chain,
      balance: "0.00",
      funded: false,
      paused: false,
      createdBy: row.created_by ?? "",
      policy: null,
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
