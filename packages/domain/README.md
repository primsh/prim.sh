<!-- THIS FILE IS GENERATED — DO NOT EDIT
     Source: packages/domain/prim.yaml + packages/domain/src/api.ts
     Regenerate: pnpm gen:docs -->

# domain.sh

> Register domains, manage DNS, auto-TLS. Full domain lifecycle via API.

Part of [prim.sh](https://prim.sh) — zero signup, one payment token, infinite primitives. x402 payment (USDC on Base) is the sole auth.

## Routes

| Route | Description | Price | Request | Response |
|-------|-------------|-------|---------|----------|
| `GET /v1/domains/search` | Check availability and pricing for a domain query | $0.001 | `—` | `SearchDomainResponse` |
| `POST /v1/domains/quote` | Get a 15-minute price quote for a domain | $0.001 | `QuoteRequest` | `QuoteResponse` |
| `GET /v1/domains/:domain/status` | Full post-registration pipeline status (ns_propagated, zone_active, all_ready) | $0.001 | `—` | `GetRegistrationStatusResponse` |
| `POST /v1/zones` | Create a Cloudflare DNS zone. Returns nameservers to set at your registrar. | $0.001 | `CreateZoneRequest` | `CreateZoneResponse` |
| `GET /v1/zones` | List DNS zones owned by the calling wallet (paginated) | $0.001 | `—` | `ZoneListResponse` |
| `GET /v1/zones/:id` | Get zone details | $0.001 | `—` | `GetZoneResponse` |
| `DELETE /v1/zones/:id` | Delete zone and all records. Irreversible. | $0.001 | `—` | `—` |
| `PUT /v1/zones/:zone_id/activate` | Request Cloudflare NS re-check for faster activation | $0.001 | `—` | `ActivateDomainResponse` |
| `GET /v1/zones/:zone_id/verify` | Check DNS propagation for all zone records | $0.001 | `—` | `VerifyDomainResponse` |
| `POST /v1/zones/:zone_id/mail-setup` | Configure MX, SPF, DMARC, DKIM in one call. Idempotent. | $0.005 | `SetupMailRequest` | `SetupMailResponse` |
| `POST /v1/zones/:zone_id/records/batch` | Create, update, and delete DNS records in one atomic request | $0.005 | `BatchRecordsRequest` | `BatchRecordsResponse` |
| `POST /v1/zones/:zone_id/records` | Create a DNS record (A, AAAA, CNAME, MX, TXT, SRV, CAA, NS) | $0.001 | `CreateRecordRequest` | `GetRecordResponse` |
| `GET /v1/zones/:zone_id/records` | List all records in a DNS zone | $0.001 | `—` | `RecordListResponse` |
| `GET /v1/zones/:zone_id/records/:id` | Get a single DNS record | $0.001 | `—` | `GetRecordResponse` |
| `PUT /v1/zones/:zone_id/records/:id` | Update a DNS record | $0.001 | `UpdateRecordRequest` | `GetRecordResponse` |
| `DELETE /v1/zones/:zone_id/records/:id` | Delete a DNS record | $0.001 | `—` | `—` |

## Pricing

| Operation | Price | Notes |
|-----------|-------|-------|
| Domain registration | dynamic | NameSilo wholesale |
| DNS zone | $0.001 | x402 floor (Cloudflare free plan) |
| DNS record | $0.001 | x402 floor (Cloudflare free plan) |
| DNS queries | free | Cloudflare free plan (first 1M/mo) |

## Request / Response Types

### `SearchDomainResponse`

| Field | Type | Description |
|-------|------|-------------|
| `results` | `DomainSearchResult[]` | Search results for each queried domain. |

### `QuoteRequest`

| Field | Type | Required |
|-------|------|----------|
| `domain` | `string` | required |
| `years` | `number` | optional |

### `QuoteResponse`

| Field | Type | Description |
|-------|------|-------------|
| `quote_id` | `string` | Quote ID to use when calling POST /v1/domains/register. |
| `domain` | `string` | Domain name quoted. |
| `available` | `true` | Always true — quote is only returned for available domains. |
| `years` | `number` | Number of years in the quote. |
| `registrar_cost_usd` | `number` | Registrar cost in USD (internal cost). |
| `total_cost_usd` | `number` | Total cost in USD charged to the caller. |
| `currency` | `string` | Currency code (e.g. "USD"). |
| `expires_at` | `string` | ISO 8601 timestamp when the quote expires. Use within the window to avoid quote_expired. |

### `GetRegistrationStatusResponse`

| Field | Type | Description |
|-------|------|-------------|
| `domain` | `string` | Domain name. |
| `purchased` | `true` | Always true — only returned for registered domains. |
| `zone_id` | `string | null` | Cloudflare zone ID. Null if zone not yet created. |
| `zone_status` | `ZoneStatus | null` | Current zone status. Null if zone not yet created. |
| `ns_configured_at_registrar` | `boolean` | Whether nameservers are configured at the registrar. |
| `ns_propagated` | `boolean` | Whether nameservers have propagated in DNS. |
| `ns_expected` | `string[]` | Expected Cloudflare nameservers. |
| `ns_actual` | `string[]` | Nameservers currently found in DNS. |
| `zone_active` | `boolean` | Whether the Cloudflare zone is active. |
| `all_ready` | `boolean` | Whether the domain is fully set up and ready. |
| `next_action` | `string | null` | Human-readable next action required. Null if all_ready is true. |

### `CreateZoneRequest`

| Field | Type | Required |
|-------|------|----------|
| `domain` | `string` | required |

### `CreateZoneResponse`

| Field | Type | Description |
|-------|------|-------------|
| `zone` | `GetZoneResponse` | The created zone. |

### `GetZoneResponse`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Cloudflare zone ID. |
| `domain` | `string` | Domain name (e.g. "example.com"). |
| `status` | `ZoneStatus` | Zone status: "pending" | "active" | "moved". |
| `name_servers` | `string[]` | Cloudflare nameservers to delegate to. |
| `owner_wallet` | `string` | Ethereum address of the zone owner. |
| `created_at` | `string` | ISO 8601 timestamp when the zone was created. |

### `ActivateDomainResponse`

| Field | Type | Description |
|-------|------|-------------|
| `zone_id` | `string` | Cloudflare zone ID. |
| `status` | `ZoneStatus` | Updated zone status. |
| `activation_requested` | `true` | Always true — activation was requested from Cloudflare. |

### `VerifyDomainResponse`

| Field | Type | Description |
|-------|------|-------------|
| `domain` | `string` | Domain name. |
| `nameservers` | `NsVerifyResult` | Nameserver propagation result. |
| `records` | `RecordVerifyResult[]` | Per-record propagation results. |
| `all_propagated` | `boolean` | Whether all records and nameservers have propagated. |
| `zone_status` | `ZoneStatus | null` | Current Cloudflare zone status. Null if zone not found. |

### `SetupMailRequest`

| Field | Type | Required |
|-------|------|----------|
| `mail_server` | `string` | required |
| `mail_server_ip` | `string` | required |
| `dkim` | `object` | optional |

### `SetupMailResponse`

| Field | Type | Description |
|-------|------|-------------|
| `records` | `MailSetupRecordResult[]` | DNS records created or updated by the mail setup. |

### `BatchRecordsRequest`

| Field | Type | Required |
|-------|------|----------|
| `create` | `BatchCreateEntry[]` | optional |
| `update` | `BatchUpdateEntry[]` | optional |
| `delete` | `BatchDeleteEntry[]` | optional |

### `BatchRecordsResponse`

| Field | Type | Description |
|-------|------|-------------|
| `created` | `GetRecordResponse[]` | Successfully created records. |
| `updated` | `GetRecordResponse[]` | Successfully updated records. |
| `deleted` | `object` | IDs of deleted records. |

### `CreateRecordRequest`

| Field | Type | Required |
|-------|------|----------|
| `type` | `RecordType` | required |
| `name` | `string` | required |
| `content` | `string` | required |
| `ttl` | `number` | optional |
| `proxied` | `boolean` | optional |
| `priority` | `number` | optional |

### `GetRecordResponse`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | DNS record ID. |
| `zone_id` | `string` | Zone ID this record belongs to. |
| `type` | `RecordType` | DNS record type. |
| `name` | `string` | DNS record name (hostname, relative to zone). |
| `content` | `string` | DNS record value. |
| `ttl` | `number` | TTL in seconds. |
| `proxied` | `boolean` | Whether Cloudflare proxying is enabled. |
| `priority` | `number | null` | Priority for MX and SRV records. Null for other types. |
| `created_at` | `string` | ISO 8601 timestamp when the record was created. |
| `updated_at` | `string` | ISO 8601 timestamp when the record was last updated. |

### `UpdateRecordRequest`

| Field | Type | Required |
|-------|------|----------|
| `type` | `RecordType` | optional |
| `name` | `string` | optional |
| `content` | `string` | optional |
| `ttl` | `number` | optional |
| `proxied` | `boolean` | optional |
| `priority` | `number` | optional |

## Providers

| Provider | Status | Default |
|----------|--------|---------|
| [cloudflare](https://www.cloudflare.com/) | active | yes |
| [namesilo](https://www.namesilo.com/) | active | no |

## Usage

```bash
# Install
curl -fsSL https://domain.prim.sh/install.sh | sh

# Example request
curl -X POST https://domain.prim.sh/v1/domains/quote \
  -H "X-402-Payment: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Environment

- `REVENUE_WALLET`
- `PRIM_NETWORK`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ZONE_ID`
- `NAMESILO_API_KEY`
- `WALLET_INTERNAL_URL`

## Development

```bash
pnpm install
pnpm dev           # run locally (port 3009)
pnpm check         # lint + typecheck + test
pnpm test          # tests only
pnpm typecheck     # typecheck only
```

## x402 Payment

Every paid endpoint requires an x402 payment header (USDC on Base). Use the [x402 client](https://github.com/coinbase/x402) or prim's wallet.sh to pay.

## License

Apache-2.0
