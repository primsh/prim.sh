# spawn.sh Spec

> VPS provisioning for agents. Create, resize, destroy. No signup.

## What It Does

spawn.sh lets agents provision and manage cloud VPS instances with no human signup or dashboard. Payment via x402 (USDC on Base) is the sole authentication mechanism. Under the hood, spawn.sh wraps the Hetzner Cloud API — the agent never touches Hetzner credentials directly. The ownership model is simple: the wallet address that pays for a server owns it. Agents can create, inspect, resize, rebuild, and destroy VMs entirely programmatically.

## Architecture

```
Agent
    ↓
spawn.sh API (Hono + x402 middleware)
    ↓
┌─────────────────────────────────────────┐
│  spawn.sh wrapper                        │
│                                          │
│  Server management  ←→ Hetzner REST API  │  (create/list/get/delete servers)
│  VM actions         ←→ Hetzner Actions   │  (start/stop/reboot/resize/rebuild)
│  SSH keys           ←→ Hetzner SSH Keys  │  (register/list/delete)
│  Ownership map      ←→ SQLite            │  (wallet → server_id mapping)
│  Deposit ledger     ←→ SQLite            │  (prepaid balance per wallet)
│  State cache        ←→ SQLite            │  (server status, lifecycle events)
└─────────────────────────────────────────┘
    ↓
Hetzner Cloud API (api.hetzner.cloud/v1)
    ↓
Hetzner infrastructure (VPS on shared GDPR-compliant EU/US datacenters)
```

## API Surface

### VM Management

#### Create Server

```
POST /v1/servers
```

x402 cost: $0.01 operation fee + deposit charged against balance (see Pricing)

Request:
```json
{
  "name": "my-agent-node",
  "type": "small",
  "image": "ubuntu-24.04",
  "location": "nbg1",
  "ssh_keys": ["sk_abc123"],
  "user_data": "#!/bin/bash\napt-get update"
}
```

Fields:
- `name` — Server hostname. Must be unique within the wallet's servers. Alphanumeric + hyphens.
- `type` — spawn.sh server type: `small`, `medium`, `large`, `arm-small` (see Server Types)
- `image` — OS image slug. Supported: `ubuntu-24.04`, `ubuntu-22.04`, `debian-12`, `fedora-41`
- `location` — Hetzner datacenter region: `nbg1` (Nuremberg), `fsn1` (Falkenstein), `hel1` (Helsinki), `ash` (Ashburn), `hil` (Hillsboro)
- `ssh_keys` — Array of spawn.sh SSH key IDs (registered via `/v1/ssh-keys`). Optional but strongly recommended.
- `user_data` — Cloud-init script. Optional.

Response `201 Created`:
```json
{
  "server": {
    "id": "srv_9x2k",
    "hetzner_id": 12345678,
    "name": "my-agent-node",
    "type": "small",
    "status": "initializing",
    "image": "ubuntu-24.04",
    "location": "nbg1",
    "public_net": {
      "ipv4": null,
      "ipv6": null
    },
    "created_at": "2026-02-24T10:00:00Z",
    "owner_wallet": "0xabc...def"
  },
  "action": {
    "id": "act_77ff",
    "status": "running",
    "command": "create_server",
    "started": "2026-02-24T10:00:00Z"
  },
  "deposit_charged": "5.00",
  "deposit_remaining": "20.00"
}
```

Note: `public_net.ipv4` and `ipv6` are null immediately after creation. Poll `GET /v1/servers/:id` until status is `running` and IPs are populated (typically 30–60 seconds).

#### List Servers

```
GET /v1/servers
```

x402 cost: $0.001

Returns only servers owned by the calling wallet. Filtered via Hetzner's label selector (`wallet=0x...`).

Query params:
- `status` — Filter by status: `initializing`, `running`, `stopped`, `rebuilding`, `migrating`
- `limit` — Max results per page (default 25, max 100)
- `page` — Page number (1-indexed)

Response `200 OK`:
```json
{
  "servers": [
    {
      "id": "srv_9x2k",
      "hetzner_id": 12345678,
      "name": "my-agent-node",
      "type": "small",
      "status": "running",
      "image": "ubuntu-24.04",
      "location": "nbg1",
      "public_net": {
        "ipv4": "1.2.3.4",
        "ipv6": "2a01:4f8::1"
      },
      "created_at": "2026-02-24T10:00:00Z",
      "owner_wallet": "0xabc...def"
    }
  ],
  "meta": {
    "page": 1,
    "per_page": 25,
    "total": 1
  }
}
```

#### Get Server

```
GET /v1/servers/:id
```

x402 cost: $0.001

`:id` is the spawn.sh server ID (`srv_...`). Returns 403 if the server is owned by a different wallet.

Response `200 OK`:
```json
{
  "server": {
    "id": "srv_9x2k",
    "hetzner_id": 12345678,
    "name": "my-agent-node",
    "type": "small",
    "status": "running",
    "image": "ubuntu-24.04",
    "location": "nbg1",
    "public_net": {
      "ipv4": "1.2.3.4",
      "ipv6": "2a01:4f8::1"
    },
    "cores": 2,
    "memory_gb": 4,
    "disk_gb": 40,
    "created_at": "2026-02-24T10:00:00Z",
    "owner_wallet": "0xabc...def",
    "deposit_remaining": "18.50",
    "deposit_expires_at": "2026-03-24T10:00:00Z"
  }
}
```

#### Destroy Server

```
DELETE /v1/servers/:id
```

x402 cost: $0.005

Permanently destroys the server. No undo. spawn.sh deletes the Hetzner server and releases the deposit (unused portion refunded to wallet deposit balance for reuse on other servers — not returned to USDC). Returns 403 if not the owner.

Response `200 OK`:
```json
{
  "status": "deleted",
  "deposit_refunded": "12.30"
}
```

---

### VM Actions

#### Start Server

```
POST /v1/servers/:id/start
```

x402 cost: $0.002

Powers on a stopped server. No-op if already running.

Response `200 OK`:
```json
{
  "action": {
    "id": "act_88ab",
    "status": "running",
    "command": "start_server",
    "started": "2026-02-24T11:00:00Z"
  }
}
```

#### Stop Server

```
POST /v1/servers/:id/stop
```

x402 cost: $0.002

Graceful ACPI shutdown (OS-level). Use when you want a clean shutdown. The server still accrues Hetzner hourly costs while stopped (Hetzner bills for powered-off servers). To stop billing, use `DELETE /v1/servers/:id`.

Response `200 OK`:
```json
{
  "action": {
    "id": "act_99cd",
    "status": "running",
    "command": "stop_server",
    "started": "2026-02-24T11:05:00Z"
  }
}
```

#### Reboot Server

```
POST /v1/servers/:id/reboot
```

x402 cost: $0.002

Graceful reboot. OS handles shutdown + restart sequence.

Response `200 OK`:
```json
{
  "action": {
    "id": "act_11ef",
    "status": "running",
    "command": "reboot_server",
    "started": "2026-02-24T11:10:00Z"
  }
}
```

#### Resize Server

```
POST /v1/servers/:id/resize
```

x402 cost: $0.01

Changes the server type. The server must be stopped before resizing. spawn.sh will stop it automatically if running. Resizing to a larger type succeeds immediately. Resizing to a smaller type is only possible if disk fits (Hetzner restriction: disk cannot shrink).

Request:
```json
{
  "type": "medium",
  "upgrade_disk": false
}
```

- `type` — Target spawn.sh server type: `small`, `medium`, `large`, `arm-small`
- `upgrade_disk` — Whether to also upgrade disk size. Default `false`. If `false`, Hetzner keeps the original disk (allows future downgrade). If `true`, disk grows to new type's default (irreversible).

Response `200 OK`:
```json
{
  "action": {
    "id": "act_22gh",
    "status": "running",
    "command": "resize_server",
    "started": "2026-02-24T11:15:00Z"
  },
  "new_type": "medium",
  "deposit_delta": "-1.50"
}
```

Note: Upgrading to a larger type increases the daily deposit burn rate. `deposit_delta` shows the additional amount charged immediately to cover the remainder of the billing period.

#### Rebuild Server

```
POST /v1/servers/:id/rebuild
```

x402 cost: $0.005

Reinstalls the OS. All data on the server is erased. SSH keys are re-applied. Server status transitions to `rebuilding → initializing → running`.

Request:
```json
{
  "image": "debian-12"
}
```

Response `200 OK`:
```json
{
  "action": {
    "id": "act_33ij",
    "status": "running",
    "command": "rebuild_server",
    "started": "2026-02-24T11:20:00Z"
  },
  "root_password": null
}
```

Note: `root_password` is null when SSH keys are present. If no SSH keys are attached to the server, Hetzner generates and returns a temporary root password here.

---

### SSH Keys

#### Register SSH Key

```
POST /v1/ssh-keys
```

x402 cost: $0.001

Registers a public key for use in server creation. Keys are owned by the calling wallet.

Request:
```json
{
  "name": "my-laptop",
  "public_key": "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... user@host"
}
```

Response `201 Created`:
```json
{
  "ssh_key": {
    "id": "sk_abc123",
    "name": "my-laptop",
    "fingerprint": "SHA256:abc...xyz",
    "created_at": "2026-02-24T09:00:00Z",
    "owner_wallet": "0xabc...def"
  }
}
```

#### List SSH Keys

```
GET /v1/ssh-keys
```

x402 cost: $0.001

Returns only keys owned by the calling wallet.

Response `200 OK`:
```json
{
  "ssh_keys": [
    {
      "id": "sk_abc123",
      "name": "my-laptop",
      "fingerprint": "SHA256:abc...xyz",
      "created_at": "2026-02-24T09:00:00Z",
      "owner_wallet": "0xabc...def"
    }
  ]
}
```

#### Delete SSH Key

```
DELETE /v1/ssh-keys/:id
```

x402 cost: $0.001

Removes the key from spawn.sh and Hetzner. Does not affect running servers that were already created with this key — SSH access on existing servers is not revoked. Returns 403 if not the owner.

Response `200 OK`:
```json
{
  "status": "deleted"
}
```

---

### Error Responses

All errors follow a consistent envelope:

```json
{
  "error": {
    "code": "not_found",
    "message": "Server srv_9x2k not found or not owned by this wallet",
    "status": 404
  }
}
```

Common error codes:

| HTTP Status | Code | Meaning |
|-------------|------|---------|
| 400 | `invalid_request` | Missing or malformed field |
| 402 | `payment_required` | x402 payment required (standard 402 flow) |
| 403 | `forbidden` | Resource owned by a different wallet |
| 404 | `not_found` | Resource does not exist |
| 409 | `conflict` | Action not valid for current server state (e.g., resize while running) |
| 422 | `insufficient_deposit` | Wallet deposit balance too low to create server |
| 429 | `rate_limited` | Too many requests |
| 503 | `hetzner_unavailable` | Upstream Hetzner API error |

---

## Hetzner API Mapping

Every spawn.sh endpoint maps 1:1 to a Hetzner Cloud API call. spawn.sh owns one Hetzner account and uses the Hetzner API key server-side. Agents never see Hetzner credentials.

| spawn.sh endpoint | Hetzner endpoint | Notes |
|-------------------|-----------------|-------|
| `POST /v1/servers` | `POST /v1/servers` | Translates type names; adds `labels: { wallet: "0x..." }` |
| `GET /v1/servers` | `GET /v1/servers?label_selector=wallet%3D0x...` | Filters by wallet label |
| `GET /v1/servers/:id` | `GET /v1/servers/{hetzner_id}` | Ownership verified via SQLite before Hetzner call |
| `DELETE /v1/servers/:id` | `DELETE /v1/servers/{hetzner_id}` | Ownership verified first |
| `POST /v1/servers/:id/start` | `POST /v1/servers/{hetzner_id}/actions/poweron` | |
| `POST /v1/servers/:id/stop` | `POST /v1/servers/{hetzner_id}/actions/shutdown` | Graceful ACPI shutdown |
| `POST /v1/servers/:id/reboot` | `POST /v1/servers/{hetzner_id}/actions/reboot` | |
| `POST /v1/servers/:id/resize` | `POST /v1/servers/{hetzner_id}/actions/change_type` | `server_type` field uses Hetzner internal name (CX23 etc.) |
| `POST /v1/servers/:id/rebuild` | `POST /v1/servers/{hetzner_id}/actions/rebuild` | `image` field translates slug |
| `POST /v1/ssh-keys` | `POST /v1/ssh_keys` | Also adds `labels: { wallet: "0x..." }` |
| `GET /v1/ssh-keys` | `GET /v1/ssh_keys?label_selector=wallet%3D0x...` | |
| `DELETE /v1/ssh-keys/:id` | `DELETE /v1/ssh_keys/{hetzner_id}` | Ownership verified first |

### Server Type Translation

| spawn.sh type | Hetzner type | vCPU | RAM | Disk |
|---------------|-------------|------|-----|------|
| `small` | `cx23` | 2 | 4 GB | 40 GB |
| `medium` | `cx33` | 4 | 8 GB | 80 GB |
| `large` | `cx43` | 8 | 16 GB | 160 GB |
| `arm-small` | `cax11` | 2 | 4 GB | 40 GB |

### Label Convention

Every Hetzner resource created by spawn.sh is labeled with `wallet=0x<address>`. This enables:
- Filtering (`GET /v1/servers?label_selector=wallet=0x...`)
- Ownership verification as a second layer beyond SQLite
- Recovery if the SQLite state is lost

---

## Pricing

spawn.sh has two cost layers per operation:

1. **x402 operation fee** — Charged per API call, covers spawn.sh infrastructure costs
2. **Deposit system** — Prepaid USDC that covers the Hetzner passthrough cost (hourly billing)

### Operation Fees (x402)

| Operation | x402 Fee |
|-----------|----------|
| Create server | $0.01 |
| List servers | $0.001 |
| Get server | $0.001 |
| Destroy server | $0.005 |
| Start / stop / reboot | $0.002 each |
| Resize server | $0.01 |
| Rebuild server | $0.005 |
| Register SSH key | $0.001 |
| List SSH keys | $0.001 |
| Delete SSH key | $0.001 |

### Server Type Pricing

Hetzner bills hourly. spawn.sh converts this to a deposit system with daily burn.

| spawn.sh type | Hetzner type | Hetzner price | Daily burn | Initial deposit | Deposit covers |
|---------------|-------------|---------------|------------|-----------------|----------------|
| `small` | CX23 | ~€3.29/mo | ~$0.15/day | $5.00 | ~33 days |
| `medium` | CX33 | ~€5.08/mo | ~$0.22/day | $7.50 | ~34 days |
| `large` | CX43 | ~€9.04/mo | ~$0.40/day | $13.00 | ~33 days |
| `arm-small` | CAX11 | ~€3.49/mo | ~$0.16/day | $5.25 | ~33 days |

Prices shown in USD at ~1.08 EUR/USD. Hetzner prices may change; spawn.sh adjusts deposit requirements accordingly with 30 days notice.

### Deposit Model

1. Agent funds their spawn.sh deposit wallet (separate from their x402 wallet, or same balance — TBD, see Unknowns)
2. On `POST /v1/servers`, spawn.sh charges the initial deposit from the agent's balance
3. Deposit balance decreases daily at the server's burn rate
4. When deposit drops below 3 days of burn rate, spawn.sh:
   - Sends a low-balance warning (via webhook if configured)
   - Agent has 3 days to top up or destroy the server
5. If deposit reaches zero, spawn.sh auto-destroys the server (with a final warning 24h prior)
6. On `DELETE /v1/servers/:id`, unused deposit balance is returned to the agent's spawn.sh balance (not to USDC on-chain — stays within the platform)

### Balance Top-Up

```
POST /v1/balance/deposit
```

x402 payment with amount in the request. Credits the wallet's spawn.sh balance.

```
GET /v1/balance
```

x402 cost: free (no payment required for balance check)

Response:
```json
{
  "balance": "20.00",
  "reserved": "10.25",
  "available": "9.75"
}
```

- `balance` — Total deposited USDC
- `reserved` — Amount locked in active server deposits
- `available` — Free balance for new servers

---

## VM Lifecycle

### State Machine

```
                        ┌─────────────────┐
           POST /servers │                 │
    ─────────────────────→  initializing   │
                        │                 │
                        └────────┬────────┘
                                 │ Hetzner ready
                                 ↓
                        ┌─────────────────┐
                        │                 │←─────────────────────┐
                        │    running      │                      │
                        │                 │──────────────────────┘
                        └────────┬────────┘   /start (from off)
                                 │ /stop
                                 ↓
                        ┌─────────────────┐
                        │                 │
                        │      off        │
                        │                 │
                        └────────┬────────┘
                                 │ /start
                                 └──────────────────────────────┐
                                                                ↓
                                                      ┌─────────────────┐
                                                      │    running      │
                                                      └─────────────────┘

    From running or off:
    /rebuild → rebuilding → initializing → running
    /resize  → migrating  → running (new type)
    /delete  → deleting   → [gone]
    deposit exhausted → auto-destroying → [gone]
```

### Hetzner Status Mapping

| Hetzner status | spawn.sh status | Meaning |
|---------------|----------------|---------|
| `initializing` | `initializing` | Server being created, no IP yet |
| `starting` | `initializing` | OS booting |
| `running` | `running` | Fully operational |
| `stopping` | `stopping` | Graceful shutdown in progress |
| `off` | `off` | Powered off (still billed by Hetzner) |
| `deleting` | `destroying` | Being deleted |
| `migrating` | `migrating` | Resize in progress |
| `rebuilding` | `rebuilding` | OS reinstall in progress |
| `unknown` | `unknown` | Hetzner reported unknown state |

### Action Polling

VM actions (create, resize, rebuild, etc.) are asynchronous. Hetzner returns an action object with a status. spawn.sh exposes the same action tracking:

```
GET /v1/actions/:action_id
```

x402 cost: free

Response:
```json
{
  "action": {
    "id": "act_77ff",
    "status": "success",
    "command": "create_server",
    "started": "2026-02-24T10:00:00Z",
    "finished": "2026-02-24T10:00:45Z",
    "error": null
  }
}
```

`status` values: `running`, `success`, `error`

---

## Ownership Model

The wallet address extracted from the x402 payment header is the server's owner. spawn.sh maintains a SQLite table mapping `wallet_address → [server_ids]`.

Hetzner resources are labeled with `wallet=0x<address>`. This label is immutable after creation (labels can be updated, but spawn.sh does not do this). Ownership transfer is not supported.

On every mutating operation (stop, resize, delete, etc.), spawn.sh:
1. Looks up the wallet address from the x402 payment
2. Queries SQLite: does `server_id` belong to this wallet?
3. If no → returns 403 immediately, no Hetzner API call is made

The Hetzner label serves as a secondary truth source for reconciliation if SQLite is corrupted or restored.

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Cloud provider | Hetzner Cloud | Best EU price-to-performance, good API, GDPR-compliant, competitive ARM offering |
| Server type abstraction | `small/medium/large/arm-small` | Agents don't need Hetzner knowledge; naming is stable even if underlying types change |
| Auth model | wallet from x402 = owner | Consistent with wallet.sh and relay.sh — no separate auth layer |
| Billing | Deposit + daily burn | Hetzner bills hourly; deposit model gives agents predictable costs without on-chain transactions every hour |
| Deposit refund | Platform balance only (not on-chain) | Avoids on-chain transfer fees for small amounts; USDC withdrawal to chain available via wallet.sh |
| State store | SQLite (bun:sqlite) | Same pattern as wallet.sh and relay.sh; embedded, zero-config |
| Hetzner account | Single shared account | spawn.sh owns one Hetzner account; agents never get Hetzner access |
| OS images | Fixed allowlist | Unlimited images = untested combinations; start with 4 Ubuntu/Debian/Fedora variants |
| Resize behavior | Auto-stop then resize | Simplifies UX — agent doesn't need to stop first; spawn.sh handles the sequence |
| Multi-region | Supported at launch | Hetzner has EU + US regions; no extra complexity to expose location param |

---

## Unknowns

1. **Deposit wallet architecture** — Does the agent pay deposit top-ups via x402 (which routes through their wallet.sh wallet), or does spawn.sh maintain a completely separate USDC balance per wallet? If via x402, every deposit top-up is an on-chain transaction. If via a spawn.sh internal ledger, the agent makes one large on-chain payment and spawn.sh tracks the balance off-chain. Leaning toward internal ledger (like prepaid credit), but this requires spawn.sh to custody USDC.

2. **USDC custody** — If spawn.sh holds USDC as deposit, it's acting as a custodian. Is this acceptable from a regulatory standpoint? Alternative: require the agent's wallet to hold sufficient balance and deduct automatically, but this requires spawn.sh to initiate pulls from the agent wallet (needs pre-authorization).

3. **Hetzner rate limits** — Hetzner limits API calls to 3,600 requests per hour per API key. If many agents are active simultaneously on the same Hetzner account, this could be a bottleneck. Options: multiple Hetzner accounts, request queuing, or per-wallet caching of list responses.

4. **Hetzner account billing reconciliation** — Hetzner bills the spawn.sh account at month-end in EUR. spawn.sh collects USDC from agents. EUR/USD fluctuation means spawn.sh may profit or lose on FX. Need to decide: build in an FX buffer (10-15% markup), hedge, or accept the exposure.

5. **Server naming conflicts** — Hetzner requires globally unique names within a project. If two agents both try to create a server named `web`, there's a conflict. Options: namespace by wallet (e.g., `0xabc-web`), append random suffix, or let the agent pick unique names and return 409 on conflict.

6. **Data residency** — Should spawn.sh restrict agents to specific regions? EU-only would simplify GDPR compliance for servers that may hold personal data. Or expose all Hetzner regions and let agents choose.

7. **Hetzner project isolation** — Should each agent wallet get its own Hetzner project, or all servers under one project? One project per wallet would give cleaner cost attribution and label-less filtering, but Hetzner's project limit (default 10, increasable) becomes a constraint.

8. **Auto-destroy grace period** — What's the right warning cadence before auto-destroy? Proposal: 7 days, 3 days, 1 day, 6 hours warnings. But the agent needs a channel to receive warnings (webhook? relay.sh email?).

9. **Hetzner price changes** — Hetzner can change pricing. spawn.sh deposit amounts need to be updated to match. Should this be automatic (query Hetzner pricing API at creation time) or manual (spawn.sh maintains a price table updated monthly)?

10. **IPv6-only servers** — Hetzner supports IPv6-only servers at lower cost. Worth exposing as a `network` option for agents running IPv6-compatible workloads.
