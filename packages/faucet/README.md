# faucet.sh

> Free testnet USDC and ETH on demand. Fund your agent wallet and start building.

Part of the [prim.sh](https://prim.sh) agent-native stack. x402 payment (USDC on Base) is the sole auth — no signup, no GUI, no KYC.

## Routes

| Route | Description | Price | Request | Response |
|-------|-------------|-------|---------|----------|
| `POST /v1/faucet/usdc` | Dispense 10 test USDC on Base Sepolia. Rate limit: once per 2 hours per address. | $0.01 | `DripRequest` | `DripResponse` |
| `POST /v1/faucet/eth` | Dispense 0.01 test ETH on Base Sepolia. Rate limit: once per 1 hour per address. | $0.01 | `DripRequest` | `DripResponse` |
| `GET /v1/faucet/status` | Check rate limit status for a wallet address across both faucets. | $0.01 | `—` | `FaucetStatusResponse` |
| `GET /v1/faucet/treasury` | Check treasury wallet ETH balance and refill status. | $0.01 | `—` | `TreasuryStatus` |
| `POST /v1/faucet/refill` | Batch-claim testnet ETH from Coinbase CDP faucet into treasury. Rate limited to once per 10 minutes. | $0.01 | `—` | `RefillResult` |

## Pricing

| Operation | Price | Notes |
|-----------|-------|-------|
| USDC drip | free | Rate-limited per address |
| ETH drip | free | Testnet only |

## Request / Response Types

### `DripRequest`

| Field | Type | Required |
|-------|------|----------|
| `address` | `string` | required |

### `DripResponse`

| Field | Type | Description |
|-------|------|-------------|
| `tx_hash` | `string` | Transaction hash on Base Sepolia. May be "pending" if Circle returns 204. |
| `amount` | `string` | Amount dispensed as a decimal string (e.g. "10.00" for USDC, "0.01" for ETH). |
| `currency` | `string` | Currency dispensed: "USDC" or "ETH". |
| `chain` | `string` | CAIP-2 chain identifier (e.g. "eip155:84532"). |
| `source` | `string` | Backend that dispensed the tokens. "circle" | "treasury". Only present on USDC drips. |

### `FaucetStatusResponse`

| Field | Type | Description |
|-------|------|-------------|
| `address` | `string` | The queried wallet address (checksummed). |
| `usdc` | `FaucetAvailability` | USDC faucet availability (2-hour cooldown). |
| `eth` | `FaucetAvailability` | ETH faucet availability (1-hour cooldown). |

### `TreasuryStatus`

| Field | Type | Description |
|-------|------|-------------|
| `address` | `string` |  |
| `eth_balance` | `string` |  |
| `needs_refill` | `boolean` |  |

### `RefillResult`

| Field | Type | Description |
|-------|------|-------------|
| `claimed` | `number` |  |
| `failed` | `number` |  |
| `estimated_eth` | `string` |  |
| `tx_hashes` | `string[]` |  |

## Usage

```bash
# Install
curl -fsSL https://faucet.prim.sh/install.sh | sh

# Example request
curl -X POST https://faucet.prim.sh/v1/faucet/usdc \
  -H "X-402-Payment: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Environment

- `PRIM_NETWORK`
- `CIRCLE_API_KEY`
- `CDP_API_KEY_ID`
- `CDP_API_KEY_SECRET`
- `FAUCET_REFILL_THRESHOLD_ETH`
- `FAUCET_REFILL_BATCH_SIZE`

## Development

```bash
pnpm install
pnpm dev           # run locally (port 3003)
pnpm check         # lint + typecheck + test
pnpm test          # tests only
pnpm typecheck     # typecheck only
```

## x402 Payment

Every paid endpoint requires an x402 payment header (USDC on Base). Use the [x402 client](https://github.com/coinbase/x402) or prim's wallet.sh to pay.

## License

Apache-2.0
