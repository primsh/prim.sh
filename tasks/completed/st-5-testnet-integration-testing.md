# ST-5: Testnet Integration Testing (Base Sepolia x402 End-to-End)

## Context

All primitives hardcode `NETWORK = "eip155:8453"` (Base mainnet) and `PAY_TO_ADDRESS = "0x000..."`. There's no way to switch to testnet without editing source. We need env-configurable network selection so we can run real x402 payment flows on Base Sepolia, then flip to mainnet for production.

wallet.sh already has `x402Fetch()` — a client that auto-handles 402 → sign → retry. That's the paying agent. store.sh is the first primitive to integration-test against.

## Goals

1. Make network selection env-configurable across all primitives (one env var, not per-primitive)
2. Make `PAY_TO_ADDRESS` env-configurable
3. Handle chain-dependent constants (USDC address, RPC URL, viem chain) via network selection
4. Write a runnable integration test script: wallet.sh creates wallet → funds it with test USDC → calls store.sh endpoints via `x402Fetch`
5. Document the testnet setup for future primitives

## Phase 1: Network Configuration Module

### NEW: `packages/shared/network.ts` (or inline per-package if shared package is premature)

Single source of truth for chain-dependent constants. Given a network string, returns everything needed.

Decision: avoid a new shared package for now — each package imports its own copy would be worse. Better: add a `getNetworkConfig()` to `@agentstack/x402-middleware` since every primitive already depends on it.

**Add to `packages/x402-middleware/src/`:**

`network-config.ts` exporting:
```
getNetworkConfig(network?: string) → { chainId, rpcUrl, usdcAddress, viemChain, isTestnet }
```

Lookup table:

| `PRIM_NETWORK` env / param | Chain ID | RPC default | USDC address | viem chain |
|-----------------------------|----------|-------------|--------------|------------|
| `eip155:8453` (default)     | 8453     | `https://mainnet.base.org` | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | `base` |
| `eip155:84532`              | 84532    | `https://sepolia.base.org` | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | `baseSepolia` |

Env var name: `PRIM_NETWORK` (project-wide, not `BASE_NETWORK` or `NETWORK`).

### Files to modify

| File | Change |
|------|--------|
| `packages/x402-middleware/src/network-config.ts` | **New** — `getNetworkConfig()` function |
| `packages/x402-middleware/src/index.ts` | Re-export `getNetworkConfig` |
| `packages/store/src/index.ts` | Replace hardcoded `NETWORK` with `getNetworkConfig(process.env.PRIM_NETWORK)` |
| `packages/wallet/src/index.ts` | Same — replace hardcoded `NETWORK` |
| `packages/wallet/src/balance.ts` | Use `getNetworkConfig()` for USDC address + RPC URL instead of hardcoded values |
| `packages/wallet/src/service.ts` | Same — USDC address + RPC URL from config |
| `packages/wallet/src/x402-client.ts` | Same — RPC URL from config |

**`PAY_TO_ADDRESS`**: Each primitive reads `PRIM_PAY_TO` env var, falls back to current hardcoded zero address. One-line change per primitive.

### Dependency direction

`x402-middleware` owns `getNetworkConfig()`. All primitives import from it. No circular deps — this is the same direction imports already flow.

## Phase 2: Integration Test Script

### NEW: `scripts/integration-test.ts`

Bun-runnable script. Not vitest — this hits real services.

**Prerequisites** (checked at startup, exit with clear error if missing):
- `PRIM_NETWORK=eip155:84532` (enforced — script refuses to run on mainnet)
- `PRIM_PAY_TO` — receiver wallet address
- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` — for bucket ops
- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` — for object ops
- `WALLET_MASTER_KEY` — for wallet.sh keystore encryption
- Test USDC in the agent wallet (script checks balance, exits if zero)

**Flow:**
1. Start wallet.sh on port 3001 (subprocess)
2. Start store.sh on port 3002 (subprocess)
3. Create a wallet via `POST /v1/wallets` on wallet.sh (free route)
4. Check USDC balance — exit with instructions if zero ("Fund this address via Circle faucet: 0x...")
5. Create bucket via `x402Fetch("http://localhost:3002/v1/buckets", ...)`
6. Upload object via `x402Fetch("http://localhost:3002/v1/buckets/{id}/objects/test.txt", ...)`
7. Download object — verify body matches
8. Set quota — verify response
9. Get usage — verify non-zero
10. Delete object
11. Delete bucket
12. Print summary: all steps passed, USDC spent

**Cleanup:** Always delete test bucket on exit (even on failure). Use `finally` block.

### NEW: `scripts/.env.example`

Template with all required env vars and comments.

### NEW: `.env.testnet` pattern

Document in script output: "Copy scripts/.env.example to .env.testnet, fill in values, then: `source .env.testnet && bun run scripts/integration-test.ts`"

## Phase 3: Existing Test Compatibility

Ensure unit tests still pass — they don't use `PRIM_NETWORK`, so `getNetworkConfig()` must default to mainnet when env var is unset.

Decision table:

| `PRIM_NETWORK` env var | `network` param | Result |
|------------------------|-----------------|--------|
| unset                  | unset           | mainnet (eip155:8453) |
| unset                  | `eip155:84532`  | Sepolia |
| `eip155:84532`         | unset           | Sepolia |
| `eip155:84532`         | `eip155:8453`   | mainnet (param overrides env) |

Param takes precedence over env. Env is the default. Hardcoded fallback is mainnet.

## Phase 4: Document in README / llms.txt

Update `site/store/llms.txt` (if it exists) or add a section to store's docs noting testnet support.

## Env Var Summary

| Var | Used by | Required | Default |
|-----|---------|----------|---------|
| `PRIM_NETWORK` | all primitives | no | `eip155:8453` (mainnet) |
| `PRIM_PAY_TO` | all primitives | no | `0x000...` (burn address) |
| `CLOUDFLARE_API_TOKEN` | store.sh | yes (store) | — |
| `CLOUDFLARE_ACCOUNT_ID` | store.sh | yes (store) | — |
| `R2_ACCESS_KEY_ID` | store.sh | yes (store) | — |
| `R2_SECRET_ACCESS_KEY` | store.sh | yes (store) | — |
| `BASE_RPC_URL` | wallet.sh | no | from `PRIM_NETWORK` config |
| `WALLET_MASTER_KEY` | wallet.sh | yes (wallet) | — |

## Before Closing

- [ ] Run `pnpm -r check` (all packages: lint + typecheck + tests pass)
- [ ] Verify `PRIM_NETWORK` unset → mainnet default (no existing tests break)
- [ ] Verify `PRIM_NETWORK=eip155:84532` → Sepolia USDC address, RPC URL, chain
- [ ] Verify integration script refuses to run without `PRIM_NETWORK=eip155:84532`
- [ ] Verify integration script cleans up test bucket on failure
- [ ] Verify wallet.sh `x402Fetch` works against store.sh on Sepolia
- [ ] Verify `PRIM_PAY_TO` env var works in store.sh
