---
name: faucet
version: 1.0.0
primitive: faucet.prim.sh
requires: []
tools:
  - faucet_drip_usdc
  - faucet_drip_eth
  - faucet_get_faucet_status
---

# faucet.prim.sh

Testnet token dispenser. Free USDC and ETH on Base Sepolia for testing prim primitives. No wallet registration required. No x402 payment. Rate-limited by address.

## When to use

Use faucet when you need to:
- Get test USDC to fund a wallet before using paid primitives (testnet only)
- Get test ETH for gas (rarely needed — x402 payments use USDC and prim pays gas internally)
- Verify your wallet address is correct before funding production

Do NOT use faucet for:
- Production/mainnet usage (faucet rejects all mainnet requests with 403 `mainnet_rejected`)
- Repeated drips within the rate limit window (results in 429)

## Prerequisites

None. Faucet is free and open — no wallet registration, no payment, no allowlist. Only requirement: a valid EVM address (`0x` + 40 hex chars).

## Common workflows

### 1. Get test USDC (standard first step)

```
1. faucet_get_faucet_status
   - address: "0xYourAddress"
   → check usdc.available is true before dripping

2. If usdc.available is true:
   faucet_drip_usdc
   - address: "0xYourAddress"
   → returns {txHash, amount: "10.00", currency: "USDC", chain: "eip155:84532"}

3. Wait for the tx to confirm (~2 seconds on Base Sepolia), then call wallet_get_wallet to see updated balance
```

### 2. Get test ETH (for gas, rarely needed)

```
1. faucet_get_faucet_status
   - address: "0xYourAddress"
   → check eth.available is true

2. If eth.available is true:
   faucet_drip_eth
   - address: "0xYourAddress"
   → returns {txHash, amount: "0.01", currency: "ETH", chain: "eip155:84532"}
```

### 3. Check status before dripping (avoid 429s)

```
1. faucet_get_faucet_status
   - address: "0xYourAddress"
   → returns:
     {
       address: "0x...",
       usdc: {available: false, retryAfterMs: 4823000},
       eth: {available: true, retryAfterMs: 0}
     }

2. If available is false, compute wait time:
   retryAfterMs / 1000 = seconds to wait
   Only retry after that window expires.
```

## Error handling

- `invalid_request` → Address is missing or not a valid EVM address. Check the format: must be `0x` followed by exactly 40 hex characters.
- `rate_limited` (429) → Address already received a drip within the rate limit window. Response includes `error.retryAfter` (seconds). Call `faucet_status` first to check availability before dripping.
- `mainnet_rejected` (403) → Faucet only operates on testnet (Base Sepolia). Do not call faucet on mainnet.
- `faucet_error` (502) → Both Circle API and treasury wallet failed. Rare. Retry after a few minutes.

## Gotchas

- **Always call `faucet_get_faucet_status` before dripping.** It costs nothing and prevents unnecessary 429s. Check `usdc.available` and `eth.available` before calling `faucet_drip_usdc` or `faucet_drip_eth`.
- **Rate limits are per-address, per-token:**
  - USDC: 10 USDC per drip, once per 2 hours per address
  - ETH: 0.01 ETH per drip, once per 1 hour per address
- **`retryAfterMs` is milliseconds.** Convert to seconds by dividing by 1000.
- **`txHash` may be "pending".** The Circle API sometimes returns 204 with no transaction hash. If `txHash` is "pending", the transfer was queued but you can't track it on-chain. Wait ~30 seconds and check your balance.
- **USDC source is either Circle or treasury.** The `source` field in the response tells you which backend was used. Both result in the same 10 USDC for you — the difference is only visible in the tx hash origin.
- **No wallet registration needed.** Faucet works for any valid address, even unregistered ones. You still need to register the wallet before using paid primitives.
- **Testnet only.** All tokens are worthless testnet tokens on Base Sepolia (`eip155:84532`). Do not confuse with mainnet.

## Related primitives

- **wallet** — Register your wallet after funding it. The address you drip to is the same one you register.
- **store, spawn, search** — All require a funded wallet. Faucet is the first step to funding on testnet.
