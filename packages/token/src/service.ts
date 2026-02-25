import { randomBytes } from "node:crypto";
import { createPublicClient, http, parseUnits, isAddress, formatUnits } from "viem";
import { base } from "viem/chains";
import type { Address } from "viem";
import {
  insertDeployment,
  getDeploymentById,
  getDeploymentsByOwner,
  updateDeploymentStatus,
} from "./db.ts";
import type { DeploymentRow } from "./db.ts";
import { getDeployerClient } from "./deployer.ts";
import { FACTORY_ABI, ERC20_ABI, getFactoryAddress, computeDeploySalt } from "./factory.ts";
import type {
  CreateTokenRequest,
  TokenResponse,
  TokenListResponse,
  MintRequest,
  MintResponse,
  SupplyResponse,
  ServiceResult,
} from "./api.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────

function generateTokenId(): string {
  return `tk_${randomBytes(4).toString("hex")}`;
}

function rowToTokenResponse(row: DeploymentRow): TokenResponse {
  return {
    id: row.id,
    contractAddress: row.contract_address,
    factoryAddress: row.factory_address,
    ownerWallet: row.owner_wallet,
    name: row.name,
    symbol: row.symbol,
    decimals: row.decimals,
    initialSupply: row.initial_supply,
    mintable: row.mintable === 1,
    maxSupply: row.max_supply,
    txHash: row.tx_hash,
    deployStatus: row.deploy_status as "pending" | "confirmed" | "failed",
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function getPublicClient() {
  const rpcUrl = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";
  return createPublicClient({ chain: base, transport: http(rpcUrl) });
}

// ─── Validation ──────────────────────────────────────────────────────────

export function validateCreateToken(
  req: CreateTokenRequest,
): { ok: false; status: number; code: string; message: string } | null {
  if (!req.name || req.name.length < 1 || req.name.length > 64) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "name must be 1-64 characters",
    };
  }

  if (!req.symbol || req.symbol.length < 1 || req.symbol.length > 11) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "symbol must be 1-11 characters",
    };
  }

  if (!/^[A-Z0-9]+$/.test(req.symbol)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "symbol must be uppercase alphanumeric",
    };
  }

  const decimals = req.decimals ?? 18;
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "decimals must be an integer 0-18",
    };
  }

  if (!req.initialSupply || req.initialSupply.trim() === "") {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "initialSupply is required",
    };
  }

  const supply = Number(req.initialSupply);
  if (Number.isNaN(supply) || supply <= 0) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "initialSupply must be a positive number",
    };
  }

  const mintable = req.mintable ?? false;
  if (mintable) {
    if (req.maxSupply === undefined || req.maxSupply === null) {
      return {
        ok: false,
        status: 400,
        code: "invalid_request",
        message: "maxSupply is required when mintable is true",
      };
    }
    const max = Number(req.maxSupply);
    if (Number.isNaN(max) || max < supply) {
      return {
        ok: false,
        status: 400,
        code: "invalid_request",
        message: "maxSupply must be >= initialSupply",
      };
    }
  }

  return null;
}

// ─── Token service ───────────────────────────────────────────────────────

export async function deployToken(
  request: CreateTokenRequest,
  callerWallet: string,
): Promise<ServiceResult<{ token: TokenResponse }>> {
  const validationError = validateCreateToken(request);
  if (validationError) return validationError;

  const decimals = request.decimals ?? 18;
  const mintable = request.mintable ?? false;
  const maxSupply = mintable ? (request.maxSupply as string) : null;
  const factoryAddress = getFactoryAddress();

  const totalSupplyWei = parseUnits(request.initialSupply, decimals);
  const maxSupplyWei = maxSupply !== null ? parseUnits(maxSupply, decimals) : 0n;

  const client = getDeployerClient();

  let txHash: string;
  try {
    txHash = await client.writeContract({
      address: factoryAddress,
      abi: FACTORY_ABI,
      functionName: "deploy",
      args: [
        request.name,
        request.symbol,
        decimals,
        totalSupplyWei,
        mintable,
        maxSupplyWei,
        callerWallet as Address,
      ],
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 502, code: "rpc_error", message: `Deploy failed: ${errMsg}` };
  }

  const tokenId = generateTokenId();

  // Compute predicted contract address from CREATE2 salt
  const salt = computeDeploySalt(callerWallet as Address, request.name, request.symbol);

  insertDeployment({
    id: tokenId,
    contract_address: null,
    factory_address: factoryAddress,
    owner_wallet: callerWallet,
    name: request.name,
    symbol: request.symbol,
    decimals,
    initial_supply: request.initialSupply,
    mintable,
    max_supply: maxSupply,
    tx_hash: txHash,
    deploy_status: "pending",
  });

  const row = getDeploymentById(tokenId);
  if (!row) throw new Error("Failed to retrieve deployment after insert");

  return { ok: true, data: { token: rowToTokenResponse(row) } };
}

export function listTokens(callerWallet: string): ServiceResult<TokenListResponse> {
  const rows = getDeploymentsByOwner(callerWallet);
  return {
    ok: true,
    data: { tokens: rows.map(rowToTokenResponse) },
  };
}

export function getToken(
  tokenId: string,
  callerWallet: string,
): ServiceResult<{ token: TokenResponse }> {
  const row = getDeploymentById(tokenId);
  if (!row) {
    return { ok: false, status: 404, code: "not_found", message: "Token not found" };
  }
  if (row.owner_wallet !== callerWallet) {
    return { ok: false, status: 403, code: "forbidden", message: "Forbidden" };
  }
  return { ok: true, data: { token: rowToTokenResponse(row) } };
}

export async function mintTokens(
  tokenId: string,
  request: MintRequest,
  callerWallet: string,
): Promise<ServiceResult<MintResponse>> {
  const row = getDeploymentById(tokenId);
  if (!row) {
    return { ok: false, status: 404, code: "not_found", message: "Token not found" };
  }

  // mintable check
  if (row.mintable === 0) {
    return { ok: false, status: 400, code: "not_mintable", message: "Token is not mintable" };
  }

  // ownership check
  if (row.owner_wallet !== callerWallet) {
    return { ok: false, status: 403, code: "forbidden", message: "Forbidden" };
  }

  // validate 'to' address
  if (!request.to || !isAddress(request.to)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "to must be a valid Ethereum address",
    };
  }

  // validate amount
  const amountNum = Number(request.amount);
  if (!request.amount || Number.isNaN(amountNum) || amountNum <= 0) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "amount must be a positive number",
    };
  }

  // max supply cap check
  if (row.max_supply !== null) {
    const currentSupply = Number(row.initial_supply);
    const maxSupply = Number(row.max_supply);
    if (currentSupply + amountNum > maxSupply) {
      return {
        ok: false,
        status: 422,
        code: "exceeds_max_supply",
        message: `Minting ${request.amount} would exceed maxSupply of ${row.max_supply}`,
      };
    }
  }

  if (!row.contract_address) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Token contract not yet deployed (status: pending)",
    };
  }

  const client = getDeployerClient();
  const amountWei = parseUnits(request.amount, row.decimals);

  let txHash: string;
  try {
    txHash = await client.writeContract({
      address: row.contract_address as Address,
      abi: ERC20_ABI,
      functionName: "mint",
      args: [request.to as Address, amountWei],
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 502, code: "rpc_error", message: `Mint failed: ${errMsg}` };
  }

  return {
    ok: true,
    data: { txHash, to: request.to, amount: request.amount, status: "pending" },
  };
}

export async function getSupply(
  tokenId: string,
  callerWallet: string,
): Promise<ServiceResult<SupplyResponse>> {
  const row = getDeploymentById(tokenId);
  if (!row) {
    return { ok: false, status: 404, code: "not_found", message: "Token not found" };
  }
  if (row.owner_wallet !== callerWallet) {
    return { ok: false, status: 403, code: "forbidden", message: "Forbidden" };
  }

  if (!row.contract_address) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Token contract not yet deployed (status: pending)",
    };
  }

  const publicClient = getPublicClient();

  try {
    const totalSupply = await publicClient.readContract({
      address: row.contract_address as Address,
      abi: ERC20_ABI,
      functionName: "totalSupply",
    });

    return {
      ok: true,
      data: {
        tokenId: row.id,
        contractAddress: row.contract_address,
        totalSupply: formatUnits(totalSupply as bigint, row.decimals),
      },
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 502, code: "rpc_error", message: `Supply read failed: ${errMsg}` };
  }
}
