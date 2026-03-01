import { randomBytes } from "node:crypto";
import { formatUnits, isAddress, parseUnits } from "viem";
import type { Address } from "viem";
import type { PaginatedList, ServiceResult } from "@primsh/x402-middleware";
import type {
  CreatePoolRequest,
  CreateTokenRequest,
  LiquidityParamsResponse,
  MintRequest,
  MintResponse,
  PoolResponse,
  SupplyResponse,
  TokenResponse,
} from "./api.ts";
import { AGENT_TOKEN_ABI, AGENT_TOKEN_BYTECODE, ERC20_ABI } from "./contracts.ts";
import {
  getDeploymentById,
  getDeploymentsByOwner,
  getPoolByTokenId,
  incrementTotalMinted,
  insertDeployment,
  insertPool,
  updateDeploymentStatus,
} from "./db.ts";
import type { DeploymentRow, PoolRow } from "./db.ts";
import { assertChainId, getChain, getDeployerClient, getPublicClient } from "./deployer.ts";
import {
  UNISWAP_V3_FACTORY_ABI,
  UNISWAP_V3_POOL_ABI,
  computeFullRangeTicks,
  computeSqrtPriceX96,
  getUniswapAddresses,
} from "./uniswap.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────

function generateTokenId(): string {
  return `tk_${randomBytes(4).toString("hex")}`;
}

function rowToTokenResponse(row: DeploymentRow): TokenResponse {
  return {
    id: row.id,
    contract_address: row.contract_address,
    owner_wallet: row.owner_wallet,
    name: row.name,
    symbol: row.symbol,
    decimals: row.decimals,
    initial_supply: row.initial_supply,
    total_minted: row.total_minted,
    mintable: row.mintable === 1,
    max_supply: row.max_supply,
    tx_hash: row.tx_hash,
    deploy_status: row.deploy_status as "pending" | "confirmed" | "failed",
    created_at: new Date(row.created_at).toISOString(),
  };
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

  const initialSupplyWei = parseUnits(request.initialSupply, decimals);
  const maxSupplyWei = maxSupply !== null ? parseUnits(maxSupply, decimals) : 0n;

  const publicClient = getPublicClient();
  const client = getDeployerClient();

  let txHash: string;
  try {
    await assertChainId(publicClient);
    txHash = await client.deployContract({
      abi: AGENT_TOKEN_ABI,
      bytecode: AGENT_TOKEN_BYTECODE,
      args: [
        request.name,
        request.symbol,
        decimals,
        initialSupplyWei,
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

  insertDeployment({
    id: tokenId,
    contract_address: null,
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

  // Wait for receipt and update deploy_status (30s timeout)
  try {
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash as `0x${string}`,
      timeout: 30_000,
    });

    if (receipt.status === "reverted" || receipt.contractAddress === null) {
      updateDeploymentStatus(tokenId, "failed");
    } else {
      updateDeploymentStatus(tokenId, "confirmed", receipt.contractAddress);
    }
  } catch {
    // Timeout or RPC error — leave as "pending", caller polls GET
  }

  const row = getDeploymentById(tokenId);
  if (!row) throw new Error("Failed to retrieve deployment after insert");

  return { ok: true, data: { token: rowToTokenResponse(row) } };
}

export function listTokens(callerWallet: string): ServiceResult<PaginatedList<TokenResponse>> {
  const rows = getDeploymentsByOwner(callerWallet);
  return {
    ok: true,
    data: {
      data: rows.map(rowToTokenResponse),
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

  // max supply cap check — uses cumulative total_minted (Bug 1 fix)
  // cap truth table:
  //   mintable=true, maxSupply=0 → uncapped (any amount passes)
  //   mintable=true, maxSupply>0 → initial_supply + total_minted + amount <= maxSupply required
  if (row.max_supply !== null) {
    const amountWeiForCheck = parseUnits(request.amount, row.decimals);
    const initialSupplyWei = parseUnits(row.initial_supply, row.decimals);
    const totalMintedWei = parseUnits(row.total_minted || "0", row.decimals);
    const maxSupplyWei = parseUnits(row.max_supply, row.decimals);

    if (initialSupplyWei + totalMintedWei + amountWeiForCheck > maxSupplyWei) {
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

  const publicClientForMint = getPublicClient();
  const client = getDeployerClient();
  const amountWei = parseUnits(request.amount, row.decimals);

  let txHash: string;
  try {
    await assertChainId(publicClientForMint);
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

  // Wait for mint receipt and increment total_minted on success
  try {
    const receipt = await publicClientForMint.waitForTransactionReceipt({
      hash: txHash as `0x${string}`,
      timeout: 30_000,
    });
    if (receipt.status === "success") {
      incrementTotalMinted(tokenId, request.amount);
    }
  } catch {
    // Timeout — leave total_minted unchanged; on-chain is source of truth
  }

  return {
    ok: true,
    data: { tx_hash: txHash, to: request.to, amount: request.amount, status: "pending" },
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
        token_id: row.id,
        contract_address: row.contract_address,
        total_supply: formatUnits(totalSupply as bigint, row.decimals),
      },
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 502, code: "rpc_error", message: `Supply read failed: ${errMsg}` };
  }
}

// ─── Pool service ─────────────────────────────────────────────────────────

function poolRowToResponse(pool: PoolRow): PoolResponse {
  return {
    pool_address: pool.pool_address,
    token0: pool.token0,
    token1: pool.token1,
    fee: pool.fee,
    sqrt_price_x96: pool.sqrt_price_x96,
    tick: pool.tick,
    tx_hash: pool.tx_hash,
  };
}

const VALID_FEE_TIERS = new Set([500, 3000, 10000]);

export async function createPool(
  tokenId: string,
  request: CreatePoolRequest,
  callerWallet: string,
): Promise<ServiceResult<PoolResponse>> {
  const token = getDeploymentById(tokenId);
  if (!token) {
    return { ok: false, status: 404, code: "not_found", message: "Token not found" };
  }
  if (token.owner_wallet !== callerWallet) {
    return { ok: false, status: 403, code: "forbidden", message: "Forbidden" };
  }
  if (token.deploy_status !== "confirmed" || !token.contract_address) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Token must be confirmed before creating a pool",
    };
  }

  const existing = getPoolByTokenId(tokenId);
  if (existing) {
    return {
      ok: false,
      status: 409,
      code: "pool_exists",
      message: "Pool already exists for this token",
    };
  }

  const feeTier = request.feeTier ?? 10000;
  if (!VALID_FEE_TIERS.has(feeTier)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "feeTier must be one of: 500, 3000, 10000",
    };
  }

  const priceNum = Number(request.pricePerToken);
  if (!request.pricePerToken || Number.isNaN(priceNum) || priceNum <= 0) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "pricePerToken must be a positive number string",
    };
  }

  const chainId = getChain().id;
  const { factory: factoryAddress, usdc: usdcAddress } = getUniswapAddresses(chainId);
  const tokenAddress = token.contract_address as Address;

  const tokenIsToken0 = tokenAddress.toLowerCase() < usdcAddress.toLowerCase();
  const [token0, token1] = tokenIsToken0
    ? ([tokenAddress, usdcAddress] as [Address, Address])
    : ([usdcAddress, tokenAddress] as [Address, Address]);

  const sqrtPriceX96 = computeSqrtPriceX96(
    request.pricePerToken,
    tokenAddress,
    token.decimals,
    chainId,
  );

  const publicClient = getPublicClient();
  const walletClient = getDeployerClient();

  try {
    await assertChainId(publicClient);

    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    let txHash = "0x";

    // Step 0: check on-chain for existing pool (idempotent crash recovery +
    // external creation). If the pool already exists we skip createPool and
    // adopt it instead of reverting and losing $0.50.
    let poolAddress = (await publicClient.readContract({
      address: factoryAddress,
      abi: UNISWAP_V3_FACTORY_ABI,
      functionName: "getPool",
      args: [token0, token1, feeTier],
    })) as Address;

    if (poolAddress === ZERO_ADDRESS) {
      // Pool does not exist yet — create it
      const createHash = await walletClient.writeContract({
        address: factoryAddress,
        abi: UNISWAP_V3_FACTORY_ABI,
        functionName: "createPool",
        args: [token0, token1, feeTier],
      });
      await publicClient.waitForTransactionReceipt({
        hash: createHash as `0x${string}`,
        timeout: 30_000,
      });
      txHash = createHash;
      poolAddress = (await publicClient.readContract({
        address: factoryAddress,
        abi: UNISWAP_V3_FACTORY_ABI,
        functionName: "getPool",
        args: [token0, token1, feeTier],
      })) as Address;
    }

    // Step 1: check if already initialized (sqrtPriceX96 == 0 means uninitialized)
    let slot0 = (await publicClient.readContract({
      address: poolAddress,
      abi: UNISWAP_V3_POOL_ABI,
      functionName: "slot0",
    })) as unknown as { sqrtPriceX96: bigint; tick: number };

    if (slot0.sqrtPriceX96 === 0n) {
      // Not initialized — set the starting price
      const initHash = await walletClient.writeContract({
        address: poolAddress,
        abi: UNISWAP_V3_POOL_ABI,
        functionName: "initialize",
        args: [sqrtPriceX96],
      });
      await publicClient.waitForTransactionReceipt({
        hash: initHash as `0x${string}`,
        timeout: 30_000,
      });
      txHash = initHash;
      // Re-read slot0 to get confirmed tick
      slot0 = (await publicClient.readContract({
        address: poolAddress,
        abi: UNISWAP_V3_POOL_ABI,
        functionName: "slot0",
      })) as unknown as { sqrtPriceX96: bigint; tick: number };
    }

    // Step 2: persist
    const poolId = `pool_${randomBytes(4).toString("hex")}`;
    insertPool({
      id: poolId,
      token_id: tokenId,
      pool_address: poolAddress,
      token0,
      token1,
      fee: feeTier,
      sqrt_price_x96: slot0.sqrtPriceX96.toString(),
      tick: slot0.tick,
      tx_hash: txHash,
      deploy_status: "confirmed",
    });

    const pool = getPoolByTokenId(tokenId);
    if (!pool) throw new Error("Pool not found after insert");
    return { ok: true, data: poolRowToResponse(pool) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 502, code: "rpc_error", message: `Pool creation failed: ${msg}` };
  }
}

export function getPool(tokenId: string, callerWallet: string): ServiceResult<PoolResponse> {
  const token = getDeploymentById(tokenId);
  if (!token) {
    return { ok: false, status: 404, code: "not_found", message: "Token not found" };
  }
  if (token.owner_wallet !== callerWallet) {
    return { ok: false, status: 403, code: "forbidden", message: "Forbidden" };
  }
  const pool = getPoolByTokenId(tokenId);
  if (!pool) {
    return { ok: false, status: 404, code: "not_found", message: "No pool exists for this token" };
  }
  return { ok: true, data: poolRowToResponse(pool) };
}

export function getLiquidityParams(
  tokenId: string,
  tokenAmount: string,
  usdcAmount: string,
  callerWallet: string,
): ServiceResult<LiquidityParamsResponse> {
  const token = getDeploymentById(tokenId);
  if (!token) {
    return { ok: false, status: 404, code: "not_found", message: "Token not found" };
  }
  if (token.owner_wallet !== callerWallet) {
    return { ok: false, status: 403, code: "forbidden", message: "Forbidden" };
  }

  const pool = getPoolByTokenId(tokenId);
  if (!pool) {
    return { ok: false, status: 404, code: "not_found", message: "No pool exists for this token" };
  }

  if (!tokenAmount || Number.isNaN(Number(tokenAmount)) || Number(tokenAmount) <= 0) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "tokenAmount must be a positive number",
    };
  }
  if (!usdcAmount || Number.isNaN(Number(usdcAmount)) || Number(usdcAmount) <= 0) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "usdcAmount must be a positive number",
    };
  }

  const chainId = getChain().id;
  const { positionManager, usdc: usdcAddress } = getUniswapAddresses(chainId);
  const { tickLower, tickUpper } = computeFullRangeTicks(pool.fee);

  // Determine token ordering (same logic used when pool was created)
  const tokenAddress = token.contract_address as string;
  const tokenIsToken0 = tokenAddress.toLowerCase() < usdcAddress.toLowerCase();

  const USDC_DECIMALS = 6;
  const tokenAtoms = parseUnits(tokenAmount, token.decimals).toString();
  const usdcAtoms = parseUnits(usdcAmount, USDC_DECIMALS).toString();

  const [amount0Desired, amount1Desired] = tokenIsToken0
    ? [tokenAtoms, usdcAtoms]
    : [usdcAtoms, tokenAtoms];

  const deadline = Math.floor(Date.now() / 1000) + 3600;

  return {
    ok: true,
    data: {
      position_manager_address: positionManager,
      token0: pool.token0,
      token1: pool.token1,
      fee: pool.fee,
      tick_lower: tickLower,
      tick_upper: tickUpper,
      amount0_desired: amount0Desired,
      amount1_desired: amount1Desired,
      amount0_min: "0",
      amount1_min: "0",
      recipient: callerWallet,
      deadline,
      approvals: [
        { token: pool.token0, spender: positionManager, amount: amount0Desired },
        { token: pool.token1, spender: positionManager, amount: amount1Desired },
      ],
    },
  };
}
