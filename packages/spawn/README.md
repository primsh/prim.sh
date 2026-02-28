<!-- THIS FILE IS GENERATED — DO NOT EDIT
     Source: packages/spawn/prim.yaml + packages/spawn/src/api.ts
     Regenerate: pnpm gen:docs -->

# spawn.sh

> VPS in one API call. Deploy, scale, destroy. Per-second billing.

Part of [prim.sh](https://prim.sh) — zero install, one curl, infinite primitives. x402 payment (USDC on Base) is the sole auth.

## Routes

| Route | Description | Price | Request | Response |
|-------|-------------|-------|---------|----------|
| `POST /v1/servers` | Provision a new VPS. Returns immediately with status 'initializing'. | $0.01 | `CreateServerRequest` | `CreateServerResponse` |
| `GET /v1/servers` | List all servers owned by the calling wallet | $0.001 | `—` | `ServerListResponse` |
| `GET /v1/servers/:id` | Get full details for a single server. Poll this until status='running'. | $0.001 | `—` | `ServerResponse` |
| `DELETE /v1/servers/:id` | Destroy a server and release its resources. Unused deposit is refunded. | $0.005 | `—` | `DeleteServerResponse` |
| `POST /v1/servers/:id/start` | Start a stopped server | $0.002 | `—` | `ActionOnlyResponse` |
| `POST /v1/servers/:id/stop` | Stop a running server (graceful shutdown) | $0.002 | `—` | `ActionOnlyResponse` |
| `POST /v1/servers/:id/reboot` | Reboot a running server | $0.002 | `—` | `ActionOnlyResponse` |
| `POST /v1/servers/:id/resize` | Change server type (CPU/RAM). Server must be stopped first. Deposit adjusted. | $0.01 | `ResizeRequest` | `ResizeResponse` |
| `POST /v1/servers/:id/rebuild` | Reinstall from a fresh OS image. All data on server is destroyed. | $0.005 | `RebuildRequest` | `RebuildResponse` |
| `POST /v1/ssh-keys` | Register a public SSH key. Returned ID can be used in ssh_keys when creating a server. | $0.001 | `CreateSshKeyRequest` | `SshKeyResponse` |
| `GET /v1/ssh-keys` | List all SSH keys registered by the calling wallet | $0.001 | `—` | `SshKeyListResponse` |
| `DELETE /v1/ssh-keys/:id` | Remove an SSH key. Keys in use by active servers remain until server is rebuilt. | $0.001 | `—` | `—` |

## Pricing

| Operation | Price | Notes |
|-----------|-------|-------|
| Create server | $0.01 | One-time provisioning |
| s-1vcpu-1gb | $0.012/hr |  |
| s-2vcpu-4gb | $0.036/hr |  |
| s-4vcpu-8gb | $0.071/hr |  |
| Bandwidth | $0.01/GB |  |

## Request / Response Types

### `CreateServerRequest`

| Field | Type | Required |
|-------|------|----------|
| `name` | `string` | required |
| `type` | `string` | required |
| `image` | `string` | required |
| `location` | `string` | required |
| `provider` | `string` | optional |
| `ssh_keys` | `string[]` | optional |
| `user_data` | `string` | optional |

### `CreateServerResponse`

| Field | Type | Description |
|-------|------|-------------|
| `server` | `ServerResponse` | Created server object (initial status: "initializing"). |
| `action` | `ActionResponse` | Action object tracking the provisioning progress. |
| `deposit_charged` | `string` | USDC charged for this server as a decimal string. |
| `deposit_remaining` | `string` | Remaining USDC deposit balance as a decimal string. |

### `ServerResponse`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Prim server ID (e.g. "srv_abc123"). |
| `provider` | `string` | Cloud provider (e.g. "digitalocean"). |
| `provider_id` | `string` | Provider-assigned server ID. |
| `name` | `string` | Server name (label). |
| `type` | `string` | Server type slug (e.g. "small"). |
| `status` | `ServerStatus` | Current server lifecycle status. |
| `image` | `string` | OS image slug (e.g. "ubuntu-24.04"). |
| `location` | `string` | Data center slug (e.g. "nyc3"). |
| `public_net` | `PublicNet` | Public IP addresses. |
| `owner_wallet` | `string` | Ethereum address of the server owner. |
| `created_at` | `string` | ISO 8601 timestamp when the server was created. |

### `DeleteServerResponse`

| Field | Type | Description |
|-------|------|-------------|
| `status` | `"deleted"` | Always "deleted" on success. |
| `deposit_refunded` | `string` | USDC refunded to wallet as a decimal string. |

### `ActionOnlyResponse`

| Field | Type | Description |
|-------|------|-------------|
| `action` | `ActionResponse` | Action object for the requested operation. |

### `ResizeRequest`

| Field | Type | Required |
|-------|------|----------|
| `type` | `string` | required |
| `upgrade_disk` | `boolean` | optional |

### `ResizeResponse`

| Field | Type | Description |
|-------|------|-------------|
| `action` | `ActionResponse` | Action object (command: "resize"). |
| `new_type` | `string` | Target server type after resize. |
| `deposit_delta` | `string` | USDC deposit change as a decimal string. Positive = charged, negative = refunded. |

### `RebuildRequest`

| Field | Type | Required |
|-------|------|----------|
| `image` | `string` | required |

### `RebuildResponse`

| Field | Type | Description |
|-------|------|-------------|
| `action` | `ActionResponse` | Action object (command: "rebuild"). |
| `root_password` | `string | null` | New root password if no SSH keys configured. Null if SSH keys are installed. |

### `CreateSshKeyRequest`

| Field | Type | Required |
|-------|------|----------|
| `name` | `string` | required |
| `public_key` | `string` | required |

### `SshKeyResponse`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Prim SSH key ID (e.g. "key_abc123"). |
| `provider` | `string` | Cloud provider. |
| `provider_id` | `string` | Provider-assigned key ID. |
| `name` | `string` | Key label. |
| `fingerprint` | `string` | SSH key fingerprint. |
| `owner_wallet` | `string` | Ethereum address of the key owner. |
| `created_at` | `string` | ISO 8601 timestamp when the key was registered. |

## Providers

| Provider | Status | Default |
|----------|--------|---------|
| [digitalocean](https://www.digitalocean.com/) | active | yes |
| [hetzner](https://www.hetzner.com/cloud/) | active | no |

## Usage

```bash
# Install
curl -fsSL https://spawn.prim.sh/install.sh | sh

# Example request
curl -X POST https://spawn.prim.sh/v1/servers \
  -H "X-402-Payment: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Environment

- `PRIM_PAY_TO`
- `PRIM_NETWORK`
- `DO_API_TOKEN`
- `WALLET_INTERNAL_URL`

## Development

```bash
pnpm install
pnpm dev           # run locally (port 3004)
pnpm check         # lint + typecheck + test
pnpm test          # tests only
pnpm typecheck     # typecheck only
```

## x402 Payment

Every paid endpoint requires an x402 payment header (USDC on Base). Use the [x402 client](https://github.com/coinbase/x402) or prim's wallet.sh to pay.

## License

Apache-2.0
