// SPDX-License-Identifier: Apache-2.0
import { homedir } from "node:os";
import { join } from "node:path";

export function getPrimDir(): string {
  return process.env.PRIM_HOME ?? join(homedir(), ".prim");
}

export function getKeysDir(): string {
  return join(getPrimDir(), "keys");
}

export function getConfigPath(): string {
  return join(getPrimDir(), "config.toml");
}

export function getDeviceKeyPath(): string {
  return join(getPrimDir(), "device.key");
}

export function getKeyPath(address: string): string {
  return join(getKeysDir(), `${address}.json`);
}
