// ─── ProviderRegistry ─────────────────────────────────────────────────────────
//
// Config-driven vendor selection, fallback chains, and health-check-on-startup.
// Each prim creates its own registry typed to its domain-specific provider
// interface (e.g., ProviderRegistry<SearchProvider>).
//
// Selection order:
//   1. Env var override — PRIM_<ID>_PROVIDER=<vendor>
//   2. Provider registered with { default: true }
//   3. First registered provider

import type { PrimProvider, ProviderHealth } from "./provider.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProviderRegistryOptions {
  /**
   * Prim ID used for env var override. e.g. "search" → reads PRIM_SEARCH_PROVIDER.
   * Case-insensitive. Required for env var override to work.
   */
  id?: string;

  /**
   * When true, if the selected provider's last health check returned ok: false,
   * the registry falls back to the next healthy provider.
   * No automatic mid-request retry — fallback applies at selection time only.
   */
  fallback?: boolean;

  /**
   * Interval in milliseconds to re-run health checks on all registered
   * providers. Only active when fallback is true. Default: 60_000.
   */
  healthInterval?: number;

  /**
   * Logger for startup health check output. Defaults to console.
   */
  log?: (message: string) => void;
}

interface RegistryEntry<T> {
  name: string;
  factory: () => T | Promise<T>;
  isDefault: boolean;
  instance?: T;
  lastHealth?: ProviderHealth;
}

// ─── ProviderRegistry ─────────────────────────────────────────────────────────

export class ProviderRegistry<T extends PrimProvider> {
  private entries: Map<string, RegistryEntry<T>> = new Map();
  private options: Required<ProviderRegistryOptions>;
  private healthTimer?: ReturnType<typeof setInterval>;

  constructor(options: ProviderRegistryOptions = {}) {
    this.options = {
      id: options.id ?? "",
      fallback: options.fallback ?? false,
      healthInterval: options.healthInterval ?? 60_000,
      log: options.log ?? ((msg) => console.log(msg)),
    };
  }

  /**
   * Register a provider factory. The factory is called lazily on first use.
   * If `isDefault` is true, this provider is preferred when no env var override
   * is set. Only the first registered default is used.
   */
  register(name: string, factory: () => T | Promise<T>, opts: { default?: boolean } = {}): this {
    if (this.entries.has(name)) {
      throw new Error(`[ProviderRegistry] Provider "${name}" is already registered`);
    }
    const isDefault = opts.default ?? false;
    // Enforce single default: if one already exists, subsequent defaults are treated as non-default
    const hasDefault = [...this.entries.values()].some((e) => e.isDefault);
    this.entries.set(name, {
      name,
      factory,
      isDefault: isDefault && !hasDefault,
    });
    return this;
  }

  /**
   * Names of all registered providers in registration order.
   */
  list(): string[] {
    return [...this.entries.keys()];
  }

  /**
   * Resolve and return the provider instance for `name`, initializing it on
   * first access. Throws if the provider is not registered.
   */
  async resolve(name: string): Promise<T> {
    const entry = this.entries.get(name);
    if (!entry) {
      throw new Error(
        `[ProviderRegistry] Unknown provider "${name}". Registered: ${this.list().join(", ") || "(none)"}`,
      );
    }
    if (!entry.instance) {
      entry.instance = await entry.factory();
    }
    return entry.instance;
  }

  /**
   * Select and return the active provider according to selection order:
   *   1. PRIM_<ID>_PROVIDER env var (if id is configured)
   *   2. Provider marked default: true
   *   3. First registered provider
   *
   * When fallback is enabled and the selected provider is marked unhealthy,
   * returns the next healthy provider instead. If all are unhealthy, returns
   * the default anyway — let the request fail with a clear upstream error.
   *
   * Throws if no providers are registered.
   */
  async get(): Promise<T> {
    if (this.entries.size === 0) {
      throw new Error("[ProviderRegistry] No providers registered");
    }

    const primaryName = this._selectName();
    const primary = await this.resolve(primaryName);

    if (!this.options.fallback) {
      return primary;
    }

    // Fallback path: check health state of primary
    const primaryEntry = this.entries.get(primaryName);
    if (!primaryEntry) return primary;
    if (!primaryEntry.lastHealth || primaryEntry.lastHealth.ok) {
      return primary;
    }

    // Primary is unhealthy — find next healthy provider
    for (const [name, entry] of this.entries) {
      if (name === primaryName) continue;
      if (entry.lastHealth?.ok) {
        return this.resolve(name);
      }
    }

    // All unhealthy — return primary and let it fail clearly
    return primary;
  }

  /**
   * Run health checks on all registered providers and return results.
   * Also updates internal health state used by fallback selection.
   */
  async healthCheckAll(): Promise<Map<string, ProviderHealth>> {
    const results = new Map<string, ProviderHealth>();

    for (const [name, entry] of this.entries) {
      const instance = await this.resolve(name);
      const health = await instance.healthCheck();
      entry.lastHealth = health;
      results.set(name, health);
    }

    return results;
  }

  /**
   * Run startup sequence: initialize all providers, run health checks, log
   * results. Warns if the default provider is unhealthy but does not throw —
   * the provider may recover after startup.
   *
   * When fallback is true, starts the periodic health check interval.
   */
  async startup(primName = "prim"): Promise<void> {
    const log = this.options.log;

    if (this.entries.size === 0) {
      log(`[${primName}] No providers registered — skipping health checks`);
      return;
    }

    const results = await this.healthCheckAll();
    const defaultName = this._selectName();

    for (const [name, health] of results) {
      const tag = name === defaultName ? " (default)" : "";
      if (health.ok) {
        log(`[${primName}] Provider ${name}${tag}: ok (${health.latency_ms}ms)`);
      } else {
        log(
          `[${primName}] Provider ${name}${tag}: UNHEALTHY (${health.latency_ms}ms)${health.message ? ` — ${health.message}` : ""}`,
        );
      }
    }

    const defaultHealth = results.get(defaultName);
    if (defaultHealth && !defaultHealth.ok) {
      log(
        `[${primName}] WARNING: default provider "${defaultName}" is unhealthy. Service may be degraded.`,
      );
    }

    if (this.options.fallback && this.options.healthInterval > 0) {
      this._startHealthInterval(primName);
    }
  }

  /**
   * Stop the periodic health check interval and destroy all initialized
   * provider instances. Call on server shutdown.
   */
  async destroy(): Promise<void> {
    if (this.healthTimer !== undefined) {
      clearInterval(this.healthTimer);
      this.healthTimer = undefined;
    }
    for (const entry of this.entries.values()) {
      if (entry.instance?.destroy) {
        await entry.instance.destroy();
      }
    }
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /** Determine the provider name to use, following selection order. */
  private _selectName(): string {
    // 1. Env var override
    if (this.options.id) {
      const envKey = `PRIM_${this.options.id.toUpperCase()}_PROVIDER`;
      const override = process.env[envKey];
      if (override) {
        if (!this.entries.has(override)) {
          throw new Error(
            `[ProviderRegistry] PRIM_${this.options.id.toUpperCase()}_PROVIDER="${override}" is not registered. Registered: ${this.list().join(", ")}`,
          );
        }
        return override;
      }
    }

    // 2. Default-marked provider
    for (const [name, entry] of this.entries) {
      if (entry.isDefault) return name;
    }

    // 3. First registered
    return this.entries.keys().next().value as string;
  }

  private _startHealthInterval(primName: string): void {
    this.healthTimer = setInterval(async () => {
      try {
        const results = await this.healthCheckAll();
        for (const [name, health] of results) {
          if (!health.ok) {
            this.options.log(
              `[${primName}] Provider ${name} health check failed: ${health.message ?? "unknown error"}`,
            );
          }
        }
      } catch (err) {
        this.options.log(
          `[${primName}] Health check interval error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }, this.options.healthInterval);

    // Don't keep the process alive just for health checks
    if (this.healthTimer.unref) {
      this.healthTimer.unref();
    }
  }
}
