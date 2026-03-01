// SPDX-License-Identifier: Apache-2.0
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { insertWallet } from "../src/db.ts";

/**
 * Registers a test wallet directly in the DB, bypassing signature verification.
 * Returns the wallet address and the private key for test signing.
 */
export function registerTestWallet(owner?: string): { address: string; privateKey: `0x${string}` } {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const address = account.address;
  const createdBy = owner ?? address;

  insertWallet({ address, chain: "eip155:8453", createdBy });

  return { address, privateKey };
}
