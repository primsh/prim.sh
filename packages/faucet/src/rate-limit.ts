// SPDX-License-Identifier: Apache-2.0
import { cleanupOldEntries, getLastDrip, upsertDrip } from "./db.ts";

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export class RateLimiter {
  constructor(
    private resource: string,
    private windowMs: number,
  ) {}

  check(address: string): { allowed: boolean; retryAfterMs: number } {
    cleanupOldEntries(CLEANUP_INTERVAL_MS);

    const lastDrip = getLastDrip(address, this.resource);
    if (lastDrip === null) {
      return { allowed: true, retryAfterMs: 0 };
    }

    const elapsed = Date.now() - lastDrip;
    if (elapsed >= this.windowMs) {
      return { allowed: true, retryAfterMs: 0 };
    }

    return { allowed: false, retryAfterMs: this.windowMs - elapsed };
  }

  record(address: string): void {
    upsertDrip(address, this.resource, Date.now());
  }
}
