# dns.sh Spec

> DNS for agents. Create zones, manage records, verify propagation. No signup.

## What It Does

dns.sh lets agents manage DNS records programmatically with no human signup or dashboard. Payment via x402 (USDC on Base) is the sole authentication mechanism. Under the hood, dns.sh wraps the Cloudflare DNS API — the agent never touches Cloudflare credentials directly. The ownership model is simple: the wallet address that pays for a zone owns it.

dns.sh is also foundational infrastructure for other AgentStack primitives:
- **relay.sh** uses dns.sh to configure MX/SPF/DKIM/DMARC records for mail domains
- **spawn.sh** could use dns.sh for VM hostname A records
- Agents use dns.sh to manage their own custom domains

## Architecture

```
Agent
    ↓
dns.sh API (Hono + x402 middleware)
    ↓
┌───────────────────────────────────────────┐
│  dns.sh wrapper                            │
│                                            │
│  Zone management    ←→ Cloudflare Zones    │  (create/list/get/delete zones)
│  Record CRUD        ←→ Cloudflare DNS      │  (A/AAAA/CNAME/MX/TXT/SRV)
│  Batch operations   ←→ Cloudflare Batch    │  (atomic multi-record changes)
│  Verification       ←→ DNS query           │  (check propagation)
│  Ownership map      ←→ SQLite              │  (wallet → zone_id mapping)
└───────────────────────────────────────────┘
    ↓
Cloudflare API (api.cloudflare.com/client/v4)
    ↓
Cloudflare DNS (anycast network, global)
```

## API Surface

### Zone Management

#### Create Zone

```
POST /v1/zones
```

x402 cost: $0.05

Request:
```json
{
  "domain": "myagent.com"
}
```

Response:
```json
{
  "id": "z_a1b2c3d4",
  "domain": "myagent.com",
  "status": "pending",
  "nameservers": ["ns1.cloudflare.com", "ns2.cloudflare.com"],
  "owner_wallet": "0x...",
  "created_at": "2026-02-24T..."
}
```

Status values: `pending` (nameservers not yet pointed), `active` (nameservers confirmed), `moved` (nameservers changed away).

Note: After zone creation, the agent must update their domain registrar's nameservers to the returned Cloudflare nameservers. dns.sh cannot do this — it's registrar-specific. The zone transitions to `active` once Cloudflare detects the nameserver change.

#### List Zones

```
GET /v1/zones
```

x402 cost: $0.001

Query: `?limit=20&after=<cursor>`

Response:
```json
{
  "zones": [
    {
      "id": "z_a1b2c3d4",
      "domain": "myagent.com",
      "status": "active",
      "record_count": 12,
      "created_at": "2026-02-24T..."
    }
  ],
  "cursor": null
}
```

#### Get Zone

```
GET /v1/zones/:id
```

x402 cost: $0.001

Response:
```json
{
  "id": "z_a1b2c3d4",
  "domain": "myagent.com",
  "status": "active",
  "nameservers": ["ns1.cloudflare.com", "ns2.cloudflare.com"],
  "owner_wallet": "0x...",
  "record_count": 12,
  "created_at": "2026-02-24T..."
}
```

#### Delete Zone

```
DELETE /v1/zones/:id
```

x402 cost: $0.01

Deletes the zone and all its records from Cloudflare. Irreversible.

Response:
```json
{
  "status": "deleted"
}
```

### DNS Record Management

#### Create Record

```
POST /v1/zones/:zone_id/records
```

x402 cost: $0.001

Request:
```json
{
  "type": "A",
  "name": "api.myagent.com",
  "content": "198.51.100.4",
  "ttl": 3600,
  "proxied": false
}
```

Supported types: `A`, `AAAA`, `CNAME`, `MX`, `TXT`, `SRV`, `CAA`, `NS`

Type-specific fields:
- **MX**: `priority` (integer, required)
- **SRV**: `priority`, `weight`, `port` (all integers, required)
- **CAA**: `flags`, `tag` (required)

Response:
```json
{
  "id": "r_x1y2z3",
  "zone_id": "z_a1b2c3d4",
  "type": "A",
  "name": "api.myagent.com",
  "content": "198.51.100.4",
  "ttl": 3600,
  "proxied": false,
  "created_at": "2026-02-24T..."
}
```

#### List Records

```
GET /v1/zones/:zone_id/records
```

x402 cost: $0.001

Query: `?type=A&name=api&limit=100&after=<cursor>`

Response:
```json
{
  "records": [
    {
      "id": "r_x1y2z3",
      "type": "A",
      "name": "api.myagent.com",
      "content": "198.51.100.4",
      "ttl": 3600,
      "proxied": false,
      "created_at": "2026-02-24T..."
    }
  ],
  "cursor": null
}
```

#### Get Record

```
GET /v1/zones/:zone_id/records/:id
```

x402 cost: $0.001

Returns single record object.

#### Update Record

```
PUT /v1/zones/:zone_id/records/:id
```

x402 cost: $0.001

Request: Same shape as create. Replaces entire record.

Response: Updated record object.

#### Delete Record

```
DELETE /v1/zones/:zone_id/records/:id
```

x402 cost: $0.001

Response:
```json
{
  "status": "deleted"
}
```

### Batch Operations

#### Batch Update

```
POST /v1/zones/:zone_id/records/batch
```

x402 cost: $0.005

Request:
```json
{
  "create": [
    { "type": "A", "name": "www", "content": "198.51.100.4", "ttl": 3600 },
    { "type": "TXT", "name": "@", "content": "v=spf1 a -all", "ttl": 3600 }
  ],
  "update": [
    { "id": "r_x1y2z3", "content": "198.51.100.5" }
  ],
  "delete": [
    { "id": "r_a1b2c3" }
  ]
}
```

Execution order: delete → update → create (matches Cloudflare's batch semantics). All-or-nothing — if any operation fails, none are applied.

Response:
```json
{
  "created": [ { "id": "r_new1", "type": "A", "name": "www.myagent.com", "content": "198.51.100.4" } ],
  "updated": [ { "id": "r_x1y2z3", "content": "198.51.100.5" } ],
  "deleted": [ { "id": "r_a1b2c3" } ]
}
```

### Verification

#### Verify DNS Propagation

```
GET /v1/zones/:zone_id/verify
```

x402 cost: $0.001

Checks whether the zone's nameservers are correctly pointed to Cloudflare and key records are resolvable.

Response:
```json
{
  "zone_id": "z_a1b2c3d4",
  "domain": "myagent.com",
  "nameservers_ok": true,
  "checks": [
    { "type": "NS", "name": "myagent.com", "expected": "ns1.cloudflare.com", "found": "ns1.cloudflare.com", "ok": true },
    { "type": "A", "name": "api.myagent.com", "expected": "198.51.100.4", "found": "198.51.100.4", "ok": true }
  ]
}
```

### Convenience: Mail Records

#### Set Up Mail Records

```
POST /v1/zones/:zone_id/mail-setup
```

x402 cost: $0.005

Creates MX, SPF, DKIM, and DMARC records in one call. Designed for relay.sh integration.

Request:
```json
{
  "mx_host": "mail.relay.sh",
  "mx_priority": 10,
  "spf": "v=spf1 a:mail.relay.sh -all",
  "dkim": [
    { "selector": "rsa", "public_key": "MIIBIjAN..." },
    { "selector": "ed", "public_key": "MCowBQ..." }
  ],
  "dmarc_policy": "quarantine",
  "dmarc_rua": "dmarc@relay.sh"
}
```

Response:
```json
{
  "records_created": 5,
  "records": [
    { "id": "r_mx1", "type": "MX", "name": "myagent.com", "content": "mail.relay.sh", "priority": 10 },
    { "id": "r_spf1", "type": "TXT", "name": "myagent.com", "content": "v=spf1 a:mail.relay.sh -all" },
    { "id": "r_dkim1", "type": "TXT", "name": "rsa._domainkey.myagent.com", "content": "v=DKIM1; k=rsa; p=MIIBIjAN..." },
    { "id": "r_dkim2", "type": "TXT", "name": "ed._domainkey.myagent.com", "content": "v=DKIM1; k=ed25519; p=MCowBQ..." },
    { "id": "r_dmarc1", "type": "TXT", "name": "_dmarc.myagent.com", "content": "v=DMARC1; p=quarantine; rua=mailto:dmarc@relay.sh; pct=100" }
  ]
}
```

## Cloudflare API Mapping

| dns.sh | Cloudflare | Method |
|--------|-----------|--------|
| `POST /v1/zones` | `POST /client/v4/zones` | Create zone |
| `GET /v1/zones` | `GET /client/v4/zones` | List zones (filtered by labels) |
| `GET /v1/zones/:id` | `GET /client/v4/zones/{zone_id}` | Get zone |
| `DELETE /v1/zones/:id` | `DELETE /client/v4/zones/{zone_id}` | Delete zone |
| `POST /v1/zones/:id/records` | `POST /client/v4/zones/{zone_id}/dns_records` | Create record |
| `GET /v1/zones/:id/records` | `GET /client/v4/zones/{zone_id}/dns_records` | List records |
| `GET /v1/zones/:id/records/:id` | `GET /client/v4/zones/{zone_id}/dns_records/{id}` | Get record |
| `PUT /v1/zones/:id/records/:id` | `PUT /client/v4/zones/{zone_id}/dns_records/{id}` | Update record |
| `DELETE /v1/zones/:id/records/:id` | `DELETE /client/v4/zones/{zone_id}/dns_records/{id}` | Delete record |
| `POST /v1/zones/:id/records/batch` | `POST /client/v4/zones/{zone_id}/dns_records/batch` | Batch ops |

## Pricing

| Action | Cost | Notes |
|--------|------|-------|
| Create zone | $0.05 | One-time per domain |
| Delete zone | $0.01 | Irreversible |
| List zones | $0.001 | |
| Get zone | $0.001 | |
| Create record | $0.001 | |
| List records | $0.001 | |
| Get record | $0.001 | |
| Update record | $0.001 | |
| Delete record | $0.001 | |
| Batch operations | $0.005 | Any number of ops in one call |
| Verify propagation | $0.001 | |
| Mail setup | $0.005 | Convenience (creates 5 records) |

Cloudflare DNS is free (no per-query cost, no monthly fee), so pricing is pure margin. Low pricing encourages agents to manage DNS programmatically rather than manually.

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Provider | Cloudflare | Free DNS hosting, mature API, global anycast, batch operations, no per-query charges |
| Zone ownership | Wallet address from x402 | Consistent with spawn.sh and wallet.sh patterns |
| ID format | `z_` prefix (zones), `r_` prefix (records) | Consistent with spawn.sh `srv_` and `sk_` patterns |
| Record types | A, AAAA, CNAME, MX, TXT, SRV, CAA, NS | Covers 99% of use cases. HTTPS/SVCB deferred. |
| Batch semantics | All-or-nothing | Matches Cloudflare's batch API — atomic at DB level |
| Mail setup endpoint | Dedicated convenience route | relay.sh needs 5 records in one call. Don't make every mail setup do 5 individual requests. |
| Cloudflare zone ID mapping | SQLite maps dns.sh zone ID → Cloudflare zone ID | Agent never sees Cloudflare internals |
| Verification | DNS query (not just API check) | API confirms record exists in Cloudflare, but agents want to know if it's resolvable globally |
| Proxied flag | Exposed but defaults to false | Cloudflare proxy (orange cloud) is useful for HTTP, but agents should opt in |
| Multi-provider | Cloudflare only for v1 | Same reasoning as spawn.sh — abstract later if needed. Cloudflare's free tier makes it the obvious first choice. |

## Data Model

### SQLite Tables

**zones:**
```sql
CREATE TABLE zones (
  id             TEXT PRIMARY KEY,     -- z_ + 8 hex
  cloudflare_id  TEXT NOT NULL,        -- Cloudflare zone_id
  domain         TEXT NOT NULL UNIQUE,
  owner_wallet   TEXT NOT NULL,
  status         TEXT NOT NULL,        -- pending, active, moved
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
)
```

Index: `zones(owner_wallet)`

**records:**
```sql
CREATE TABLE records (
  id             TEXT PRIMARY KEY,     -- r_ + 8 hex
  cloudflare_id  TEXT NOT NULL,        -- Cloudflare dns_record_id
  zone_id        TEXT NOT NULL,        -- references zones.id
  type           TEXT NOT NULL,
  name           TEXT NOT NULL,
  content        TEXT NOT NULL,
  ttl            INTEGER NOT NULL,
  proxied        INTEGER NOT NULL DEFAULT 0,
  priority       INTEGER,             -- MX/SRV only
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
)
```

Index: `records(zone_id)`

## Deployment

Same pattern as spawn.sh:

```
packages/dns/
├── src/
│   ├── index.ts          # Hono routes + x402 middleware
│   ├── api.ts            # Types + constants
│   ├── cloudflare.ts     # Cloudflare API client (thin HTTP wrapper)
│   ├── db.ts             # SQLite (zones + records tables)
│   └── service.ts        # Business logic (ownership, validation, mapping)
├── test/
│   ├── dns.test.ts       # Full test suite
│   └── smoke.test.ts     # Health check
├── package.json
└── tsconfig.json
```

Environment:
- `CLOUDFLARE_API_TOKEN` — API token with Zone:Edit + DNS:Edit permissions
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID
- `DNS_DB_PATH` — SQLite path (default: `./dns.db`)

## Unknowns

1. **Nameserver propagation time** — After zone creation, how long until Cloudflare detects the NS change? Can vary from minutes to 48 hours. The verify endpoint helps agents poll for this.
2. **Zone limits** — Cloudflare free tier allows 1,000 records per zone, unlimited zones. Is this sufficient at scale?
3. **Cloudflare proxy (orange cloud)** — Should we expose the `proxied` flag to agents? It enables Cloudflare's CDN/WAF but changes how DNS resolution works (returns Cloudflare IPs instead of origin). Exposing it with `false` default seems right.
4. **DNSSEC** — Cloudflare supports one-click DNSSEC. Should dns.sh expose this? Probably yes, as a zone-level toggle in v2.
5. **Abuse prevention** — Agents could create zones for domains they don't own. Cloudflare handles this via nameserver verification (zone stays `pending` until NS records point to Cloudflare), but we should monitor for abuse patterns.
