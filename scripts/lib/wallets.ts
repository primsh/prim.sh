// SPDX-License-Identifier: Apache-2.0
/**
 * scripts/lib/wallets.ts — Shared wallet registry loader
 *
 * Loads wallets.yaml from the repo root. Pattern follows loadPrimitives().
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";

export interface Wallet {
  name: string;
  purpose: string;
  address: string;
  network: "mainnet" | "testnet" | "both";
}

interface WalletsFile {
  wallets: Wallet[];
}

/**
 * Load wallet definitions from wallets.yaml.
 * @param root — repo root directory (defaults to two levels up from this file)
 */
export function loadWallets(root?: string): Wallet[] {
  const repoRoot = root ?? resolve(import.meta.dir, "../..");
  const walletsPath = resolve(repoRoot, "wallets.yaml");
  const raw = readFileSync(walletsPath, "utf-8");
  const parsed = parseYaml(raw) as WalletsFile;
  return parsed.wallets;
}

/**
 * Get a wallet by its canonical name (e.g. "REVENUE_WALLET").
 */
export function getWalletByName(wallets: Wallet[], name: string): Wallet | undefined {
  return wallets.find((w) => w.name === name);
}
