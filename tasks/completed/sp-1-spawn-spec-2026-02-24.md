# SP-1: Write spawn.sh spec (Hetzner API wrapping, VM lifecycle, pricing)

**Status:** Plan
**Spec:** — (this task creates the spec)
**Depends on:** — (independent)
**Blocks:** SP-2 (VM provisioning), SP-3 (lifecycle), SP-4 (SSH keys), SP-5 (x402 middleware)

## Context

spawn.sh lets agents provision and manage VPS instances via x402 payment. It wraps the Hetzner Cloud API. Before implementation, we need a spec doc (like `specs/wallet.md` and `specs/relay.md`) that defines the API surface, request/response shapes, pricing, and architecture.

This is a writing task, not a code task. The deliverable is `specs/spawn.md`.

## Goals

1. Define every spawn.sh endpoint with request/response JSON shapes
2. Map each endpoint to the underlying Hetzner Cloud API call
3. Define x402 pricing per operation
4. Document the VM lifecycle state machine
5. Specify SSH key management
6. Address the billing model (Hetzner bills hourly; agents pay per-operation via x402)

## Spec Structure

### File: `specs/spawn.md`

Follow the structure of `specs/wallet.md` and `specs/relay.md`:

1. **What It Does** — one-paragraph summary
2. **Architecture** — ASCII diagram showing agent → spawn.sh → Hetzner API
3. **API Surface** — every endpoint with method, path, request/response JSON
4. **Hetzner API Mapping** — table mapping spawn.sh endpoints to Hetzner endpoints
5. **Pricing** — x402 cost per operation + Hetzner passthrough cost model
6. **VM Lifecycle** — state diagram (creating → running → stopped → destroyed)
7. **Key Design Decisions** — table
8. **Unknowns** — open questions

### API Surface to define

**VM Management:**
```
POST   /v1/servers              # Create VM
GET    /v1/servers              # List VMs (owned by caller's wallet)
GET    /v1/servers/:id          # Get VM detail (IP, status, type)
DELETE /v1/servers/:id          # Destroy VM
```

**VM Actions:**
```
POST   /v1/servers/:id/start    # Power on
POST   /v1/servers/:id/stop     # Graceful shutdown
POST   /v1/servers/:id/reboot   # Graceful reboot
POST   /v1/servers/:id/resize   # Change server type
POST   /v1/servers/:id/rebuild  # Reinstall OS
```

**SSH Keys:**
```
POST   /v1/ssh-keys             # Register SSH public key
GET    /v1/ssh-keys             # List keys (owned by caller)
DELETE /v1/ssh-keys/:id         # Remove key
```

### Hetzner API mapping table

Each spawn.sh endpoint maps 1:1 to a Hetzner Cloud API call:

| spawn.sh | Hetzner | Notes |
|----------|---------|-------|
| `POST /v1/servers` | `POST /v1/servers` | Pass `name`, `server_type`, `image`, `location`, `ssh_keys`, `user_data` |
| `GET /v1/servers` | `GET /v1/servers?label_selector=wallet=0x...` | Filter by wallet label |
| `GET /v1/servers/:id` | `GET /v1/servers/{id}` | Direct passthrough |
| `DELETE /v1/servers/:id` | `DELETE /v1/servers/{id}` | Verify ownership first |
| `POST .../start` | `POST /v1/servers/{id}/actions/poweron` | |
| `POST .../stop` | `POST /v1/servers/{id}/actions/shutdown` | Graceful ACPI shutdown |
| `POST .../reboot` | `POST /v1/servers/{id}/actions/reboot` | |
| `POST .../resize` | `POST /v1/servers/{id}/actions/change_type` | |
| `POST .../rebuild` | `POST /v1/servers/{id}/actions/rebuild` | |
| `POST /v1/ssh-keys` | `POST /v1/ssh_keys` | |
| `GET /v1/ssh-keys` | `GET /v1/ssh_keys?label_selector=wallet=0x...` | |
| `DELETE /v1/ssh-keys/:id` | `DELETE /v1/ssh_keys/{id}` | |

### Pricing model to define

spawn.sh charges two layers:
1. **x402 operation fee** — per API call (e.g., $0.01 to create a VM, $0.001 to check status)
2. **Hetzner passthrough** — the actual VPS cost (hourly billing from Hetzner)

The spec must address how passthrough billing works:
- Agent pays x402 fee to spawn.sh per operation
- Hetzner bills the AgentStack Hetzner account hourly
- spawn.sh needs to recoup Hetzner costs — either via markup on creation, or periodic billing (like relay.sh mailbox TTL renewal)

**Recommendation for spec:** charge a creation deposit (e.g., $5.00 for CX23, covering ~1 month) plus hourly rate billed against the deposit. When deposit runs low, require renewal or auto-destroy. Similar to relay.sh mailbox TTL but with real-money stakes.

### Ownership model

Same as wallet.sh: the `walletAddress` from x402 payment is the owner. Hetzner servers are labeled with `wallet=0x...` for filtering. spawn.sh maps server IDs to wallet addresses in its own SQLite DB.

### VM lifecycle state machine

```
create → initializing → running → stopped → destroyed
                           ↑         ↓
                           └─────────┘ (start/stop)

running → resize → running (with new type)
running → rebuild → initializing → running (new OS)
```

States map to Hetzner's server statuses: `initializing`, `starting`, `running`, `stopping`, `off`, `deleting`, `migrating`, `rebuilding`.

### Request/response examples to include

The spec should include full JSON for at least:
- Create server request (with all fields) and response (with IP, status, action)
- Server detail response (with public_net, server_type, image)
- List servers response (with pagination)
- Error response (404 not found, 403 forbidden)

Base these directly on the Hetzner API shapes, wrapped in spawn.sh's envelope. The research output above has the exact Hetzner JSON shapes to reference.

### Server type selection

The spec should define which Hetzner server types are available through spawn.sh and at what markup. Include a pricing table:

| spawn.sh type | Hetzner type | vCPU | RAM | Disk | Hetzner price | spawn.sh deposit |
|---------------|-------------|------|-----|------|---------------|-----------------|
| `small` | CX23 | 2 | 4 GB | 40 GB | ~€3/mo | TBD |
| `medium` | CX33 | 4 | 8 GB | 80 GB | ~€5/mo | TBD |
| `large` | CX43 | 8 | 16 GB | 160 GB | ~€9/mo | TBD |
| `arm-small` | CAX11 | 2 | 4 GB | 40 GB | ~€3.29/mo | TBD |

Use simplified names (not Hetzner's CX23/CAX11) so agents don't need Hetzner domain knowledge.

## Files changed (summary)

| File | Action |
|------|--------|
| `specs/spawn.md` | **New** — full spawn.sh specification |

## Before closing

- [ ] Spec covers all endpoints listed above with JSON request/response shapes
- [ ] Hetzner API mapping table is complete (every spawn.sh endpoint → Hetzner endpoint)
- [ ] Pricing model addresses both x402 fees and Hetzner passthrough costs
- [ ] VM lifecycle state machine is documented with all transitions
- [ ] Ownership model is explicit (wallet address = owner, labeled on Hetzner)
- [ ] SSH key management endpoints are fully specified
- [ ] Unknowns section lists open questions (billing reconciliation, rate limits, multi-region)
- [ ] Spec follows the structure of `specs/wallet.md` and `specs/relay.md`
