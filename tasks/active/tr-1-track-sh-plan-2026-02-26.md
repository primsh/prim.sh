# TR-1: Build track.sh — Agent-Native Package Tracking

## Context

Agents that handle orders, logistics, or physical goods have no way to check package status without managing carrier accounts. USPS, FedEx, UPS, and DHL all require human signup flows to access their tracking APIs.

track.sh is a stateless x402 API: agent submits a tracking number, gets back status + events. No signup, no carrier credentials, $0.05/lookup.

**Reference implementation:** search.sh (`packages/search/`) — also stateless, no SQLite, provider-abstracted. Follow that pattern exactly.

## Goals

- 1 endpoint: `POST /v1/track`
- x402 gated — per-request micropayment
- Provider-abstracted (Shippo launch provider)
- Stateless — no SQLite, no ownership model

## API Surface

### Endpoints

```
POST /v1/track    # Look up tracking number → status + events
GET  /            # Health check (free)
```

### Pricing

| Endpoint | Price | Upstream cost | Margin |
|----------|-------|---------------|--------|
| `POST /v1/track` | $0.05 | $0.02 (Shippo) | ~60% |

### Request / Response

```
TrackRequest (POST body):
  tracking_number: string    — required
  carrier?: string           — optional hint; one of: usps, fedex, ups, dhl_express,
                               dhl_ecommerce, amazon, ontrac, lasership, or any
                               Shippo carrier slug. If omitted, default to "usps"
                               (most common; Shippo returns an error if wrong carrier
                               is supplied — surface as invalid_request with hint)

TrackResponse:
  tracking_number: string
  carrier: string            — normalized Shippo carrier slug
  status: string             — UNKNOWN | PRE_TRANSIT | TRANSIT | DELIVERED | RETURNED | FAILURE
  status_detail: string      — human-readable status detail
  eta?: string               — ISO 8601 estimated delivery (if available)
  location?: TrackLocation   — most recent location
  events: TrackEvent[]       — full history, newest first

TrackLocation:
  city?: string
  state?: string
  zip?: string
  country?: string

TrackEvent:
  status: string
  status_detail: string
  datetime: string           — ISO 8601
  location?: TrackLocation
```

### Error Codes

```
invalid_request    — missing tracking_number, or Shippo returned carrier mismatch
provider_error     — Shippo API returned unexpected error
rate_limited       — Shippo rate limit hit (429); include Retry-After header
not_found          — tracking number not found in carrier system
```

### Carrier Normalization

Accept common aliases and normalize to Shippo slugs before calling the API:

| Input alias | Shippo slug |
|-------------|-------------|
| `UPS`, `united_parcel` | `ups` |
| `USPS`, `united_states_postal` | `usps` |
| `FedEx`, `FEDEX`, `federal_express` | `fedex` |
| `DHL`, `dhl` | `dhl_express` |
| `DHL eCommerce`, `dhl_ecommerce` | `dhl_ecommerce` |

Normalization: lowercase + strip spaces/underscores → map to slug. Unknown values pass through as-is to Shippo (may return `not_found`).

## Provider: Shippo

**API details:**
- Base: `https://api.goshippo.com`
- Auth: `Authorization: ShippoToken <SHIPPO_API_KEY>`
- Tracking endpoint: `GET /tracks/{carrier}/{tracking_number}`
- Returns: `tracking_status` object + `tracking_history` array
- Cost: $0.02 per external tracker (shipments not created through Shippo)
- Self-serve signup: yes — no sales call required
- Test key format: `shippo_test_<hex>`; live key format: `shippo_live_<hex>`

**Env var:** `SHIPPO_API_KEY`

> **Key rotation:** Test key (`shippo_test_*`) for development only. Before VPS deploy (TR-2), generate a live key (`shippo_live_*`) from the Shippo dashboard and set it in `/etc/prim/track.env`. Do not commit either key.

### Provider Interface

```ts
// provider.ts
interface TrackProvider {
  track(trackingNumber: string, carrier: string): Promise<TrackProviderResult>
}

type TrackProviderResult =
  | { ok: true; data: TrackProviderData }
  | { ok: false; code: "not_found" | "invalid_request" | "provider_error" | "rate_limited";
      message: string; retryAfter?: number }

interface TrackProviderData {
  carrier: string
  tracking_number: string
  tracking_status: ShippoTrackingStatus
  tracking_history: ShippoTrackingEvent[]
  eta?: string
}
```

Shippo implementation lives in `shippo.ts`, injected into `service.ts` at startup. Tests use a mock implementation.

## Dependency Direction

```
index.ts → service.ts → shippo.ts (implements provider.ts TrackProvider)
                      ↘ provider.ts (TrackProvider interface + TrackProviderResult)
api.ts ← (types only, imported by index + service)
```

No db.ts. Stateless.

## File Structure

```
packages/track/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── index.ts       — Hono app, routes, x402 middleware config
    ├── api.ts         — TrackRequest, TrackResponse, error envelope types
    ├── service.ts     — validation, carrier normalization, provider dispatch
    ├── provider.ts    — TrackProvider interface + TrackProviderResult type
    └── shippo.ts      — Shippo API client (implements TrackProvider)
└── test/
    ├── track.test.ts  — unit tests (mocked provider)
    └── smoke.test.ts  — app instantiation only (matches search.sh pattern)
```

## x402 Middleware Config

Follow search.sh exactly:

```ts
const TRACK_ROUTES = {
  "POST /v1/track": "$0.05",
} as const;

app.use("*", createAgentStackMiddleware(
  { payTo: PAY_TO_ADDRESS, network: NETWORK, freeRoutes: ["GET /"], checkAllowlist },
  { ...TRACK_ROUTES },
));
```

Env vars (same pattern as all other prims):
```
SHIPPO_API_KEY       — Shippo API key (required)
PRIM_PAY_TO          — Payment recipient wallet address
PRIM_NETWORK         — eip155:8453 (mainnet) or eip155:84532 (Sepolia)
WALLET_INTERNAL_URL  — wallet.sh internal API for allowlist check (default: http://127.0.0.1:3001)
```

## package.json

Match search.sh exactly. Name: `@primsh/track`. Scripts: `dev`, `start`, `lint`, `format`, `typecheck`, `test`, `test:smoke`, `check`. Same deps: `@primsh/x402-middleware`, `hono`. Same devDeps: `@x402/core`, `typescript`, `vitest`.

## Deployment

**Port:** 3009 (wallet=3001, store=3002, faucet=3003, spawn=3004, search=3005, email=3006, token=3007, mem=3008, domain=3009... use 3010 if domain takes 3009 — verify against Caddyfile before writing service file)

> **Check:** `grep -n "300[0-9]" deploy/prim/Caddyfile` to confirm next available port before writing service file.

**Systemd unit:** `deploy/prim/services/prim-track.service` — follow `prim-search.service` exactly, substituting `search` → `track` and port.

**Caddyfile entry** (add to `deploy/prim/Caddyfile`):
```
track.prim.sh {
    import security_headers
    reverse_proxy localhost:<PORT>
}
```

**Env file:** `/etc/prim/track.env` on VPS (Garric deploys).

## Tests

Unit tests should cover (mock provider, no Shippo calls):

- `POST /v1/track` returns 200 + TrackResponse on success
- `POST /v1/track` returns 400 when `tracking_number` is missing
- `POST /v1/track` returns 404 when provider returns `not_found`
- `POST /v1/track` returns 502 when provider returns `provider_error`
- `POST /v1/track` returns 429 + Retry-After when provider returns `rate_limited`
- Carrier normalization: `"FedEx"` → `"fedex"`, `"DHL"` → `"dhl_express"`, `"UPS"` → `"ups"`, `"USPS"` → `"usps"`
- `GET /` returns 200 `{ service: "track.sh", status: "ok" }` without x402 challenge
- Events are ordered newest-first

## Out of Scope (TR-1)

- Webhook subscriptions (`POST /tracks` on Shippo) — async tracking updates. Add as TR-3 if needed.
- SQLite caching of recent lookups (avoid duplicate Shippo charges on repeat queries). Add as TR-4.
- Additional providers (EasyPost, TrackingMore). Interface exists; add implementations later.
- CLI subcommand (`prim track`). Add as TR-2b alongside smoke test.
- Landing page (`site/track/`). Add alongside deploy task.
- OpenAPI spec + MCP tool. Add in Agent Interface Wave 3 alongside other new prims.

## Before Closing

- [ ] `pnpm --filter @primsh/track check` passes (lint + typecheck + tests)
- [ ] `POST /v1/track` with missing `tracking_number` returns 400 `invalid_request`
- [ ] `GET /` returns 200 with no Payment-Signature header (free route works)
- [ ] Carrier normalization test: FedEx, UPS, DHL, USPS aliases all resolve correctly
- [ ] Shippo 404 maps to `not_found` (not `provider_error`)
- [ ] Shippo 429 maps to `rate_limited` with `Retry-After` header
- [ ] Raw Shippo error body is never leaked — always wrapped in prim error envelope
- [ ] Response events are ordered newest-first
- [ ] `smoke.test.ts` passes (app instantiation with `PRIM_NETWORK=eip155:8453`)
