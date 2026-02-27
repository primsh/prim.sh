// ─── PrimProvider base interface ─────────────────────────────────────────────
//
// All vendor integrations across prim primitives implement this interface.
// Domain-specific extensions (SearchProvider, etc.) extend PrimProvider<TConfig>
// with their own methods.

export interface ProviderHealth {
  /** Whether the provider is reachable and functional. */
  ok: boolean;
  /** Round-trip time for the health check in milliseconds. */
  latency_ms: number;
  /** Human-readable error details if ok is false. */
  message?: string;
}

export interface PrimProvider<TConfig = unknown> {
  /** Vendor identifier (e.g. "tavily", "hetzner"). */
  readonly name: string;

  /**
   * Initialize the provider. Called once on startup before the server accepts
   * requests. Throws if config is invalid or the provider cannot be reached.
   */
  init(config: TConfig): Promise<void>;

  /**
   * Check whether the provider is reachable and functional.
   * Implementations should make a lightweight API call to verify connectivity.
   */
  healthCheck(): Promise<ProviderHealth>;

  /**
   * Release any resources held by this provider (connections, timers, etc.).
   * Called on server shutdown. Optional — most stateless HTTP providers omit it.
   */
  destroy?(): Promise<void>;
}
