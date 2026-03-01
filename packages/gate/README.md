<!-- THIS FILE IS GENERATED — DO NOT EDIT
     Source: packages/gate/prim.yaml + packages/gate/src/api.ts
     Regenerate: pnpm gen:docs -->

# gate.sh

> Access control and onboarding for agents. Invite codes, allowlisting, wallet funding.

Part of [prim.sh](https://prim.sh) — zero signup, one payment token, infinite primitives. x402 payment (USDC on Base) is the sole auth.

## Routes

| Route | Description | Price | Request | Response |
|-------|-------------|-------|---------|----------|
| `POST /v1/redeem` | Redeem an invite code. Wallet is allowlisted and funded with USDC + ETH. | $0.01 | `RedeemRequest` | `RedeemResponse` |

## Pricing

| Operation | Price | Notes |
|-----------|-------|-------|
| Redeem invite | free | One-time per code |

## Request / Response Types

### `RedeemRequest`

| Field | Type | Required |
|-------|------|----------|
| `code` | `string` | required |
| `wallet` | `string` | required |

### `RedeemResponse`

| Field | Type | Description |
|-------|------|-------------|
| `status` | `"redeemed"` | Always "redeemed" on success. |
| `wallet` | `string` | Checksummed wallet address that was funded. |
| `funded` | `FundingDetail` | Funding details. |

## Usage

```bash
# Install
curl -fsSL https://gate.prim.sh/install.sh | sh

# Example request
curl -X POST https://gate.prim.sh/v1/redeem \
  -H "X-402-Payment: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Environment

- `PRIM_NETWORK`
- `GATE_FUND_KEY`
- `GATE_CODES`
- `GATE_USDC_AMOUNT`
- `GATE_ETH_AMOUNT`
- `PRIM_ALLOWLIST_DB`
- `PRIM_INTERNAL_KEY`

## Development

```bash
pnpm install
pnpm dev           # run locally (port 3015)
pnpm check         # lint + typecheck + test
pnpm test          # tests only
pnpm typecheck     # typecheck only
```

## x402 Payment

Every paid endpoint requires an x402 payment header (USDC on Base). Use the [x402 client](https://github.com/coinbase/x402) or prim's wallet.sh to pay.

## License

Apache-2.0
