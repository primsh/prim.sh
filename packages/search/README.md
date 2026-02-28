<!-- THIS FILE IS GENERATED — DO NOT EDIT
     Source: packages/search/prim.yaml + packages/search/src/api.ts
     Regenerate: pnpm gen:docs -->

# search.sh

> Search for agents. No ads, no SEO spam. Just facts and clean markdown.

Part of the [prim.sh](https://prim.sh) agent-native stack. x402 payment (USDC on Base) is the sole auth — no signup, no GUI, no KYC.

## Routes

| Route | Description | Price | Request | Response |
|-------|-------------|-------|---------|----------|
| `POST /v1/search` | Search the web and return ranked results with optional AI-generated answer | $0.01 | `SearchRequest` | `SearchResponse` |
| `POST /v1/search/news` | Search for recent news articles, ordered by recency | $0.01 | `SearchRequest` | `SearchResponse` |
| `POST /v1/extract` | Extract readable content from one or more URLs as markdown or plain text | $0.005 | `ExtractRequest` | `ExtractResponse` |

## Pricing

| Operation | Price | Notes |
|-----------|-------|-------|
| Web search | $0.01 | Per query |
| News search | $0.01 | Per query |
| URL extract | $0.005 | Per URL |

## Request / Response Types

### `SearchRequest`

| Field | Type | Required |
|-------|------|----------|
| `query` | `string` | required |
| `max_results` | `number` | optional |
| `search_depth` | `"basic" | "advanced"` | optional |
| `country` | `string` | optional |
| `time_range` | `"day" | "week" | "month" | "year"` | optional |
| `include_answer` | `boolean` | optional |
| `include_domains` | `string[]` | optional |
| `exclude_domains` | `string[]` | optional |

### `SearchResponse`

| Field | Type | Description |
|-------|------|-------------|
| `query` | `string` | Search query echoed back. |
| `answer` | `string` | AI-generated answer summarizing top results. Only present if include_answer was true. |
| `results` | `SearchResult[]` | Ranked search results. |
| `response_time` | `number` | Time taken to complete the search in milliseconds. |

### `ExtractRequest`

| Field | Type | Required |
|-------|------|----------|
| `urls` | `string | string[]` | required |
| `format` | `"markdown" | "text"` | optional |

### `ExtractResponse`

| Field | Type | Description |
|-------|------|-------------|
| `results` | `ExtractResult[]` | Successfully extracted pages. |
| `failed` | `FailedExtraction[]` | Pages that could not be extracted. |
| `response_time` | `number` | Time taken to complete the extraction in milliseconds. |

## Providers

| Provider | Status | Default |
|----------|--------|---------|
| [tavily](https://tavily.com/) | active | yes |

## Usage

```bash
# Install
curl -fsSL https://search.prim.sh/install.sh | sh

# Example request
curl -X POST https://search.prim.sh/v1/search \
  -H "X-402-Payment: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Environment

- `PRIM_PAY_TO`
- `PRIM_NETWORK`
- `TAVILY_API_KEY`
- `WALLET_INTERNAL_URL`

## Development

```bash
pnpm install
pnpm dev           # run locally (port 3005)
pnpm check         # lint + typecheck + test
pnpm test          # tests only
pnpm typecheck     # typecheck only
```

## x402 Payment

Every paid endpoint requires an x402 payment header (USDC on Base). Use the [x402 client](https://github.com/coinbase/x402) or prim's wallet.sh to pay.

## License

Apache-2.0
