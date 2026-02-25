interface RateLimitEntry {
  lastDrip: number;
  windowMs: number;
}

export class RateLimiter {
  private entries = new Map<string, RateLimitEntry>();

  constructor(private windowMs: number) {}

  check(key: string): { allowed: boolean; retryAfterMs: number } {
    const now = Date.now();
    const entry = this.entries.get(key);
    if (!entry) {
      return { allowed: true, retryAfterMs: 0 };
    }
    const elapsed = now - entry.lastDrip;
    if (elapsed >= this.windowMs) {
      return { allowed: true, retryAfterMs: 0 };
    }
    return { allowed: false, retryAfterMs: this.windowMs - elapsed };
  }

  record(key: string): void {
    this.entries.set(key, { lastDrip: Date.now(), windowMs: this.windowMs });
  }
}
