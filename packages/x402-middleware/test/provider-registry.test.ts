// SPDX-License-Identifier: Apache-2.0
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderRegistry } from "../src/provider-registry.ts";
import type { PrimProvider, ProviderHealth } from "../src/provider.ts";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeProvider(name: string, healthy = true): PrimProvider {
  return {
    name,
    init: vi.fn().mockResolvedValue(undefined),
    healthCheck: vi.fn().mockResolvedValue({
      ok: healthy,
      latency_ms: 10,
      message: healthy ? undefined : `${name} unhealthy`,
    } satisfies ProviderHealth),
  };
}

// ─── Registration ─────────────────────────────────────────────────────────────

describe("ProviderRegistry.register", () => {
  it("throws when registering a duplicate name", () => {
    const reg = new ProviderRegistry();
    reg.register("a", () => makeProvider("a"));
    expect(() => reg.register("a", () => makeProvider("a"))).toThrow(
      'Provider "a" is already registered',
    );
  });

  it("list() returns names in registration order", () => {
    const reg = new ProviderRegistry();
    reg.register("a", () => makeProvider("a"));
    reg.register("b", () => makeProvider("b"));
    reg.register("c", () => makeProvider("c"));
    expect(reg.list()).toEqual(["a", "b", "c"]);
  });
});

// ─── Selection order ──────────────────────────────────────────────────────────

describe("ProviderRegistry selection order", () => {
  beforeEach(() => {
    // biome-ignore lint/performance/noDelete: env vars require delete to remove (= undefined sets "undefined")
    delete process.env.PRIM_SEARCH_PROVIDER;
  });

  it("falls back to first registered when no default or env var", async () => {
    const a = makeProvider("a");
    const b = makeProvider("b");
    const reg = new ProviderRegistry({ id: "search" });
    reg.register("a", () => a);
    reg.register("b", () => b);

    const result = await reg.get();
    expect(result.name).toBe("a");
  });

  it("uses the default-marked provider when no env var", async () => {
    const a = makeProvider("a");
    const b = makeProvider("b");
    const reg = new ProviderRegistry({ id: "search" });
    reg.register("a", () => a);
    reg.register("b", () => b, { default: true });

    const result = await reg.get();
    expect(result.name).toBe("b");
  });

  it("env var override beats default", async () => {
    const a = makeProvider("a");
    const b = makeProvider("b");
    const reg = new ProviderRegistry({ id: "search" });
    reg.register("a", () => a, { default: true });
    reg.register("b", () => b);

    process.env.PRIM_SEARCH_PROVIDER = "b";
    const result = await reg.get();
    expect(result.name).toBe("b");
  });

  it("env var override is case-insensitive for the env key", async () => {
    // ID "Search" → key "PRIM_SEARCH_PROVIDER"
    const a = makeProvider("a");
    const b = makeProvider("b");
    const reg = new ProviderRegistry({ id: "Search" });
    reg.register("a", () => a, { default: true });
    reg.register("b", () => b);

    process.env.PRIM_SEARCH_PROVIDER = "b";
    const result = await reg.get();
    expect(result.name).toBe("b");
  });

  it("throws on env var pointing to unregistered provider", async () => {
    const reg = new ProviderRegistry({ id: "search" });
    reg.register("a", () => makeProvider("a"));

    process.env.PRIM_SEARCH_PROVIDER = "nonexistent";
    await expect(reg.get()).rejects.toThrow("nonexistent");
  });

  it("throws when no providers are registered", async () => {
    const reg = new ProviderRegistry();
    await expect(reg.get()).rejects.toThrow("No providers registered");
  });
});

// ─── Fallback ─────────────────────────────────────────────────────────────────

describe("ProviderRegistry fallback", () => {
  it("returns primary when fallback=false even if lastHealth is bad", async () => {
    const a = makeProvider("a", false);
    const b = makeProvider("b", true);
    const reg = new ProviderRegistry({ id: "search", fallback: false });
    reg.register("a", () => a, { default: true });
    reg.register("b", () => b);

    // Simulate health check marking a as unhealthy
    await reg.healthCheckAll();

    const result = await reg.get();
    expect(result.name).toBe("a");
  });

  it("returns primary when no health check has run yet (fallback=true)", async () => {
    const a = makeProvider("a");
    const b = makeProvider("b", true);
    const reg = new ProviderRegistry({ id: "search", fallback: true });
    reg.register("a", () => a, { default: true });
    reg.register("b", () => b);

    // No healthCheckAll() called yet — lastHealth is undefined → return primary
    const result = await reg.get();
    expect(result.name).toBe("a");
  });

  it("falls back to next healthy provider when primary is unhealthy", async () => {
    const a = makeProvider("a", false);
    const b = makeProvider("b", true);
    const reg = new ProviderRegistry({ id: "search", fallback: true });
    reg.register("a", () => a, { default: true });
    reg.register("b", () => b);

    await reg.healthCheckAll();

    const result = await reg.get();
    expect(result.name).toBe("b");
  });

  it("returns primary when all providers are unhealthy", async () => {
    const a = makeProvider("a", false);
    const b = makeProvider("b", false);
    const reg = new ProviderRegistry({ id: "search", fallback: true });
    reg.register("a", () => a, { default: true });
    reg.register("b", () => b);

    await reg.healthCheckAll();

    const result = await reg.get();
    expect(result.name).toBe("a");
  });
});

// ─── healthCheckAll ───────────────────────────────────────────────────────────

describe("ProviderRegistry.healthCheckAll", () => {
  it("returns health for all registered providers", async () => {
    const reg = new ProviderRegistry();
    reg.register("a", () => makeProvider("a", true));
    reg.register("b", () => makeProvider("b", false));

    const results = await reg.healthCheckAll();

    expect(results.size).toBe(2);
    expect(results.get("a")?.ok).toBe(true);
    expect(results.get("b")?.ok).toBe(false);
  });

  it("initializes providers lazily on first healthCheckAll", async () => {
    const factory = vi.fn(() => makeProvider("a"));
    const reg = new ProviderRegistry();
    reg.register("a", factory);

    expect(factory).not.toHaveBeenCalled();
    await reg.healthCheckAll();
    expect(factory).toHaveBeenCalledTimes(1);
  });
});

// ─── startup ──────────────────────────────────────────────────────────────────

describe("ProviderRegistry.startup", () => {
  it("logs ok status for healthy providers", async () => {
    const logs: string[] = [];
    const reg = new ProviderRegistry({ log: (m) => logs.push(m) });
    reg.register("a", () => makeProvider("a", true));

    await reg.startup("test.sh");

    expect(logs.some((l) => l.includes("ok"))).toBe(true);
    expect(logs.some((l) => l.includes("a"))).toBe(true);
  });

  it("logs warning when default provider is unhealthy", async () => {
    const logs: string[] = [];
    const reg = new ProviderRegistry({ log: (m) => logs.push(m) });
    reg.register("a", () => makeProvider("a", false), { default: true });

    await reg.startup("test.sh");

    expect(logs.some((l) => l.includes("WARNING"))).toBe(true);
  });

  it("logs nothing significant when no providers are registered", async () => {
    const logs: string[] = [];
    const reg = new ProviderRegistry({ log: (m) => logs.push(m) });

    await reg.startup("test.sh");

    expect(logs.length).toBe(1);
    expect(logs[0]).toContain("No providers registered");
  });
});

// ─── resolve ──────────────────────────────────────────────────────────────────

describe("ProviderRegistry.resolve", () => {
  it("throws for unknown provider name", async () => {
    const reg = new ProviderRegistry();
    reg.register("a", () => makeProvider("a"));

    await expect(reg.resolve("unknown")).rejects.toThrow('Unknown provider "unknown"');
  });

  it("calls factory only once (lazy singleton)", async () => {
    const factory = vi.fn(() => makeProvider("a"));
    const reg = new ProviderRegistry();
    reg.register("a", factory);

    await reg.resolve("a");
    await reg.resolve("a");

    expect(factory).toHaveBeenCalledTimes(1);
  });
});

// ─── destroy ──────────────────────────────────────────────────────────────────

describe("ProviderRegistry.destroy", () => {
  it("calls destroy() on providers that implement it", async () => {
    const provider = makeProvider("a");
    const destroySpy = vi.fn().mockResolvedValue(undefined);
    (provider as PrimProvider & { destroy: () => Promise<void> }).destroy = destroySpy;

    const reg = new ProviderRegistry();
    reg.register("a", () => provider);
    await reg.resolve("a"); // instantiate

    await reg.destroy();

    expect(destroySpy).toHaveBeenCalledTimes(1);
  });

  it("does not throw if provider has no destroy method", async () => {
    const reg = new ProviderRegistry();
    reg.register("a", () => makeProvider("a"));
    await reg.resolve("a");

    await expect(reg.destroy()).resolves.toBeUndefined();
  });
});

// ─── only first default is used ───────────────────────────────────────────────

describe("ProviderRegistry default deduplication", () => {
  it("ignores subsequent { default: true } registrations — first wins", async () => {
    const reg = new ProviderRegistry();
    reg.register("a", () => makeProvider("a"), { default: true });
    reg.register("b", () => makeProvider("b"), { default: true }); // ignored

    const result = await reg.get();
    expect(result.name).toBe("a");
  });
});
