# I-16: PrimProvider Base Interface

**Status:** pending
**Goal:** Define a standard `PrimProvider` interface in x402-middleware that all vendor integrations implement. Creates a consistent contract for health checks, initialization, and provider metadata across all prims.
**Depends on:** I-8 (prim.yaml providers schema — interface design aligns with schema)
**Scope:** `packages/x402-middleware/src/provider.ts` (new), `packages/x402-middleware/src/index.ts`, `packages/search/src/provider.ts`, `packages/search/src/tavily.ts`

## Problem

Provider implementations are ad-hoc. Each prim rolls its own vendor client pattern:
- search.sh: singleton `_client` with `resetClient()` for testing
- spawn.sh: `hetzner.ts` with direct API calls
- track.sh: `trackingmore.ts` with singleton pattern
- email.sh: `stalwart.ts` + `jmap.ts` with separate clients

There's no shared contract for:
- Health checking (can the provider respond?)
- Initialization (validate config on startup, not on first request)
- Metadata (which vendor, what version, what capabilities)
- Test isolation (consistent mock pattern)

## Design

### Base interface

```ts
interface PrimProvider<TConfig = unknown> {
  /** Vendor identifier (e.g. "tavily", "hetzner") */
  readonly name: string;

  /** Initialize the provider. Called once on startup. Throw if config is invalid. */
  init(config: TConfig): Promise<void>;

  /** Check if the provider is reachable and functional. */
  healthCheck(): Promise<ProviderHealth>;

  /** Clean up resources (connections, timers). Called on shutdown. */
  destroy?(): Promise<void>;
}

interface ProviderHealth {
  ok: boolean;
  latency_ms: number;
  message?: string;  // Error details if !ok
}
```

### Domain-specific extension

Each prim defines its own provider interface that extends `PrimProvider`:

```ts
// packages/search/src/provider.ts
interface SearchProvider extends PrimProvider<SearchProviderConfig> {
  search(query: SearchRequest): Promise<ServiceResult<SearchResponse>>;
  searchNews(query: SearchRequest): Promise<ServiceResult<SearchResponse>>;
  extract(urls: ExtractRequest): Promise<ServiceResult<ExtractResponse>>;
}

interface SearchProviderConfig {
  apiKey: string;
}
```

### Migration: search.sh as proof

Migrate `packages/search/src/tavily.ts` to implement `SearchProvider`:
1. Define `SearchProvider` interface in `packages/search/src/provider.ts`
2. Refactor `tavily.ts` to be a class implementing `SearchProvider`
3. Update `service.ts` to accept a `SearchProvider` (dependency injection)
4. `init()` validates the API key on startup
5. `healthCheck()` makes a lightweight API call to verify connectivity
6. Existing tests continue to work with mock provider

### Health check endpoint

After I-17 (provider registry), expose `GET /health/providers` on each prim that returns provider health status. Not part of this task — noted here for forward compatibility.

### Test isolation pattern

The interface enables consistent mocking across all prims:

```ts
const mockProvider: SearchProvider = {
  name: "mock",
  init: vi.fn(),
  healthCheck: vi.fn().mockResolvedValue({ ok: true, latency_ms: 0 }),
  search: vi.fn().mockResolvedValue({ ok: true, data: {...} }),
  // ...
};
```

This replaces the current ad-hoc `vi.mock("../src/service.ts")` pattern with a structured mock that matches the real interface.

## Files to Create/Modify

| File | Action |
|------|--------|
| `packages/x402-middleware/src/provider.ts` | Create — PrimProvider interface + ProviderHealth type |
| `packages/x402-middleware/src/index.ts` | Modify — export new types |
| `packages/search/src/provider.ts` | Create — SearchProvider interface extending PrimProvider |
| `packages/search/src/tavily.ts` | Modify — refactor to class implementing SearchProvider |
| `packages/search/src/service.ts` | Modify — accept SearchProvider via dependency injection |

## Key Decisions

- **Interface, not abstract class.** TypeScript interfaces are lighter — no runtime overhead, easier to mock. Providers are plain objects that satisfy the interface.
- **Config generic.** Each provider type defines its own config shape. `PrimProvider<{ apiKey: string }>` for API-key vendors, `PrimProvider<{ connectionString: string }>` for database-backed vendors.
- **`init()` is explicit, not in constructor.** Async initialization (validating API keys, testing connections) can't happen in a constructor. `init()` is called once after construction, before the server starts accepting requests.
- **`destroy()` is optional.** Most providers are stateless HTTP clients that don't need cleanup. Database providers (qdrant for mem.sh) would implement this.
- **Only migrate search.sh in this task.** Other prims are migrated in follow-up work. This task proves the pattern.

## Testing Strategy

- Existing search smoke tests pass after migration
- New test: `tavily.init()` throws on missing API key
- New test: `tavily.healthCheck()` returns `{ ok: true, latency_ms: N }` with mocked HTTP
- New test: mock SearchProvider satisfies the interface (type-level check)

## Before Closing

- [ ] `PrimProvider` interface exported from `@primsh/x402-middleware`
- [ ] `SearchProvider` extends `PrimProvider` in `packages/search/src/provider.ts`
- [ ] `tavily.ts` refactored to implement `SearchProvider`
- [ ] `service.ts` uses dependency injection (accepts SearchProvider)
- [ ] All existing search tests pass
- [ ] `pnpm check` passes across all packages
