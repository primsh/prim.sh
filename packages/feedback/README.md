<!-- THIS FILE IS GENERATED — DO NOT EDIT
     Source: packages/feedback/prim.yaml + packages/feedback/src/api.ts
     Regenerate: pnpm gen:docs -->

# feedback.sh

> Report bugs, friction, and feature requests. Free. Every prim surfaces the feedback URL.

Part of [prim.sh](https://prim.sh) — zero install, one curl, infinite primitives. x402 payment (USDC on Base) is the sole auth.

## Routes

| Route | Description | Price | Request | Response |
|-------|-------------|-------|---------|----------|
| `POST /v1/submit` | Submit feedback about any prim. | $0.01 | `SubmitRequest` | `SubmitResponse` |
| `GET /v1/feed` | List recent feedback (internal, requires x-internal-key). | $0.01 | `—` | `FeedResponse` |

## Pricing

| Operation | Price | Notes |
|-----------|-------|-------|
| Submit feedback | free | Always free |

## Usage

```bash
# Install
curl -fsSL https://feedback.prim.sh/install.sh | sh

# Example request
curl -X POST https://feedback.prim.sh/v1/submit \
  -H "X-402-Payment: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Environment

- `PRIM_INTERNAL_KEY`
- `FEEDBACK_DB_PATH`

## Development

```bash
pnpm install
pnpm dev           # run locally (port 3014)
pnpm check         # lint + typecheck + test
pnpm test          # tests only
pnpm typecheck     # typecheck only
```

## x402 Payment

Every paid endpoint requires an x402 payment header (USDC on Base). Use the [x402 client](https://github.com/coinbase/x402) or prim's wallet.sh to pay.

## License

Apache-2.0
