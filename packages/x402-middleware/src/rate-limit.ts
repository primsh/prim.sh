// SPDX-License-Identifier: Apache-2.0
/**
 * Per-wallet fixed-window rate limiter.
 *
 * Each wallet gets `max` requests per `windowMs`. When a wallet exceeds
 * the limit, the middleware returns 429.
 *
 * In-memory only — resets on process restart. Stale entries are lazily
 * pruned every `pruneIntervalMs` (default 60s).
 */

export interface RateLimitConfig {
  /** Maximum requests per window. Default: 60 */
  max?: number;
  /** Window duration in milliseconds. Default: 60_000 (1 minute) */
  windowMs?: number;
}

interface WindowEntry {
  count: number;
  /** Window start timestamp (ms) */
  start: number;
}

export class RateLimiter {
  readonly max: number;
  readonly windowMs: number;
  private readonly windows = new Map<string, WindowEntry>();
  private lastPrune = Date.now();
  private readonly pruneIntervalMs = 60_000;

  constructor(config: RateLimitConfig = {}) {
    this.max = config.max ?? 60;
    this.windowMs = config.windowMs ?? 60_000;
  }

  /**
   * Check and consume one request for the given wallet.
   * Returns `{ allowed: true, remaining, resetMs }` or `{ allowed: false, remaining: 0, resetMs }`.
   */
  check(wallet: string): { allowed: boolean; remaining: number; resetMs: number } {
    const now = Date.now();
    this.maybePrune(now);

    const key = wallet.toLowerCase();
    let entry = this.windows.get(key);

    if (!entry || now - entry.start >= this.windowMs) {
      entry = { count: 0, start: now };
      this.windows.set(key, entry);
    }

    const resetMs = entry.start + this.windowMs - now;

    if (entry.count >= this.max) {
      return { allowed: false, remaining: 0, resetMs };
    }

    entry.count++;
    return { allowed: true, remaining: this.max - entry.count, resetMs };
  }

  /** Lazily prune expired windows to prevent memory growth. */
  private maybePrune(now: number): void {
    if (now - this.lastPrune < this.pruneIntervalMs) return;
    this.lastPrune = now;
    for (const [key, entry] of this.windows) {
      if (now - entry.start >= this.windowMs) {
        this.windows.delete(key);
      }
    }
  }

  /** Visible for testing: current window count for a wallet. */
  _getCount(wallet: string): number {
    const entry = this.windows.get(wallet.toLowerCase());
    if (!entry) return 0;
    if (Date.now() - entry.start >= this.windowMs) return 0;
    return entry.count;
  }

  /** Visible for testing: number of tracked wallets. */
  _size(): number {
    return this.windows.size;
  }
}
