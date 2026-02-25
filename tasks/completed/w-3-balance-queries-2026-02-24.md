# W-3: Implement balance queries (Base USDC via RPC)

**Status:** Plan
**Spec:** `specs/wallet.md`
**Depends on:** W-2 (wallet creation — done)
**Blocks:** W-4 (send needs balance check), W-6 (funding request)

## Context

wallet.sh currently returns hardcoded `balance: "0.00"` and `funded: false` in all wallet responses. W-3 replaces these with live USDC balance from Base mainnet via viem's `readContract`.

This is a focused task: one new module, two modified files, no new endpoints.

## Goals

1. Query live USDC balance from Base RPC for any wallet address
2. Return human-readable balance string (e.g., `"12.50"`) in wallet detail and list responses
3. Set `funded: true` when balance > 0
4. Handle RPC failures gracefully (return `"0.00"` with error flag, don't crash)

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| RPC library | viem `readContract` | Already a dependency (^2.21.0), first-class Base support |
| RPC endpoint | `BASE_RPC_URL` env, default `https://mainnet.base.org` | Coinbase-operated public endpoint. Paid providers (Alchemy, Infura) via env override. |
| Balance format | String with 2 decimal places (`"12.50"`) | Matches W-1 spec. USDC has 6 decimals on-chain but API shows 2. |
| Caching | None (live query per request) | Matches spec ("live RPC, not cached"). Future optimization via TTL cache. |
| RPC failure | Return `balance: "0.00"`, `funded: false`, log error | Don't let RPC outage break wallet detail endpoint. |

## Constants

- **USDC contract (Base mainnet):** `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- **USDC decimals:** 6
- **Default RPC URL:** `https://mainnet.base.org`
- **Chain:** `base` from `viem/chains`

## Phase 1 — Balance module

### New file: `packages/wallet/src/balance.ts`

Creates a viem `PublicClient` and exports a `getUsdcBalance(address)` function.

**PublicClient setup:**
- Chain: `base` from `viem/chains`
- Transport: `http(process.env.BASE_RPC_URL ?? "https://mainnet.base.org")`
- Lazy initialization (create on first call, reuse after)

**`getUsdcBalance(address: Address): Promise<{ balance: string; funded: boolean }>`**
- Call `readContract` with ERC-20 `balanceOf` ABI, USDC address, target address
- Returns `bigint` raw balance in 6-decimal units
- Convert to 2-decimal string: divide by 10^6, format to 2 decimal places
- Set `funded = rawBalance > 0n`
- On RPC error: log warning, return `{ balance: "0.00", funded: false }`

**ERC-20 ABI:** Only need `balanceOf` — define inline as a single-function ABI array, not the full `erc20Abi` import (keeps it minimal).

```
[{ type: "function", name: "balanceOf", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" }]
```

**Formatting:** Use viem's `formatUnits(rawBalance, 6)` to get full-precision string, then truncate/round to 2 decimal places for the API response.

## Phase 2 — Wire into service layer

### Modify: `packages/wallet/src/service.ts`

**`getWallet()`** (line ~100): Replace hardcoded `balance: "0.00"` and `funded: false` with:
- Call `await getUsdcBalance(row.address)`
- Use returned `balance` and `funded` values
- This makes `getWallet` async (update return type)

**`listWallets()`** (line ~41): Replace hardcoded balance in the `.map()`:
- For each wallet row, call `await getUsdcBalance(row.address)`
- Since list can have many wallets, batch queries with `Promise.all` (bounded by limit, max 100)
- Use returned values

**`createWallet()`** (line ~23): Leave `balance: "0.00"` and `funded: false` — new wallet always starts with zero balance. No RPC call needed.

### Modify: `packages/wallet/src/index.ts`

**Routes that use `getWallet` or `listWallets`** need `await` since service functions become async:
- `GET /v1/wallets` handler (line ~110): add `await` to `listWallets()` call
- `GET /v1/wallets/:address` handler (line ~125): add `await` to `getWallet()` call
- `DELETE /v1/wallets/:address` handler (line ~142): `deactivateWallet` doesn't need balance, no change

## Phase 3 — Tests

### New file: `packages/wallet/test/balance.test.ts`

**Mock strategy:** Mock the viem `readContract` call (or mock `fetch` to intercept the JSON-RPC request). Don't hit real Base RPC in tests.

**Test cases:**

| Test | Input | Expected |
|------|-------|----------|
| Wallet with USDC | RPC returns `10500000n` (10.50 USDC) | `balance: "10.50"`, `funded: true` |
| Wallet with zero | RPC returns `0n` | `balance: "0.00"`, `funded: false` |
| Wallet with dust | RPC returns `1n` (0.000001 USDC) | `balance: "0.00"`, `funded: true` |
| RPC failure | Mock throws | `balance: "0.00"`, `funded: false`, no crash |
| Large balance | RPC returns `1000000000000n` (1M USDC) | `balance: "1000000.00"`, `funded: true` |

**Integration test:** Verify `GET /v1/wallets/:address` returns live balance in response body (mock RPC, verify the value flows through service → route → response).

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `BASE_RPC_URL` | `https://mainnet.base.org` | Base mainnet JSON-RPC endpoint |

## Files changed (summary)

| File | Action |
|------|--------|
| `packages/wallet/src/balance.ts` | **New** — PublicClient, getUsdcBalance |
| `packages/wallet/src/service.ts` | **Modify** — async getWallet/listWallets, import balance |
| `packages/wallet/src/index.ts` | **Modify** — await async service calls |
| `packages/wallet/test/balance.test.ts` | **New** — balance query tests |

## Before closing

- [ ] `pnpm --filter @agentstack/wallet check` passes (lint + typecheck + test)
- [ ] `getUsdcBalance` returns correct format for zero, non-zero, and dust amounts
- [ ] RPC failure doesn't crash the service (returns safe defaults)
- [ ] `GET /v1/wallets/:address` returns real balance (mocked in test)
- [ ] `GET /v1/wallets` list returns real balances for each wallet
- [ ] `POST /v1/wallets` still returns `"0.00"` without RPC call
- [ ] No new npm dependencies (viem already present)
