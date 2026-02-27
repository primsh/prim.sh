---
name: wallet
version: 1.0.0
primitive: wallet.prim.sh
requires: []
tools:
  - wallet_register_wallet
  - wallet_list_wallets
  - wallet_get_wallet
  - wallet_deactivate_wallet
  - wallet_create_fund_request
  - wallet_list_fund_requests
  - wallet_approve_fund_request
  - wallet_deny_fund_request
  - wallet_get_policy
  - wallet_update_policy
  - wallet_pause_wallet
  - wallet_resume_wallet
---

# wallet.prim.sh

Wallet registration and spending control for the prim stack. Wallet is the prerequisite for every other primitive — identity and payment both flow through it.

## When to use

Use wallet when you need to:
- Register a new Ethereum address with prim.sh (required before paying for any primitive)
- Check balance or registration status of a wallet
- Request funds from a human operator
- Limit spending on an autonomous sub-agent (spending policy)
- Pause a compromised or runaway wallet

Do NOT use wallet to:
- Generate or store private keys (keys are local, in `~/.prim/keys/`)
- Move USDC between wallets (prim is non-custodial; use your own signing tools)
- Check on-chain balances directly (use `wallet_get` which reads the prim ledger)

## Prerequisites

None. Registration is free and requires no prior setup. The only inputs needed are:
- An Ethereum address
- An EIP-191 signature proving you control that address

After registration: fund the wallet with USDC on Base (testnet: use `faucet_usdc`) before calling any paid primitive.

## Common workflows

### 1. Register a wallet (CLI)

```
prim wallet create
```

This generates a keypair, encrypts it locally, and calls `wallet_register`. Handles EIP-191 signing automatically.

### 2. Register a wallet (MCP tool)

```
1. wallet_register_wallet
   - address: "0xYourAddress"
   - signature: <EIP-191 sig over "Register <address> with prim.sh at <timestamp>">
   - timestamp: <ISO 8601 UTC, must be within 5 min of server time>
   - label: "my-agent-wallet"  (optional)
```

The message to sign is exactly:
```
Register <address> with prim.sh at <timestamp>
```

### 3. Check wallet status

```
1. wallet_get_wallet with address "0xYourAddress"
   → returns balance, paused status, spending policy, funded flag
```

### 4. Request funds from a human operator

When your wallet is empty and you need USDC to proceed:

```
1. wallet_create_fund_request
   - walletAddress: "0xYourAddress"
   - amount: "10.00"
   - reason: "Need USDC to run research queries for task #42"
   → returns fundRequest with id and status: "pending"

2. Notify the human operator with the fund request ID
3. Poll wallet_get_wallet until balance > 0, or wallet_list_fund_requests until status = "approved"
```

On testnet, skip this and use `faucet_usdc` instead.

### 5. Set a spending policy on a sub-agent wallet

```
1. wallet_update_policy
   - walletAddress: "0xSubAgentAddress"
   - maxPerTx: "1.00"       (cap per transaction)
   - maxPerDay: "10.00"     (daily cap)
   - allowedPrimitives: ["store.prim.sh", "search.prim.sh"]  (optional allowlist)
```

### 6. Pause a wallet (emergency stop)

```
1. wallet_pause_wallet with address "0xTargetAddress"
   → wallet cannot sign x402 payments until resumed
2. wallet_resume_wallet with address "0xTargetAddress"
   → restores normal operation
```

## Error handling

- `invalid_request` → Missing or malformed fields. Check address format (0x + 40 hex chars), timestamp format (ISO 8601 UTC), and that all required fields are present.
- `forbidden` → Signature does not match the address, or timestamp is more than 5 minutes old. Re-sign with a fresh timestamp.
- `duplicate_request` (409) → Wallet is already registered. Proceed — registration is idempotent from the wallet's perspective; you can use the address immediately.
- `not_found` → Wallet address is not registered. Run `wallet_register_wallet` first.
- `wallet_paused` → Wallet is paused. Call `wallet_resume_wallet` to restore it.
- `policy_violation` → A spending policy blocked the payment (maxPerTx or maxPerDay exceeded). Check policy with `wallet_get_policy`, then either increase limits or wait for daily reset (`dailyResetAt`).
- `insufficient_balance` → Not enough USDC. Fund the wallet via `faucet_usdc` (testnet) or `wallet_fund_request_create` (production).
- `rate_limited` (429) → Too many requests. Wait before retrying.
- `payment_required` (402) → x402 payment not received. The MCP server handles this automatically; if calling raw HTTP, sign and retry.

## Gotchas

- **Timestamp window:** The `timestamp` in registration must be within 5 minutes of server time. Generate it fresh at call time, not cached.
- **409 is not an error:** If `wallet_register` returns 409 `duplicate_request`, the wallet is registered and usable. Treat this as success.
- **Cursor pagination:** `wallet_list_wallets` uses cursor-based pagination. Pass the `cursor` field from the previous response as the `after` param. Null cursor means you've seen all wallets.
- **Balance is prim ledger, not on-chain:** `balance` in `wallet_get` is the prim-tracked balance, not the raw on-chain ERC-20 balance. They converge via payment settlement.
- **Non-custodial:** prim never holds private keys. If you lose your local keystore (`~/.prim/keys/`), you lose access to that wallet. Back up keys with `prim wallet export`.
- **Spending policy scope:** `allowedPrimitives` is a hostname allowlist. Use full subdomain format: `"store.prim.sh"`, not `"store"`.

## Related primitives

- **faucet** — Get test USDC before calling any paid primitive (testnet only)
- **store, spawn, search** — All require a registered, funded wallet
- **vault** (planned) — Encrypted key backup for wallet keystores
