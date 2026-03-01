// SPDX-License-Identifier: Apache-2.0
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { getConfigPath, getPrimDir } from "./paths.ts";
import type { PrimConfig } from "./types.ts";

/** Parse minimal TOML subset: `key = "value"` lines only. */
function parseToml(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const match = line.match(/^(\w+)\s*=\s*"([^"]*)"$/);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      result[match[1]] = match[2];
    }
  }
  return result;
}

function serializeToml(record: Record<string, string>): string {
  return `${Object.entries(record)
    .map(([k, v]) => `${k} = "${v}"`)
    .join("\n")}\n`;
}

export async function readConfig(): Promise<PrimConfig> {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    return { network: process.env.PRIM_NETWORK };
  }
  const content = readFileSync(configPath, "utf-8");
  const parsed = parseToml(content);
  return {
    default_wallet: parsed.default_wallet,
    network: parsed.network ?? process.env.PRIM_NETWORK,
  };
}

export async function writeConfig(config: PrimConfig): Promise<void> {
  mkdirSync(getPrimDir(), { recursive: true });
  const record: Record<string, string> = {};
  if (config.default_wallet) record.default_wallet = config.default_wallet;
  if (config.network) record.network = config.network;
  writeFileSync(getConfigPath(), serializeToml(record), "utf-8");
}

export async function getDefaultAddress(): Promise<string | null> {
  const config = await readConfig();
  return config.default_wallet ?? null;
}

export async function setDefaultAddress(address: string): Promise<void> {
  const config = await readConfig();
  config.default_wallet = address;
  await writeConfig(config);
}

export async function getConfig(): Promise<PrimConfig> {
  return readConfig();
}
