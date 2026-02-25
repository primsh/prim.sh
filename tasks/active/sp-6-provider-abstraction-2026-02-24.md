# SP-6: Abstract provider layer + multi-cloud support

## Context

spawn.sh currently wraps Hetzner Cloud directly. Hetzner's TOS §5 prohibits reselling without written consent — compliance risk. Per the provider strategy ADR (`specs/provider-strategy.md`), DigitalOcean is the launch provider. SP-6 extracts a `CloudProvider` interface from `hetzner.ts`, keeps Hetzner as one implementation, and makes the service layer provider-agnostic.

This task does NOT add the DigitalOcean provider — it extracts the interface and refactors the service layer. DO implementation is a follow-up task.

## Scope

Refactor `packages/spawn/` only. No new packages, no new primitives.

**In scope:**
- Extract `CloudProvider` interface from current `hetzner.ts` functions
- Generalize DB schema (`hetzner_id` → `provider` + `provider_resource_id`)
- Generalize API types (`hetzner_id` → `provider_id`, error code `"hetzner_error"` → `"provider_error"`)
- Make service layer provider-agnostic (inject provider, not import Hetzner directly)
- Update tests to work with the abstraction
- Add `provider` field to `CreateServerRequest` (defaults to `"hetzner"` for now)

**Out of scope:**
- DigitalOcean provider implementation (separate task)
- AWS/GCP/Azure implementations
- Pricing engine changes (provider-specific pricing is a future concern)

## Files to Modify

### 1. New file: `packages/spawn/src/provider.ts` — CloudProvider Interface

Defines the provider contract. Every function maps to current `hetzner.ts` exports:

```typescript
interface CloudProvider {
  name: string;  // "hetzner" | "digitalocean" | etc.

  // Server lifecycle
  createServer(params: ProviderCreateParams): Promise<ProviderServer>;
  getServer(providerResourceId: string): Promise<ProviderServer>;
  deleteServer(providerResourceId: string): Promise<void>;
  startServer(providerResourceId: string): Promise<ProviderAction>;
  stopServer(providerResourceId: string): Promise<ProviderAction>;
  rebootServer(providerResourceId: string): Promise<ProviderAction>;
  resizeServer(providerResourceId: string, type: string, upgradeDisk: boolean): Promise<ProviderAction>;
  rebuildServer(providerResourceId: string, image: string): Promise<ProviderAction>;

  // SSH keys
  createSshKey(params: ProviderSshKeyParams): Promise<ProviderSshKey>;
  listSshKeys(labelSelector?: string): Promise<ProviderSshKey[]>;
  deleteSshKey(providerResourceId: string): Promise<void>;

  // Provider capabilities
  serverTypes(): ProviderServerType[];
  images(): string[];
  locations(): string[];
}
```

**Provider-neutral response types** (also in this file):

- `ProviderServer` — `providerResourceId`, `name`, `status`, `ipv4`, `ipv6`, `type`, `image`, `location`
- `ProviderAction` — `id`, `status`, `startedAt`, `finishedAt`
- `ProviderSshKey` — `providerResourceId`, `name`, `fingerprint`, `publicKey`
- `ProviderCreateParams` — `name`, `type` (provider-native), `image`, `location`, `sshKeyIds?`, `labels?`, `userData?`
- `ProviderSshKeyParams` — `name`, `publicKey`, `labels?`
- `ProviderServerType` — `name` (spawn.sh name), `providerType` (e.g., "cx23"), `dailyBurn` (USDC/day)
- `ProviderError` — generic error class replacing `HetznerError` (statusCode, code, message)

### 2. Modify: `packages/spawn/src/hetzner.ts` — Implement CloudProvider

Export `createHetznerProvider(): CloudProvider` factory. Internally uses existing `fetch`-based functions. Maps Hetzner response shapes to provider-neutral types.

- Move `HETZNER_TYPE_MAP`, `DAILY_BURN_MAP` into the provider (returned by `serverTypes()`)
- Keep `HetznerError` internal — catch and rethrow as `ProviderError`
- `hetzner_id` (integer) → `providerResourceId` (string via `String(id)`)

### 3. New file: `packages/spawn/src/providers.ts` — Provider Registry

Maps provider name → provider instance:

```typescript
function getProvider(name: string): CloudProvider
function listProviders(): string[]
```

Only `"hetzner"` registered for now. `"digitalocean"` added in follow-up task.

### 4. Modify: `packages/spawn/src/db.ts` — Schema Changes

`servers` table:
- `hetzner_id INTEGER` → `provider TEXT NOT NULL DEFAULT 'hetzner'` + `provider_resource_id TEXT NOT NULL`
- Drop `idx_servers_hetzner_id`, add `idx_servers_provider_resource_id`

`ssh_keys` table:
- `hetzner_id INTEGER` → `provider TEXT NOT NULL DEFAULT 'hetzner'` + `provider_resource_id TEXT NOT NULL`

No migration needed — pre-launch, no production data.

Update `ServerRow`, `SshKeyRow` interfaces and all query functions.

### 5. Modify: `packages/spawn/src/api.ts` — Generalize Public Types

- `ServerResponse.hetzner_id` → `.provider` + `.provider_id`
- `SshKeyResponse.hetzner_id` → `.provider` + `.provider_id`
- `CreateServerRequest`: add optional `provider?: string` (defaults to `"hetzner"`)
- Error code `"hetzner_error"` → `"provider_error"`
- Remove `SPAWN_SERVER_TYPES`, `SPAWN_IMAGES`, `SPAWN_LOCATIONS` constants — validation moves to provider's `serverTypes()`, `images()`, `locations()`

### 6. Modify: `packages/spawn/src/service.ts` — Provider-Agnostic Service

- Replace `import * from "./hetzner"` with `import { getProvider } from "./providers"`
- Remove `HETZNER_TYPE_MAP`, `DAILY_BURN_MAP` — use `provider.serverTypes()` instead
- Resolve provider from DB row (`row.provider`) or request (`request.provider`)
- Catch `ProviderError` instead of `HetznerError`
- `rowToServerResponse()`: map `provider` + `provider_resource_id`
- Validate `type`, `image`, `location` against provider capabilities

### 7. Modify: `packages/spawn/src/index.ts` — Error Code Rename

- `hetznerError()` → `providerError()`
- Error code: `"hetzner_error"` → `"provider_error"`
- Routes unchanged

### 8. Modify: `packages/spawn/test/spawn.test.ts` — Update Tests

- Mock at provider interface level: `MockProvider` implementing `CloudProvider`, injected into registry
- Update assertions: `hetzner_id` → `provider` + `provider_id`
- Add tests: explicit provider selection, unknown provider → 400

## Dependency Direction

```
index.ts → service.ts → providers.ts → provider.ts (interface)
                                      → hetzner.ts (implementation)
                       → db.ts
                       → api.ts (types)
provider.ts ← imported by: service.ts, providers.ts, hetzner.ts, tests
```

No circular dependencies. `provider.ts` is a pure interface/types file.

## Testing Strategy

1. `pnpm -r test` passes (all packages)
2. `pnpm -r check` passes (lint + typecheck + test)
3. All existing spawn.sh test cases still pass (same behavior, different abstraction)
4. New test cases: provider selection, unknown provider error

## Before Closing

- [ ] Run `pnpm -r check` (lint + typecheck + tests pass)
- [ ] Verify no Hetzner imports remain in service.ts or index.ts
- [ ] Verify `hetzner_id` no longer appears in DB schema, API types, or test assertions
- [ ] Verify provider error code propagation: ProviderError → service result → HTTP response
- [ ] Verify all existing test cases still pass with same assertions (behavioral compatibility)
