import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { getDeviceKeyPath, getPrimDir } from "./paths.ts";

/**
 * Returns the device key as a hex string (64 chars).
 * On first call, generates 32 random bytes, writes to ~/.prim/device.key (chmod 600).
 * Subsequent calls read the existing file.
 */
export function getOrCreateDeviceKey(): string {
  const deviceKeyPath = getDeviceKeyPath();

  if (existsSync(deviceKeyPath)) {
    return readFileSync(deviceKeyPath).toString("hex");
  }

  mkdirSync(getPrimDir(), { recursive: true });
  const deviceKey = randomBytes(32);
  writeFileSync(deviceKeyPath, deviceKey);
  chmodSync(deviceKeyPath, 0o600);

  return deviceKey.toString("hex");
}
