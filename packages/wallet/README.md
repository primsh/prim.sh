<!-- THIS FILE IS GENERATED — DO NOT EDIT
     Source: packages/wallet/prim.yaml + packages/wallet/src/api.ts
     Regenerate: pnpm gen:docs -->

# wallet.sh

> Agent wallets. Generate keys, hold USDC on Base, and pay any x402 invoice.

Part of the [prim.sh](https://prim.sh) agent-native stack. x402 payment (USDC on Base) is the sole auth — no signup, no GUI, no KYC.

## Routes

| Route | Description | Price | Request | Response |
|-------|-------------|-------|---------|----------|
| `POST /v1/wallets` | Register a wallet via EIP-191 signature | $0.01 | `RegisterWalletRequest` | `RegisterWalletResponse` |
| `GET /v1/wallets` | List registered wallets owned by the calling wallet | $0.001 | `—` | `WalletListResponse` |
| `GET /v1/wallets/:address` | Get full wallet details including balance, policy, and status | $0.001 | `—` | `WalletDetailResponse` |
| `DELETE /v1/wallets/:address` | Permanently deactivate a wallet. Irreversible. Pending fund requests cancelled. | $0.01 | `—` | `DeactivateWalletResponse` |
| `POST /v1/wallets/:address/fund-request` | Request USDC funding for a wallet. A human operator can approve or deny. | $0.001 | `CreateFundRequestRequest` | `FundRequestResponse` |
| `GET /v1/wallets/:address/fund-requests` | List all fund requests for a wallet | $0.001 | `—` | `FundRequestListResponse` |
| `POST /v1/fund-requests/:id/approve` | Approve a pending fund request. Returns the address to send USDC to. | $0.01 | `—` | `ApproveFundRequestResponse` |
| `POST /v1/fund-requests/:id/deny` | Deny a pending fund request | $0.001 | `DenyFundRequestRequest` | `DenyFundRequestResponse` |
| `GET /v1/wallets/:address/policy` | Get the spending policy for a wallet | $0.001 | `—` | `PolicyResponse` |
| `PUT /v1/wallets/:address/policy` | Update spending policy for a wallet. All fields optional. Pass null to remove a limit. | $0.005 | `PolicyUpdateRequest` | `PolicyResponse` |
| `POST /v1/wallets/:address/pause` | Pause operations for a wallet. Temporarily halts spending without deactivating. | $0.001 | `PauseRequest` | `PauseResponse` |
| `POST /v1/wallets/:address/resume` | Resume operations for a paused wallet | $0.001 | `ResumeRequest` | `ResumeResponse` |

## Pricing

| Operation | Price | Notes |
|-----------|-------|-------|
| Wallet registration | free |  |
| API call | $0.001 | Per request |
| Policy update | $0.005 |  |

## Request / Response Types

### `RegisterWalletRequest`

| Field | Type | Required |
|-------|------|----------|
| `address` | `string` | required |
| `signature` | `string` | required |
| `timestamp` | `string` | required |
| `chain` | `string` | optional |
| `label` | `string` | optional |

### `RegisterWalletResponse`

| Field | Type | Description |
|-------|------|-------------|
| `address` | `string` | Registered Ethereum address. |
| `chain` | `string` | Chain identifier. |
| `label` | `string | null` | Label if provided, null otherwise. |
| `registered_at` | `string` | ISO 8601 timestamp when the wallet was registered. |
| `created_at` | `string` | ISO 8601 timestamp when the record was created. |

### `WalletDetailResponse`

| Field | Type | Description |
|-------|------|-------------|
| `address` | `string` | Ethereum address. |
| `chain` | `string` | Chain identifier. |
| `balance` | `string` | USDC balance as a decimal string. |
| `funded` | `boolean` | Whether the wallet has ever been funded. |
| `paused` | `boolean` | Whether the wallet is currently paused. |
| `created_by` | `string` | Address that registered this wallet (or self). |
| `policy` | `SpendingPolicy | null` | Spending policy, null if none configured. |
| `created_at` | `string` | ISO 8601 timestamp when the wallet was created. |

### `DeactivateWalletResponse`

| Field | Type | Description |
|-------|------|-------------|
| `address` | `string` | Deactivated Ethereum address. |
| `deactivated` | `boolean` | Always true on success. |
| `deactivated_at` | `string` | ISO 8601 timestamp of deactivation. |

### `CreateFundRequestRequest`

| Field | Type | Required |
|-------|------|----------|
| `amount` | `string` | required |
| `reason` | `string` | required |

### `FundRequestResponse`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Fund request ID (e.g. "fr_abc123"). |
| `wallet_address` | `string` | Wallet address the request is for. |
| `amount` | `string` | Requested USDC amount as a decimal string. |
| `reason` | `string` | Reason provided by the requester. |
| `status` | `FundRequestStatus` | Current status of the fund request. |
| `created_at` | `string` | ISO 8601 timestamp when the request was created. |

### `ApproveFundRequestResponse`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Fund request ID. |
| `status` | `"approved"` | Always "approved" on success. |
| `funding_address` | `string` | Send USDC to this address to fulfill the request. |
| `amount` | `string` | Approved USDC amount as a decimal string. |
| `chain` | `string` | Chain identifier for the funding transaction. |
| `approved_at` | `string` | ISO 8601 timestamp when the request was approved. |

### `DenyFundRequestRequest`

| Field | Type | Required |
|-------|------|----------|
| `reason` | `string` | optional |

### `DenyFundRequestResponse`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Fund request ID. |
| `status` | `"denied"` | Always "denied" on success. |
| `reason` | `string | null` | Denial reason if provided, null otherwise. |
| `denied_at` | `string` | ISO 8601 timestamp when the request was denied. |

### `PolicyResponse`

| Field | Type | Description |
|-------|------|-------------|
| `wallet_address` | `string` | Wallet address this policy applies to. |
| `max_per_tx` | `string | null` | Max USDC per transaction, null = no limit. |
| `max_per_day` | `string | null` | Max USDC per day, null = no limit. |
| `allowed_primitives` | `string[] | null` | Allowed primitive hostnames (e.g. ["store.prim.sh"]), null = all allowed. |
| `daily_spent` | `string` | USDC spent today as a decimal string. |
| `daily_reset_at` | `string` | ISO 8601 timestamp when the daily counter resets. |

### `PolicyUpdateRequest`

| Field | Type | Required |
|-------|------|----------|
| `maxPerTx` | `string | null` | optional |
| `maxPerDay` | `string | null` | optional |
| `allowedPrimitives` | `string[] | null` | optional |

### `PauseRequest`

| Field | Type | Required |
|-------|------|----------|
| `scope` | `PauseScope` | optional |

### `PauseResponse`

| Field | Type | Description |
|-------|------|-------------|
| `wallet_address` | `string` | Wallet address that was paused. |
| `paused` | `boolean` | Always true on success. |
| `scope` | `PauseScope` | Scope that was paused. |
| `paused_at` | `string` | ISO 8601 timestamp when the wallet was paused. |

### `ResumeRequest`

| Field | Type | Required |
|-------|------|----------|
| `scope` | `PauseScope` | optional |

### `ResumeResponse`

| Field | Type | Description |
|-------|------|-------------|
| `wallet_address` | `string` | Wallet address that was resumed. |
| `paused` | `boolean` | Always false on success (wallet is unpaused). |
| `scope` | `PauseScope` | Scope that was resumed. |
| `resumed_at` | `string` | ISO 8601 timestamp when the wallet was resumed. |

## Usage

```bash
# Install
curl -fsSL https://wallet.prim.sh/install.sh | sh

# Example request
curl -X POST https://wallet.prim.sh/v1/wallets \
  -H "X-402-Payment: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Environment

- `PRIM_PAY_TO`
- `PRIM_NETWORK`
- `PRIM_INTERNAL_KEY`

## Development

```bash
pnpm install
pnpm dev           # run locally (port 3001)
pnpm check         # lint + typecheck + test
pnpm test          # tests only
pnpm typecheck     # typecheck only
```

## x402 Payment

Every paid endpoint requires an x402 payment header (USDC on Base). Use the [x402 client](https://github.com/coinbase/x402) or prim's wallet.sh to pay.

## License

Apache-2.0
