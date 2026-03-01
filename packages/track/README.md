<!-- THIS FILE IS GENERATED — DO NOT EDIT
     Source: packages/track/prim.yaml + packages/track/src/api.ts
     Regenerate: pnpm gen:docs -->

# track.sh

> Package tracking for agents. USPS, FedEx, UPS, DHL and 1000+ carriers. Status, ETA, full event history.

Part of [prim.sh](https://prim.sh) — zero signup, one payment token, infinite primitives. x402 payment (USDC on Base) is the sole auth.

## Routes

| Route | Description | Price | Request | Response |
|-------|-------------|-------|---------|----------|
| `POST /v1/track` | Track a package by tracking number and carrier. Returns status, ETA, and full event history. | $0.05 | `TrackRequest` | `TrackResponse` |

## Pricing

| Operation | Price | Notes |
|-----------|-------|-------|
| Track package | $0.05 | Per lookup |

## Request / Response Types

### `TrackRequest`

| Field | Type | Required |
|-------|------|----------|
| `tracking_number` | `string` | required |
| `carrier` | `string` | optional |

### `TrackResponse`

| Field | Type | Description |
|-------|------|-------------|
| `tracking_number` | `string` | Tracking number echoed back. |
| `carrier` | `string` | Detected or specified carrier slug. |
| `status` | `string` | Current status summary (e.g. "Delivered"). |
| `status_detail` | `string` | Detailed current status description. |
| `eta` | `string` | Estimated delivery date (ISO 8601). Only present if available. |
| `location` | `TrackLocation` | Current package location. Only present if available. |
| `events` | `TrackEvent[]` | Chronological list of tracking events (newest first). |

## Providers

| Provider | Status | Default |
|----------|--------|---------|
| [trackingmore](https://www.trackingmore.com/) | active | yes |

## Usage

```bash
# Install
curl -fsSL https://track.prim.sh/install.sh | sh

# Example request
curl -X POST https://track.prim.sh/v1/track \
  -H "X-402-Payment: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Environment

- `PRIM_PAY_TO`
- `PRIM_NETWORK`
- `TRACKINGMORE_API_KEY`
- `WALLET_INTERNAL_URL`

## Development

```bash
pnpm install
pnpm dev           # run locally (port 3010)
pnpm check         # lint + typecheck + test
pnpm test          # tests only
pnpm typecheck     # typecheck only
```

## x402 Payment

Every paid endpoint requires an x402 payment header (USDC on Base). Use the [x402 client](https://github.com/coinbase/x402) or prim's wallet.sh to pay.

## License

Apache-2.0
