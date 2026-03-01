// SPDX-License-Identifier: Apache-2.0
/**
 * Uniswap V3 helpers: ABIs, chain addresses, sqrtPriceX96 math, tick math.
 */

import type { Address } from "viem";

// ─── ABIs ─────────────────────────────────────────────────────────────────

export const UNISWAP_V3_FACTORY_ABI = [
  {
    type: "function",
    name: "createPool",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "fee", type: "uint24" },
    ],
    outputs: [{ name: "pool", type: "address" }],
  },
  {
    type: "function",
    name: "getPool",
    stateMutability: "view",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "fee", type: "uint24" },
    ],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

export const UNISWAP_V3_POOL_ABI = [
  {
    type: "function",
    name: "initialize",
    stateMutability: "nonpayable",
    inputs: [{ name: "sqrtPriceX96", type: "uint160" }],
    outputs: [],
  },
  {
    type: "function",
    name: "slot0",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
  },
] as const;

// ─── Chain addresses ──────────────────────────────────────────────────────

interface UniswapAddresses {
  factory: Address;
  positionManager: Address;
  usdc: Address;
}

const ADDRESSES: Record<number, UniswapAddresses> = {
  8453: {
    factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
    positionManager: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b1566469c3d",
  },
  84532: {
    factory: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
    positionManager: "0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2",
    usdc: "0x8a04d904055528a69f3e4594dda308a31aeb8457",
  },
};

export function getUniswapAddresses(chainId: number): UniswapAddresses {
  const addrs = ADDRESSES[chainId];
  if (!addrs) throw new Error(`Uniswap V3 addresses not configured for chainId ${chainId}`);
  return addrs;
}

// ─── BigInt square root (Newton's method) ────────────────────────────────

function sqrtBigInt(n: bigint): bigint {
  if (n < 0n) throw new Error("sqrt of negative number");
  if (n === 0n) return 0n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

const USDC_DECIMALS = 6;

/**
 * Compute Uniswap V3 sqrtPriceX96 for a given human-readable price.
 *
 * pricePerToken: human-readable USDC per agent-token (e.g. "0.01" = 1 token costs 0.01 USDC)
 * tokenAddress: agent token contract address (used for ordering vs USDC)
 * tokenDecimals: agent token decimals (e.g. 18)
 * chainId: 8453 or 84532
 *
 * Decision table:
 *   agentToken < USDC? | token0     | token1     | price (token1/token0)
 *   Yes                | agentToken | USDC       | pricePerToken (decimal-adjusted)
 *   No                 | USDC       | agentToken | 1/pricePerToken (decimal-adjusted)
 *
 * Note: "less than" is lexicographic on lowercase hex address strings.
 */
export function computeSqrtPriceX96(
  pricePerToken: string,
  tokenAddress: Address,
  tokenDecimals: number,
  chainId: number,
): bigint {
  const { usdc } = getUniswapAddresses(chainId);
  const tokenIsToken0 = tokenAddress.toLowerCase() < usdc.toLowerCase();

  // Parse pricePerToken as a rational number: e.g. "0.01" → num=1n, den=100n
  const dotIdx = pricePerToken.indexOf(".");
  let priceNum: bigint;
  let priceDen: bigint;
  if (dotIdx === -1) {
    priceNum = BigInt(pricePerToken);
    priceDen = 1n;
  } else {
    const intPart = pricePerToken.slice(0, dotIdx);
    const fracPart = pricePerToken.slice(dotIdx + 1);
    priceNum = BigInt(intPart + fracPart);
    priceDen = 10n ** BigInt(fracPart.length);
  }

  // Compute atomic price ratio (token1/token0 in smallest units)
  let atomicPriceNum: bigint;
  let atomicPriceDen: bigint;

  if (tokenIsToken0) {
    // token0=agentToken (tokenDecimals), token1=USDC (USDC_DECIMALS)
    // price = pricePerToken * 10^USDC_DECIMALS / 10^tokenDecimals
    atomicPriceNum = priceNum * 10n ** BigInt(USDC_DECIMALS);
    atomicPriceDen = priceDen * 10n ** BigInt(tokenDecimals);
  } else {
    // token0=USDC (USDC_DECIMALS), token1=agentToken (tokenDecimals)
    // price = (1/pricePerToken) * 10^tokenDecimals / 10^USDC_DECIMALS
    atomicPriceNum = priceDen * 10n ** BigInt(tokenDecimals);
    atomicPriceDen = priceNum * 10n ** BigInt(USDC_DECIMALS);
  }

  // sqrtPriceX96 = floor(sqrt(atomicPrice * 2^192))
  const Q192 = 2n ** 192n;
  const n = (atomicPriceNum * Q192) / atomicPriceDen;
  return sqrtBigInt(n);
}

/**
 * Compute full-range (Uniswap V2-equivalent) tick bounds for a given fee tier.
 * Rounds inward to the nearest valid tick spacing multiple.
 */
export function computeFullRangeTicks(feeTier: number): { tickLower: number; tickUpper: number } {
  const tickSpacingMap: Record<number, number> = { 500: 10, 3000: 60, 10000: 200 };
  const tickSpacing = tickSpacingMap[feeTier];
  if (tickSpacing === undefined) throw new Error(`Unsupported fee tier: ${feeTier}`);

  const MAX_TICK = 887272;
  const tickLower = Math.ceil(-MAX_TICK / tickSpacing) * tickSpacing;
  const tickUpper = Math.floor(MAX_TICK / tickSpacing) * tickSpacing;
  return { tickLower, tickUpper };
}
