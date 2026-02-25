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
} from "./db.ts";
import type {
  WalletCreateResponse,
  WalletListResponse,
  WalletDetailResponse,
  WalletDeactivateResponse,
  SendRequest,
  SendResponse,
} from "./api.ts";
import { getUsdcBalance } from "./balance.ts";

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
      return {
        address: r.address,
        chain: r.chain,
        balance,
        funded,
        paused: false,
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

  return {
    ok: true,
    data: {
      address: row.address,
      chain: row.chain,
      balance,
      funded,
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
  // 1. Ownership check
  const check = checkOwnership(address, caller);
  if (!check.ok) return check;
  const { row } = check;

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

  // 5. Insert pending execution
  insertExecution({
    idempotencyKey: request.idempotencyKey,
    walletAddress: address,
    actionType: "send",
    payloadHash: hash,
  });

  // 6. Sign and send
  const rpcUrl = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";
  const walletClient = createWalletClient({
    account: privateKeyToAccount(privateKey),
    chain: base,
    transport: http(rpcUrl),
  });

  try {
    const txHash = await walletClient.writeContract({
      address: USDC_ADDRESS,
      abi: ERC20_TRANSFER_ABI,
      functionName: "transfer",
      args: [request.to as `0x${string}`, parseUnits(request.amount, USDC_DECIMALS)],
    });

    // 7. Record success
    completeExecution(request.idempotencyKey, "succeeded", JSON.stringify({ txHash }));

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
    completeExecution(request.idempotencyKey, "failed", JSON.stringify({ error: errMsg }));
    return { ok: false, status: 502, code: "rpc_error", message: `Transaction failed: ${errMsg}` };
  }
}
