# infer.sh

> LLM inference for agents. Any model, any provider, one API. Per-token pricing. No API keys.

Part of the [prim.sh](https://prim.sh) agent-native stack. x402 payment (USDC on Base) is the sole auth — no signup, no GUI, no KYC.

## Routes

| Route | Description | Price | Request | Response |
|-------|-------------|-------|---------|----------|
| `POST /v1/chat` | Chat completion. Supports streaming, tool use, structured output. | $0.01 | `ChatRequest` | `ChatResponse` |
| `POST /v1/embed` | Generate embeddings for text input. Returns vector array. | $0.001 | `EmbedRequest` | `EmbedResponse` |
| `GET /v1/models` | List available models with pricing and capabilities. | $0.01 | `—` | `ModelsResponse` |

## Pricing

| Operation | Price | Notes |
|-----------|-------|-------|
| Chat completion | pass-through + 10% | Per-token, varies by model |
| Embeddings | $0.001 | Per 1K tokens |
| List models | free |  |

## Request / Response Types

### `ChatRequest`

| Field | Type | Required |
|-------|------|----------|
| `model` | `string` | required |
| `messages` | `Message[]` | required |
| `temperature` | `number` | optional |
| `max_tokens` | `number` | optional |
| `top_p` | `number` | optional |
| `frequency_penalty` | `number` | optional |
| `presence_penalty` | `number` | optional |
| `stop` | `string | string[]` | optional |
| `stream` | `boolean` | optional |
| `tools` | `Tool[]` | optional |
| `tool_choice` | `"none" | "auto" | "required" | { type: "function"; function: { name: string } }` | optional |
| `response_format` | `object` | optional |

### `ChatResponse`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` |  |
| `object` | `"chat.completion"` |  |
| `created` | `number` |  |
| `model` | `string` |  |
| `choices` | `Choice[]` |  |
| `usage` | `Usage` |  |

### `EmbedRequest`

| Field | Type | Required |
|-------|------|----------|
| `model` | `string` | required |
| `input` | `string | string[]` | required |

### `EmbedResponse`

| Field | Type | Description |
|-------|------|-------------|
| `object` | `"list"` |  |
| `data` | `EmbeddingData[]` |  |
| `model` | `string` |  |
| `usage` | `object` |  |

### `ModelsResponse`

| Field | Type | Description |
|-------|------|-------------|
| `data` | `ModelInfo[]` |  |

## Providers

| Provider | Status | Default |
|----------|--------|---------|
| [openrouter](https://openrouter.ai/) | active | yes |

## Usage

```bash
# Install
curl -fsSL https://infer.prim.sh/install.sh | sh

# Example request
curl -X POST https://infer.prim.sh/v1/chat \
  -H "X-402-Payment: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Environment

- `PRIM_PAY_TO`
- `PRIM_NETWORK`
- `OPENROUTER_API_KEY`
- `WALLET_INTERNAL_URL`

## Development

```bash
pnpm install
pnpm dev           # run locally (port 3012)
pnpm check         # lint + typecheck + test
pnpm test          # tests only
pnpm typecheck     # typecheck only
```

## x402 Payment

Every paid endpoint requires an x402 payment header (USDC on Base). Use the [x402 client](https://github.com/coinbase/x402) or prim's wallet.sh to pay.

## License

Apache-2.0
