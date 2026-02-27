---
name: spawn
version: 1.0.0
primitive: spawn.prim.sh
requires: [wallet]
tools:
  - spawn_create_server
  - spawn_list_servers
  - spawn_get_server
  - spawn_delete_server
  - spawn_start_server
  - spawn_stop_server
  - spawn_reboot_server
  - spawn_resize_server
  - spawn_rebuild_server
  - spawn_create_ssh_key
  - spawn_list_ssh_keys
  - spawn_delete_ssh_key
---

# spawn.prim.sh

VPS provisioning for agents. Create, manage, and destroy virtual machines without a cloud account. Backed by Hetzner. Payment via x402 (deposit model).

## When to use

Use spawn when you need to:
- Run a process that outlives your agent session
- Execute workloads that require more CPU or memory than your current environment
- Host a service accessible over the internet (get a public IP)
- Run untrusted code in isolation
- Provision infrastructure as part of a deployment pipeline

Do NOT use spawn for:
- Short-lived compute (a server has a minimum hourly cost; use spawn only if you need it for minutes or more)
- Database hosting without a backup plan (servers are ephemeral — store important data in store.prim.sh)

## Prerequisites

- Registered wallet with USDC balance (create takes a deposit — typically ~$5 for a small server for a day)
- SSH key registered with `spawn_ssh_key_create` BEFORE creating a server (you cannot add SSH keys after creation without rebuilding)
- Wallet on access allowlist (private beta)

## Common workflows

### 1. Register an SSH key and create a server

```
1. spawn_create_ssh_key
   - name: "agent-key"
   - public_key: "ssh-ed25519 AAAA..."
   → returns ssh_key with id (e.g. "key_abc123")

2. spawn_create_server
   - name: "my-server"
   - type: "small"
   - image: "ubuntu-24.04"
   - location: "nyc3"
   - ssh_keys: ["key_abc123"]
   - user_data: "#!/bin/bash\napt-get update -y"  (optional cloud-init)
   → returns {server: {id, status: "initializing", ...}, action, deposit_charged}

3. Poll spawn_get_server with server id every 5–10 seconds
   → wait until status = "running" AND public_net.ipv4.ip is non-null

4. SSH into server using the IP from step 3
```

### 2. Stop and resize a server

```
1. spawn_stop_server with server id
   → returns {action: {status: "running", ...}}
   → poll spawn_get_server until status = "off"

2. spawn_resize_server
   - id: <server id>
   - type: "medium"
   - upgrade_disk: false   (true = irreversible disk upgrade)
   → returns {action, new_type, deposit_delta}
   → if deposit_delta is positive, additional USDC is charged

3. spawn_start_server with server id
   → poll until status = "running"
```

### 3. Rebuild a server (clean OS reinstall)

```
1. spawn_rebuild_server
   - id: <server id>
   - image: "debian-12"
   → returns {action, root_password}
   → root_password is non-null only if no SSH keys are configured

WARNING: All data on the server is destroyed. Back up to store.prim.sh first.
```

### 4. Delete a server

```
1. spawn_delete_server with server id
   → returns {status: "deleted", deposit_refunded: "3.50"}
   → unused deposit is refunded to your wallet balance
```

### 5. List all servers

```
1. spawn_list_servers
   - limit: 20  (default)
   - page: 1
   → returns {servers: [...], meta: {page, per_page, total}}
```

## Server lifecycle states

```
initializing → running → off → running (after start)
                       → destroying → deleted (after delete)
                       → rebuilding → running (after rebuild)
                       → migrating (provider maintenance, wait)
```

Poll `spawn_get_server` and check `status` until you reach your target state. All operations return an `action` object — the action `status` field ("running", "success", "error") tracks the in-progress operation, while the server `status` field tracks the server's lifecycle.

## Error handling

- `invalid_request` → Missing required fields (name, type, image, location are all required). Check field names.
- `server_limit_exceeded` (403) → Wallet has reached the 3 concurrent server limit. Delete an existing server first.
- `type_not_allowed` → Only `small` type is available in beta. Do not request other types.
- `insufficient_deposit` → Not enough USDC in wallet to cover the deposit. Fund wallet and retry.
- `not_found` (404) → Server or SSH key ID does not exist. Verify the ID.
- `forbidden` (403) → Server or key belongs to a different wallet.
- `provider_error` (502) → DigitalOcean/Hetzner API error. Retry after a short wait. If persistent, check `spawn_list_servers` — the server may have been created despite the error.
- `not_implemented` → Feature not yet available.

## Gotchas

- **Register SSH keys before creating servers.** There is no endpoint to add SSH keys to a running server without rebuilding it. Always call `spawn_create_ssh_key` first and pass the ID in `ssh_keys` during `spawn_create_server`.
- **Poll for running status.** `spawn_create_server` returns immediately with `status: "initializing"`. The IP address is null until the server is running. Always poll `spawn_get_server` before trying to connect.
- **Stop before resize.** `spawn_resize_server` fails if the server is not stopped. Call `spawn_stop_server` and wait for `status: "off"` before resizing.
- **Disk upgrades are irreversible.** If you pass `upgrade_disk: true` in `spawn_resize_server`, the disk cannot be downsized later. Default is false.
- **Rebuild destroys all data.** `spawn_rebuild_server` wipes the server. Store critical data in store.prim.sh before rebuilding.
- **Deposit model:** `spawn_server_create` charges a deposit (e.g. "$5.00") upfront. When you delete the server, unused deposit is refunded as `deposit_refunded`.
- **3 server limit (beta).** You cannot have more than 3 concurrent servers. Delete servers you're done with.
- **Small type only (beta).** 1 vCPU, 1 GB RAM. No other types available yet.

## Related primitives

- **wallet** — Required. Deposit is charged from your wallet balance.
- **store** — Persist config files and data before/after server lifecycle. Use store to back up server state before deleting or rebuilding.
- **faucet** — Get test USDC for testnet server experiments.
