<!-- THIS FILE IS GENERATED — DO NOT EDIT
     Source: packages/token/prim.yaml + packages/token/src/api.ts
     Regenerate: pnpm gen:docs -->

# token.sh

> Deploy ERC-20 tokens and Uniswap V3 pools. No wallet setup required.

Part of the [prim.sh](https://prim.sh) agent-native stack. x402 payment (USDC on Base) is the sole auth — no signup, no GUI, no KYC.

## Routes

| Route | Description | Price | Request | Response |
|-------|-------------|-------|---------|----------|
| `POST /v1/tokens` | Deploy a new ERC-20 token. Returns immediately with deployStatus: 'pending'. | $1.00 | `CreateTokenRequest` | `TokenResponse` |
| `GET /v1/tokens` | List tokens deployed by the authenticated wallet | $0.001 | `—` | `TokenListResponse` |
| `GET /v1/tokens/:id` | Get token details: deployStatus, contractAddress, supply, pool | $0.001 | `—` | `TokenResponse` |
| `POST /v1/tokens/:id/mint` | Mint additional tokens to an address. Requires mintable=true at deploy time. | $0.10 | `MintRequest` | `MintResponse` |
| `GET /v1/tokens/:id/supply` | Live on-chain total supply from contract | $0.001 | `—` | `SupplyResponse` |
| `POST /v1/tokens/:id/pool` | Create and initialize a Uniswap V3 pool paired with USDC. One pool per token. | $0.50 | `CreatePoolRequest` | `PoolResponse` |
| `GET /v1/tokens/:id/pool` | Get pool details: poolAddress, token0, token1, fee, sqrtPriceX96, tick | $0.001 | `—` | `PoolResponse` |
| `GET /v1/tokens/:id/pool/liquidity-params` | Get calldata for adding liquidity. Returns approvals[] and position manager params. | $0.001 | `—` | `LiquidityParamsResponse` |

## Pricing

| Operation | Price | Notes |
|-----------|-------|-------|
| Deploy token | $1.00 | Covers on-chain gas |
| Mint | $0.10 | Covers on-chain gas |
| Create pool | $0.50 | Uniswap V3 + gas |
| Read | $0.001 | Per request |

## Request / Response Types

### `CreateTokenRequest`

| Field | Type | Required |
|-------|------|----------|
| `name` | `string` | required |
| `symbol` | `string` | required |
| `decimals` | `number` | optional |
| `initialSupply` | `string` | required |
| `mintable` | `boolean` | optional |
| `maxSupply` | `string | null` | optional |

### `TokenResponse`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Token ID (e.g. "tok_abc123"). |
| `contract_address` | `string | null` | Deployed contract address. Null while deploy_status is "pending". |
| `owner_wallet` | `string` | Ethereum address of the wallet that deployed the token. |
| `name` | `string` | Token name. |
| `symbol` | `string` | Token symbol. |
| `decimals` | `number` | Decimal places. |
| `initial_supply` | `string` | Initial supply as a raw integer string. |
| `total_minted` | `string` | Total minted supply as a raw integer string. |
| `mintable` | `boolean` | Whether additional tokens can be minted. |
| `max_supply` | `string | null` | Maximum mintable supply as a raw integer string. Null = unlimited. |
| `tx_hash` | `string` | Deployment transaction hash. |
| `deploy_status` | `"pending" | "confirmed" | "failed"` | Deployment status. Poll until "confirmed" before minting or creating a pool. |
| `created_at` | `string` | ISO 8601 timestamp when the token was created. |

### `MintRequest`

| Field | Type | Required |
|-------|------|----------|
| `to` | `string` | required |
| `amount` | `string` | required |

### `MintResponse`

| Field | Type | Description |
|-------|------|-------------|
| `tx_hash` | `string` | Mint transaction hash. |
| `to` | `string` | Recipient address. |
| `amount` | `string` | Amount minted as a raw integer string. |
| `status` | `"pending"` | Always "pending" — mint is submitted on-chain asynchronously. |

### `SupplyResponse`

| Field | Type | Description |
|-------|------|-------------|
| `token_id` | `string` | Token ID. |
| `contract_address` | `string` | Deployed contract address. |
| `total_supply` | `string` | Live on-chain total supply as a raw integer string. |

### `CreatePoolRequest`

| Field | Type | Required |
|-------|------|----------|
| `pricePerToken` | `string` | required |
| `feeTier` | `number` | optional |

### `PoolResponse`

| Field | Type | Description |
|-------|------|-------------|
| `pool_address` | `string` | Uniswap V3 pool contract address. |
| `token0` | `string` | First token address in the pool pair. |
| `token1` | `string` | Second token address in the pool pair. |
| `fee` | `number` | Fee tier (e.g. 3000 = 0.3%). |
| `sqrt_price_x96` | `string` | Initial sqrtPriceX96 as a string. |
| `tick` | `number` | Initial tick. |
| `tx_hash` | `string` | Pool creation transaction hash. |

### `LiquidityParamsResponse`

| Field | Type | Description |
|-------|------|-------------|
| `position_manager_address` | `string` | Uniswap V3 NonfungiblePositionManager contract address. |
| `token0` | `string` | First token address. |
| `token1` | `string` | Second token address. |
| `fee` | `number` | Fee tier. |
| `tick_lower` | `number` | Lower tick bound for the liquidity range. |
| `tick_upper` | `number` | Upper tick bound for the liquidity range. |
| `amount0_desired` | `string` | Desired amount of token0 to add as a raw integer string. |
| `amount1_desired` | `string` | Desired amount of token1 to add as a raw integer string. |
| `amount0_min` | `string` | Minimum amount of token0 (slippage protection) as a raw integer string. |
| `amount1_min` | `string` | Minimum amount of token1 (slippage protection) as a raw integer string. |
| `recipient` | `string` | Address to receive the liquidity position NFT. |
| `deadline` | `number` | Transaction deadline as a Unix timestamp. |
| `approvals` | `LiquidityApproval[]` | ERC-20 approvals to submit on-chain before calling addLiquidity. |

## Providers

| Provider | Status | Default |
|----------|--------|---------|
| [viem](https://viem.sh/) | active | yes |

## Usage

```bash
# Install
curl -fsSL https://token.prim.sh/install.sh | sh

# Example request
curl -X POST https://token.prim.sh/v1/tokens \
  -H "X-402-Payment: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Environment

- `PRIM_PAY_TO`
- `PRIM_NETWORK`
- `TOKEN_MASTER_KEY`
- `TOKEN_DEPLOYER_ENCRYPTED_KEY`
- `BASE_RPC_URL`
- `WALLET_INTERNAL_URL`

## Development

```bash
pnpm install
pnpm dev           # run locally (port 3007)
pnpm check         # lint + typecheck + test
pnpm test          # tests only
pnpm typecheck     # typecheck only
```

## x402 Payment

Every paid endpoint requires an x402 payment header (USDC on Base). Use the [x402 client](https://github.com/coinbase/x402) or prim's wallet.sh to pay.

## License

Apache-2.0
