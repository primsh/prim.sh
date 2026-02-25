# SP-3 + SP-4: VM lifecycle + SSH key injection

**Status:** Plan
**Spec:** `specs/spawn.md`
**Depends on:** SP-2 (VM provisioning — done)
**Blocks:** SP-5 (x402 middleware, but already wired in SP-2)

## Context

SP-2 built the four core server endpoints (create/list/get/delete). SP-3 adds VM lifecycle actions (start, stop, reboot, resize, rebuild) and SP-4 adds SSH key management (register, list, delete). These are combined into one task since both are mechanical Hetzner API wrappers following the same patterns established in SP-2.

## Goals

1. Start/stop/reboot/resize/rebuild VMs via Hetzner actions API
2. Register/list/delete SSH keys via Hetzner SSH keys API
3. Ownership enforcement on all operations
4. All routes x402-priced per spawn spec

## Hetzner Action Endpoints

| spawn.sh | Hetzner | Method |
|----------|---------|--------|
| `POST /v1/servers/:id/start` | `POST /v1/servers/{hetzner_id}/actions/poweron` | Power on |
| `POST /v1/servers/:id/stop` | `POST /v1/servers/{hetzner_id}/actions/shutdown` | Graceful ACPI |
| `POST /v1/servers/:id/reboot` | `POST /v1/servers/{hetzner_id}/actions/reboot` | Graceful reboot |
| `POST /v1/servers/:id/resize` | `POST /v1/servers/{hetzner_id}/actions/change_type` | Change type |
| `POST /v1/servers/:id/rebuild` | `POST /v1/servers/{hetzner_id}/actions/rebuild` | Reinstall OS |

## Hetzner SSH Key Endpoints

| spawn.sh | Hetzner | Method |
|----------|---------|--------|
| `POST /v1/ssh-keys` | `POST /v1/ssh_keys` | Create |
| `GET /v1/ssh-keys` | `GET /v1/ssh_keys?label_selector=wallet%3D0x...` | List |
| `DELETE /v1/ssh-keys/:id` | `DELETE /v1/ssh_keys/{hetzner_id}` | Delete |

## Route Pricing

```
"POST /v1/servers/[id]/start": "$0.002"
"POST /v1/servers/[id]/stop": "$0.002"
"POST /v1/servers/[id]/reboot": "$0.002"
"POST /v1/servers/[id]/resize": "$0.01"
"POST /v1/servers/[id]/rebuild": "$0.005"
"POST /v1/ssh-keys": "$0.001"
"GET /v1/ssh-keys": "$0.001"
"DELETE /v1/ssh-keys/[id]": "$0.001"
```

## Phase 1 — Types

### Modify: `packages/spawn/src/api.ts`

Add types for:
- `ActionOnlyResponse` — `{ action: ActionResponse }` (for start/stop/reboot)
- `ResizeRequest` — `{ type: SpawnServerType, upgrade_disk?: boolean }`
- `ResizeResponse` — `{ action: ActionResponse, new_type: string, deposit_delta: string }`
- `RebuildRequest` — `{ image: SpawnImage }`
- `RebuildResponse` — `{ action: ActionResponse, root_password: string | null }`
- `SshKeyResponse` — `{ id: string, hetzner_id: number, name: string, fingerprint: string, owner_wallet: string, created_at: string }`
- `CreateSshKeyRequest` — `{ name: string, public_key: string }`
- `SshKeyListResponse` — `{ ssh_keys: SshKeyResponse[] }`

## Phase 2 — Database

### Modify: `packages/spawn/src/db.ts`

Add `ssh_keys` table:

```sql
CREATE TABLE IF NOT EXISTS ssh_keys (
  id            TEXT PRIMARY KEY,
  hetzner_id    INTEGER NOT NULL,
  owner_wallet  TEXT NOT NULL,
  name          TEXT NOT NULL,
  fingerprint   TEXT NOT NULL,
  created_at    INTEGER NOT NULL
)
```

Index: `ssh_keys(owner_wallet)`

SSH key IDs: `sk_` + 8 random hex chars

New functions:
- `insertSshKey(params): void`
- `getSshKeyById(id: string): SshKeyRow | null`
- `getSshKeysByOwner(owner: string): SshKeyRow[]`
- `deleteSshKeyRow(id: string): void`

## Phase 3 — Hetzner client additions

### Modify: `packages/spawn/src/hetzner.ts`

Add functions wrapping Hetzner actions API:
- `powerOnServer(id: number): Promise<HetznerActionResponse>` — POST /v1/servers/{id}/actions/poweron
- `shutdownServer(id: number): Promise<HetznerActionResponse>` — POST /v1/servers/{id}/actions/shutdown
- `rebootServer(id: number): Promise<HetznerActionResponse>` — POST /v1/servers/{id}/actions/reboot
- `changeServerType(id: number, serverType: string, upgradeDisk: boolean): Promise<HetznerActionResponse>` — POST /v1/servers/{id}/actions/change_type
- `rebuildServer(id: number, image: string): Promise<HetznerRebuildResponse>` — POST /v1/servers/{id}/actions/rebuild

Add SSH key functions:
- `createHetznerSshKey(params): Promise<HetznerSshKeyResponse>` — POST /v1/ssh_keys
- `listHetznerSshKeys(labelSelector: string): Promise<HetznerSshKeyListResponse>` — GET /v1/ssh_keys
- `deleteHetznerSshKey(id: number): Promise<void>` — DELETE /v1/ssh_keys/{id}

Add response types: `HetznerActionResponse` (single action object), `HetznerRebuildResponse`, `HetznerSshKeyResponse`, `HetznerSshKeyListResponse`

## Phase 4 — Service functions

### Modify: `packages/spawn/src/service.ts`

**VM action functions** (all follow same pattern):
1. checkServerOwnership(id, caller)
2. Call Hetzner action API with row.hetzner_id
3. Update server status in SQLite (e.g., "off" after stop)
4. Return action response

- `startServer(id, caller)` → poweron, no status change needed (Hetzner handles)
- `stopServer(id, caller)` → shutdown
- `rebootServer(id, caller)` → reboot
- `resizeServer(id, caller, request)` → validate new type, change_type, update type in DB
- `rebuildServer(id, caller, request)` → validate image, rebuild, update image in DB

**SSH key functions:**
- `registerSshKey(request, caller)` → validate name/public_key, create on Hetzner (with wallet label), store in SQLite
- `listSshKeys(caller)` → query SQLite by owner
- `deleteSshKey(id, caller)` → ownership check (SQLite), delete on Hetzner, delete from SQLite

## Phase 5 — Route handlers

### Modify: `packages/spawn/src/index.ts`

Add route pricing to SPAWN_ROUTES constant (8 new entries).

Add routes:
- `POST /v1/servers/:id/start`
- `POST /v1/servers/:id/stop`
- `POST /v1/servers/:id/reboot`
- `POST /v1/servers/:id/resize`
- `POST /v1/servers/:id/rebuild`
- `POST /v1/ssh-keys`
- `GET /v1/ssh-keys`
- `DELETE /v1/ssh-keys/:id`

All follow the same handler pattern: extract caller, parse body if needed, call service, map result to HTTP response.

## Phase 6 — Tests

### Modify: `packages/spawn/test/spawn.test.ts`

Add test cases:

| Test | Expected |
|------|----------|
| Start server (owner) | 200, action object |
| Start server (not owner) | 403 |
| Stop server | 200, action object |
| Reboot server | 200, action object |
| Resize server (valid type) | 200, action + new_type |
| Resize server (invalid type) | 400 |
| Rebuild server (valid image) | 200, action |
| Rebuild server (invalid image) | 400 |
| Register SSH key | 201, ssh_key object with sk_ ID |
| List SSH keys (has keys) | 200, array |
| List SSH keys (empty) | 200, empty array |
| Delete SSH key (owner) | 200 |
| Delete SSH key (not owner) | 403 |
| Hetzner action failure | 502, hetzner_error |

## Files changed

| File | Action |
|------|--------|
| `packages/spawn/src/api.ts` | **Modify** — add action/resize/rebuild/ssh-key types |
| `packages/spawn/src/db.ts` | **Modify** — add ssh_keys table + CRUD |
| `packages/spawn/src/hetzner.ts` | **Modify** — add 8 Hetzner API functions |
| `packages/spawn/src/service.ts` | **Modify** — add 8 service functions |
| `packages/spawn/src/index.ts` | **Modify** — add 8 routes + pricing |
| `packages/spawn/test/spawn.test.ts` | **Modify** — add 14+ test cases |

## Before closing

- [ ] `pnpm --filter @agentstack/spawn check` passes
- [ ] All 5 VM actions work (start, stop, reboot, resize, rebuild)
- [ ] SSH key CRUD works (register, list, delete)
- [ ] Ownership enforced on all operations
- [ ] Invalid type/image returns 400
- [ ] Hetzner failures return 502
- [ ] All routes have x402 pricing
- [ ] SSH key IDs use `sk_` prefix
