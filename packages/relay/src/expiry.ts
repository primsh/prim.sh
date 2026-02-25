/**
 * Mailbox expiry enforcement (R-8).
 * Dual strategy: lazy checks on read + interval sweep as safety net.
 */

import type { MailboxRow } from "./db.ts";
import {
  getExpiredMailboxes,
  getFailedCleanups,
  markExpired,
  markCleanupDone,
  markCleanupDeadLetter,
  incrementCleanupAttempts,
} from "./db.ts";
import { deletePrincipal, StalwartError } from "./stalwart.ts";

const SWEEP_INTERVAL_MS = Number(process.env.RELAY_SWEEP_INTERVAL_MS) || 300_000;
const SWEEP_BATCH_SIZE = Number(process.env.RELAY_SWEEP_BATCH_SIZE) || 50;
const CLEANUP_MAX_RETRIES = Number(process.env.RELAY_CLEANUP_MAX_RETRIES) || 3;

/**
 * Expire a single mailbox: delete Stalwart principal, mark expired in DB.
 * Idempotent — safe to call on already-expired rows.
 */
export async function expireMailbox(row: MailboxRow): Promise<void> {
  if (row.status === "expired" && row.stalwart_cleanup_failed !== 1) return;
  if (row.status === "active" && row.expires_at > Date.now()) return;

  try {
    await deletePrincipal(row.stalwart_name);
    markExpired(row.id, false);
  } catch (err) {
    if (err instanceof StalwartError && err.statusCode === 404) {
      // Already gone from Stalwart
      markExpired(row.id, false);
    } else {
      // Stalwart unreachable or other error — mark for retry
      markExpired(row.id, true);
    }
  }
}

/**
 * Retry Stalwart cleanup for a previously failed expiry.
 */
async function retryCleanup(row: MailboxRow): Promise<void> {
  incrementCleanupAttempts(row.id);

  if (row.cleanup_attempts + 1 >= CLEANUP_MAX_RETRIES) {
    markCleanupDeadLetter(row.id);
    return;
  }

  try {
    await deletePrincipal(row.stalwart_name);
    markCleanupDone(row.id);
  } catch (err) {
    if (err instanceof StalwartError && err.statusCode === 404) {
      markCleanupDone(row.id);
    }
    // Otherwise leave stalwart_cleanup_failed = 1 for next sweep
  }
}

/**
 * Run one sweep cycle: expire active-but-past-due mailboxes + retry failed cleanups.
 * Returns count of mailboxes processed.
 */
export async function runExpirySweep(): Promise<number> {
  const expired = getExpiredMailboxes(SWEEP_BATCH_SIZE);
  const failed = getFailedCleanups(10);

  for (const row of expired) {
    await expireMailbox(row);
  }
  for (const row of failed) {
    await retryCleanup(row);
  }

  return expired.length + failed.length;
}

/**
 * Start the periodic expiry sweep. Returns the interval handle for cleanup.
 */
export function startExpirySweep(intervalMs?: number): ReturnType<typeof setInterval> {
  return setInterval(() => { runExpirySweep(); }, intervalMs ?? SWEEP_INTERVAL_MS);
}

/**
 * Stop the periodic expiry sweep.
 */
export function stopExpirySweep(handle: ReturnType<typeof setInterval>): void {
  clearInterval(handle);
}
