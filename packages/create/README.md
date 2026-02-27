# create.sh

> Scaffold new prim.sh primitives. Write a prim.yaml spec, get a complete package with passing tests.

Part of the [prim.sh](https://prim.sh) agent-native stack. x402 payment (USDC on Base) is the sole auth — no signup, no GUI, no KYC.

## Routes

| Route | Description | Price | Request | Response |
|-------|-------------|-------|---------|----------|
| `POST /v1/scaffold` | Generate a complete prim package from a prim.yaml spec. Returns file manifest with contents. | $0.01 | `ScaffoldRequest` | `ScaffoldResponse` |
| `POST /v1/validate` | Validate a prim.yaml spec against the schema without generating files. | $0.01 | `ValidateRequest` | `ValidateResponse` |
| `GET /v1/schema` | Return the prim.yaml JSON schema for agents to reference when writing specs. | $0.01 | `—` | `SchemaResponse` |
| `GET /v1/ports` | Return allocated ports and next available port number. | $0.01 | `—` | `PortsResponse` |

## Request / Response Types

### `ScaffoldRequest`

| Field | Type | Required |
|-------|------|----------|
| `spec` | `string` | required |

### `ScaffoldResponse`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Primitive ID |
| `files` | `ScaffoldFile[]` | Generated files |

### `ValidateRequest`

| Field | Type | Required |
|-------|------|----------|
| `spec` | `string` | required |

### `ValidateResponse`

| Field | Type | Description |
|-------|------|-------------|
| `valid` | `boolean` | Whether the spec is valid |
| `errors` | `string[]` | Validation errors (empty if valid) |

### `SchemaResponse`

| Field | Type | Description |
|-------|------|-------------|
| `schema` | `Record<string, unknown>` | JSON Schema for prim.yaml |

### `PortsResponse`

| Field | Type | Description |
|-------|------|-------------|
| `allocated` | `PortAllocation[]` | Currently allocated ports |
| `next_available` | `number` | Next available port number |

## Usage

```bash
# Install
curl -fsSL https://create.prim.sh/install.sh | sh

# Example request
curl -X POST https://create.prim.sh/v1/scaffold \
  -H "X-402-Payment: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Environment

- `PRIM_NETWORK`
- `WALLET_INTERNAL_URL`

## Development

```bash
pnpm install
pnpm dev           # run locally (port 3011)
pnpm check         # lint + typecheck + test
pnpm test          # tests only
pnpm typecheck     # typecheck only
```

## x402 Payment

Every paid endpoint requires an x402 payment header (USDC on Base). Use the [x402 client](https://github.com/coinbase/x402) or prim's wallet.sh to pay.

## License

Apache-2.0
