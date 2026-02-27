# I-17: Provider Registry + Selection

**Status:** pending
**Goal:** Shared utility for multi-provider prims: config-driven vendor selection, fallback chains, and health-check-on-startup. Makes adding a second vendor to any prim a 1-file change.
**Depends on:** I-16 (PrimProvider interface)
**Scope:** `packages/x402-middleware/src/provider-registry.ts` (new), `packages/search/src/index.ts`, `packages/search/src/service.ts`

## Problem

Today, each prim hardcodes its vendor: search.sh always uses Tavily, spawn.sh always uses Hetzner. Adding a second vendor requires modifying service.ts selection logic, handling fallback manually, and duplicating health check patterns. There's no shared infrastructure for:

- Selecting a vendor based on config (env var, prim.yaml default)
- Falling back to an alternate vendor if the primary is unhealthy
- Health-checking all registered providers on startup
- Hot-swapping providers without restart

## Design

### Registry

```ts
class ProviderRegistry<T extends PrimProvider> {
  register(name: string, factory: () => T | Promise<T>): void;
  get(name?: string): T;
  getDefault(): T;
  healthCheckAll(): Promise<Map<string, ProviderHealth>>;
  list(): string[];
}
```

### Selection logic

Provider selection order:
1. **Env var override** — `PRIM_<ID>_PROVIDER=serper` overrides everything
2. **prim.yaml default** — the provider with `default: true`
3. **First registered** — if no default specified

### Fallback

Optional fallback behavior when a provider fails:

```ts
const registry = new ProviderRegistry<SearchProvider>({
  fallback: true,  // try next provider if active fails
  healthInterval: 60_000,  // re-check health every 60s
});
```

When `fallback: true`:
- If `get()` provider's last health check was `ok: false`, return next healthy provider
- If all unhealthy, return default anyway (let the request fail with a clear error)

### Startup health check

When the prim app starts:
1. Registry initializes all registered providers (`init()`)
2. Runs `healthCheck()` on each
3. Logs results: `[search.sh] Provider tavily: ok (42ms), serper: ok (67ms)`
4. If default provider is unhealthy, log warning (don't crash — it might recover)

### Integration with createPrimApp

The factory (I-5) can accept an optional `ProviderRegistry` and expose `GET /health/providers`:

```json
{
  "providers": {
    "tavily": { "ok": true, "latency_ms": 42 },
    "serper": { "ok": false, "latency_ms": 0, "message": "API key invalid" }
  },
  "active": "tavily"
}
```

### Migration: search.sh as proof

```
Current:
  service.ts → getClient() → TavilyClient (singleton)

After:
  index.ts → registry.register("tavily", () => new TavilyProvider(config))
  service.ts → registry.get() → SearchProvider (interface)
```

Adding Serper later becomes:
1. Write `packages/search/src/serper.ts` implementing `SearchProvider`
2. Register: `registry.register("serper", () => new SerperProvider(config))`
3. Set `PRIM_SEARCH_PROVIDER=serper` in env (or update prim.yaml default)

That's it. No service.ts changes, no routing logic, no fallback code.

## Files to Create/Modify

| File | Action |
|------|--------|
| `packages/x402-middleware/src/provider-registry.ts` | Create — ProviderRegistry class |
| `packages/x402-middleware/src/index.ts` | Modify — export ProviderRegistry |
| `packages/search/src/index.ts` | Modify — create registry, register tavily |
| `packages/search/src/service.ts` | Modify — use registry.get() instead of getClient() |

## Key Decisions

- **Registry is per-prim, not global.** Each prim creates its own `ProviderRegistry<SearchProvider>`. No cross-prim provider sharing — prims are independent.
- **Lazy initialization.** Provider factories are called on first `get()`, not on `register()`. This avoids initializing providers that are never used (e.g., fallback providers when primary is healthy).
- **No automatic retry.** If a provider call fails, the registry doesn't retry with a fallback mid-request. Fallback is at the health-check level: if the primary is marked unhealthy, the next request goes to the fallback. This keeps request latency predictable.
- **Health check is opt-in.** Prims without `fallback: true` skip periodic health checks. Simple single-provider prims just use `registry.get()` which always returns the default.

## Testing Strategy

- Unit test: register two providers, verify selection order (env var > default > first)
- Unit test: mock provider health check failure → fallback returns alternate
- Unit test: `healthCheckAll()` returns status for all registered providers
- Integration: search.sh smoke tests pass with registry-based architecture
- Integration: `PRIM_SEARCH_PROVIDER=nonexistent` → clear error message

## Before Closing

- [ ] `ProviderRegistry` exported from `@primsh/x402-middleware`
- [ ] search.sh uses registry for provider management
- [ ] Env var override works (`PRIM_SEARCH_PROVIDER=tavily`)
- [ ] Fallback logic works when primary is unhealthy
- [ ] `GET /health/providers` returns provider status (if wired into factory)
- [ ] All existing tests pass
- [ ] `pnpm check` passes
