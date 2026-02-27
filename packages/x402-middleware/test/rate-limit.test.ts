import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { RateLimiter } from "../src/rate-limit.ts";

describe("RateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests under the limit", () => {
    const limiter = new RateLimiter({ max: 3, windowMs: 10_000 });
    const r1 = limiter.check("0xabc");
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);
  });

  it("blocks requests over the limit", () => {
    const limiter = new RateLimiter({ max: 2, windowMs: 10_000 });
    limiter.check("0xabc");
    limiter.check("0xabc");
    const r3 = limiter.check("0xabc");
    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
  });

  it("resets after window expires", () => {
    const limiter = new RateLimiter({ max: 1, windowMs: 5_000 });
    limiter.check("0xabc");
    const blocked = limiter.check("0xabc");
    expect(blocked.allowed).toBe(false);

    vi.advanceTimersByTime(5_001);
    const after = limiter.check("0xabc");
    expect(after.allowed).toBe(true);
    expect(after.remaining).toBe(0);
  });

  it("tracks wallets independently", () => {
    const limiter = new RateLimiter({ max: 1, windowMs: 10_000 });
    limiter.check("0xabc");
    const rAbc = limiter.check("0xabc");
    expect(rAbc.allowed).toBe(false);

    const rDef = limiter.check("0xdef");
    expect(rDef.allowed).toBe(true);
  });

  it("is case-insensitive for wallet addresses", () => {
    const limiter = new RateLimiter({ max: 2, windowMs: 10_000 });
    limiter.check("0xABC");
    const r2 = limiter.check("0xabc");
    expect(r2.remaining).toBe(0);
  });

  it("returns resetMs until window end", () => {
    const limiter = new RateLimiter({ max: 5, windowMs: 60_000 });
    const r = limiter.check("0xabc");
    expect(r.resetMs).toBeLessThanOrEqual(60_000);
    expect(r.resetMs).toBeGreaterThan(0);
  });

  it("uses defaults (60 req/min)", () => {
    const limiter = new RateLimiter();
    expect(limiter.max).toBe(60);
    expect(limiter.windowMs).toBe(60_000);
  });

  it("_getCount returns current window count", () => {
    const limiter = new RateLimiter({ max: 10, windowMs: 10_000 });
    limiter.check("0xabc");
    limiter.check("0xabc");
    expect(limiter._getCount("0xabc")).toBe(2);
    expect(limiter._getCount("0xunknown")).toBe(0);
  });

  it("prunes expired entries lazily", () => {
    const limiter = new RateLimiter({ max: 5, windowMs: 1_000 });
    limiter.check("0xabc");
    expect(limiter._size()).toBe(1);

    vi.advanceTimersByTime(61_000); // past prune interval (60s)
    limiter.check("0xdef"); // triggers prune
    // 0xabc should have been pruned, 0xdef is new
    expect(limiter._size()).toBe(1);
    expect(limiter._getCount("0xabc")).toBe(0);
  });

  it("remaining decrements correctly", () => {
    const limiter = new RateLimiter({ max: 3, windowMs: 10_000 });
    expect(limiter.check("0xa").remaining).toBe(2);
    expect(limiter.check("0xa").remaining).toBe(1);
    expect(limiter.check("0xa").remaining).toBe(0);
    expect(limiter.check("0xa").allowed).toBe(false);
  });
});
