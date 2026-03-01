<!-- THIS FILE IS GENERATED — DO NOT EDIT
     Source: packages/imagine/prim.yaml + packages/imagine/src/api.ts
     Regenerate: pnpm gen:docs -->

# imagine.sh

> Media generation for agents. Images, video, audio. Any model, one API. No API keys.

Part of [prim.sh](https://prim.sh) — zero signup, one payment token, infinite primitives. x402 payment (USDC on Base) is the sole auth.

## Routes

| Route | Description | Price | Request | Response |
|-------|-------------|-------|---------|----------|
| `POST /v1/generate` | Generate an image from a text prompt. Returns base64 or URL. | $0.02 | `GenerateRequest` | `GenerateResponse` |
| `POST /v1/describe` | Describe an image. Accepts base64 or URL. Returns text description. | $0.005 | `DescribeRequest` | `DescribeResponse` |
| `POST /v1/upscale` | Upscale an image to higher resolution. Accepts base64 or URL. | $0.01 | `UpscaleRequest` | `UpscaleResponse` |
| `GET /v1/models` | List available image models with capabilities and pricing. | $0.01 | `—` | `ModelsResponse` |

## Pricing

| Operation | Price | Notes |
|-----------|-------|-------|
| Generate image | $0.02 | Per image |
| Describe image | $0.005 | Per image |
| Upscale image | $0.01 | Per image |
| List models | free |  |

## Providers

| Provider | Status | Default |
|----------|--------|---------|
| [google-gemini](https://ai.google.dev/) | active | yes |
| [replicate](https://replicate.com/) | planned | no |

## Usage

```bash
# Install
curl -fsSL https://imagine.prim.sh/install.sh | sh

# Example request
curl -X POST https://imagine.prim.sh/v1/generate \
  -H "X-402-Payment: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Environment

- `PRIM_PAY_TO`
- `PRIM_NETWORK`
- `GEMINI_API_KEY`
- `WALLET_INTERNAL_URL`

## Development

```bash
pnpm install
pnpm dev           # run locally (port 3013)
pnpm check         # lint + typecheck + test
pnpm test          # tests only
pnpm typecheck     # typecheck only
```

## x402 Payment

Every paid endpoint requires an x402 payment header (USDC on Base). Use the [x402 client](https://github.com/coinbase/x402) or prim's wallet.sh to pay.

## License

Apache-2.0
