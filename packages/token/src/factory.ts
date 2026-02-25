import {
  encodeAbiParameters,
  keccak256,
  getContractAddress,
  type Address,
  type Hex,
} from "viem";

export const FACTORY_ABI = [
  {
    type: "function",
    name: "deploy",
    inputs: [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "decimals", type: "uint8" },
      { name: "totalSupply", type: "uint256" },
      { name: "mintable", type: "bool" },
      { name: "maxSupply", type: "uint256" },
      { name: "owner", type: "address" },
    ],
    outputs: [{ name: "token", type: "address" }],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "TokenDeployed",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "symbol", type: "string", indexed: false },
    ],
  },
] as const;

export const ERC20_ABI = [
  {
    type: "function",
    name: "totalSupply",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "mint",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [{ type: "address" }],
    stateMutability: "view",
  },
] as const;

const BASE_CHAIN_ID = 8453n;

export function computeDeploySalt(owner: Address, name: string, symbol: string): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "string" }, { type: "string" }, { type: "uint256" }],
      [owner, name, symbol, BASE_CHAIN_ID],
    ),
  );
}

/**
 * Predict the CREATE2 address of a token deployed via the factory.
 * This requires the factory address, the deploy salt, and the init code hash.
 *
 * Note: The actual init code hash depends on the factory's implementation.
 * This function computes the salt that the factory uses, which is sufficient
 * for deterministic address prediction when paired with the factory's bytecode.
 */
export function predictTokenAddress(
  factoryAddress: Address,
  salt: Hex,
  initCodeHash: Hex,
): Address {
  return getContractAddress({
    bytecode: initCodeHash,
    from: factoryAddress,
    opcode: "CREATE2",
    salt,
  });
}

export function getFactoryAddress(): Address {
  const addr = process.env.TOKEN_FACTORY_ADDRESS ?? "";
  if (!addr) {
    throw new Error("TOKEN_FACTORY_ADDRESS is required");
  }
  return addr as Address;
}
