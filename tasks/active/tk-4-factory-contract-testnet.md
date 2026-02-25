# TK-4: Token Deploy Backend + Testnet Validation

## Context

token.sh TypeScript is implemented (TK-1/TK-2, 58 unit tests) but can't run against a real chain. The deploy backend — the on-chain contract that actually creates ERC-20s — doesn't exist yet. This is the security-critical layer: it controls token ownership, minting authority, and supply caps. Bugs here are irreversible and exploitable.

**Key decision:** write a custom Solidity factory, or wrap an existing audited platform?

## Decision: Custom Factory vs Wrapping a Library

### Option A: Custom Solidity Factory

Write `TokenFactory.sol` + `AgentToken.sol`, deploy ourselves via Foundry.

| Pro | Con |
|-----|-----|
| No third-party dependency | 0 audits, 0 production deploys |
| Full control over gas/salt/events | Every line is novel attack surface |
| No API keys or rate limits | Must write + maintain Foundry tests |
| Minimal on-chain footprint | Ownership/mint/cap bugs are irreversible |

### Option B: Thirdweb SDK

Use `thirdweb` SDK to deploy pre-audited ERC-20s. Thirdweb's contracts are [audited by 0xMacro and Halborn](https://thirdweb.com/explore), deployed to Base, and open-source.

| Pro | Con |
|-----|-----|
| Contracts audited by multiple firms | SDK dependency (~50MB) |
| Millions of tokens deployed through their factories | Must match their ABI for mint/supply reads |
| Eliminates all custom Solidity | Factory address is theirs (they could deprecate) |
| Built-in mintable + burnable + supply cap | Less control over event format / salt |
| Skip Phase A entirely | Need to verify their contract supports all our features |

### Option C: Direct OZ Deploy via Nick's Factory

Use OpenZeppelin contracts (audited, standard) and deploy them via the [deterministic deployer](https://github.com/Arachnid/deterministic-deployment-proxy) (`0x4e59b44847b379578588920cA78FbF26c0B4956C`) already present on every EVM chain. No custom factory — we encode the OZ bytecode + constructor args and send a CREATE2 tx directly.

| Pro | Con |
|-----|-----|
| Contracts are audited (OpenZeppelin) | Must assemble bytecode + constructor args ourselves |
| No custom Solidity at all | Nick's Factory emits no events (must parse tx receipt differently) |
| Deterministic addresses via CREATE2 | More complex TypeScript encode logic |
| No third-party SDK dependency | Still need to test our bytecode assembly is correct |
| Factory can never be deprecated (immutable, permissionless) | |

### Recommendation

**Option B (Thirdweb)** for fastest safe path. Eliminates the highest-risk work (custom Solidity), leverages audited contracts, and their SDK handles deploy + mint natively. If Thirdweb's contract feature set doesn't cover our needs (decimals config, maxSupply cap, burn), fall back to **Option C**.

**Decision must be validated in Phase A** by testing Thirdweb's SDK on Base Sepolia against our exact feature requirements before committing.

## Known Bugs to Fix Regardless of Approach

### Bug 1: Mint cap check uses stale `initial_supply`

`service.ts:269` computes remaining cap as `maxSupply - initialSupply`, but `initial_supply` is static from deploy time. After the first mint, subsequent mints re-use the original supply figure and can exceed `maxSupply`.

| minted so far | initial_supply (DB) | maxSupply | mint request | current check | correct check |
|---------------|--------------------:|----------:|-------------:|--------------:|--------------:|
| 0 | 1000 | 2000 | 500 | 1000+500=1500 <= 2000 PASS | same |
| 500 | 1000 | 2000 | 600 | 1000+600=1600 <= 2000 PASS | 1500+600=2100 > 2000 FAIL |

**Fix:** Add `total_minted` column to `deployments` table. Increment on successful mint. Cap check becomes `initial_supply + total_minted + amount > maxSupply`. The on-chain contract also enforces this (defense in depth), but the TypeScript check must be correct too.

### Bug 2: No deploy confirmation / contract address population

`deployToken()` submits a tx and stores `deploy_status: "pending"` with `contract_address: null`. Nothing ever:
- Waits for the tx receipt
- Updates status to `confirmed` / `failed`
- Populates `contract_address`

Mint and supply endpoints reject `contract_address: null`, so they're gated — but the caller has no way to know when their token is live.

**Fix:** After deploy tx, call `waitForTransactionReceipt` (with 30s timeout), parse logs to extract contract address, then `updateDeploymentStatus(id, "confirmed", contractAddress)`. On revert, set `"failed"`. On timeout, leave `"pending"` (caller retries GET).

## Phases

### Phase A: Evaluate + Select Deploy Backend

1. Install Thirdweb SDK in a scratch script (not in packages/token yet)
2. Test on Base Sepolia:
   - Deploy ERC-20 with fixed supply, custom decimals (0, 6, 18)
   - Deploy ERC-20 with mintable=true and maxSupply
   - Verify owner is set to a specified wallet (not deployer)
   - Verify owner-only mint works
   - Verify non-owner mint reverts
   - Verify mint beyond maxSupply reverts on-chain
   - Verify burn works
   - Check if deterministic addresses are supported (CREATE2 or equivalent)
3. If Thirdweb covers all features → proceed with Option B
4. If gaps → evaluate Option C (direct OZ + Nick's Factory)
5. Document chosen approach and rationale

**Feature requirement checklist for evaluation:**
```
- [ ] Custom name + symbol
- [ ] Configurable decimals (0-18, not just 18)
- [ ] Fixed initial supply minted to specified owner address
- [ ] Optional mintable with maxSupply cap enforced on-chain
- [ ] Owner-only mint (non-owner reverts)
- [ ] ERC20Burnable (anyone burns their own)
- [ ] Ownership set to agent wallet, not deployer/msg.sender
- [ ] Deploy returns contract address (or retrievable from tx receipt)
```

### Phase B: TypeScript Bug Fixes + Integration

1. Add `total_minted TEXT NOT NULL DEFAULT '0'` column to `deployments` table (migration)
2. Fix cap check in `mintTokens()`: use `initial_supply + total_minted + amount > max_supply`
3. Increment `total_minted` after successful mint tx
4. Replace `writeContract` deploy path with chosen backend (Thirdweb SDK or direct OZ deploy)
5. Add `waitForTransactionReceipt` + contract address extraction
6. Set `deploy_status` to `"confirmed"` on receipt, `"failed"` on revert
7. Update `factory.ts` — either replace with Thirdweb wrapper or OZ bytecode encoder
8. New unit tests:
   - Mint cap tracks cumulative mints (the bug case — tests both True and False paths)
   - Deploy transitions to confirmed with contract address
   - Deploy transitions to failed on revert
   - Large supply values (verify no Number precision loss — use BigInt comparison if needed)
   - Duplicate deploy (same owner+name+symbol)

### Phase C: Testnet Smoke Test

1. Generate testnet deployer wallet, fund with Sepolia ETH from faucet
2. Set env vars for Base Sepolia:
   ```
   TOKEN_MASTER_KEY=<32-byte hex>
   TOKEN_DEPLOYER_ENCRYPTED_KEY=<encrypted blob>
   BASE_RPC_URL=https://sepolia.base.org
   TOKEN_DB_PATH=./token-testnet.db
   # TOKEN_FACTORY_ADDRESS only needed if Option A/C; Thirdweb handles internally
   ```
3. Run `bun run src/index.ts` locally
4. Smoke test sequence:
   - `POST /v1/tokens` — deploy fixed-supply token → verify 201, status pending
   - `GET /v1/tokens/:id` — poll until `deployStatus: "confirmed"`, verify `contractAddress` populated
   - `GET /v1/tokens/:id/supply` — verify on-chain totalSupply matches initialSupply
   - `POST /v1/tokens` (mintable=true, maxSupply=2M, initialSupply=1M)
   - `POST /v1/tokens/:id/mint` — mint 500K → verify 200, on-chain supply now 1.5M
   - `POST /v1/tokens/:id/mint` — mint 600K → verify 422 exceeds_max_supply
   - `POST /v1/tokens/:id/mint` (different wallet) → verify 403
   - Verify both deployed tokens visible on [Basescan Sepolia](https://sepolia.basescan.org) with correct name/symbol/supply/owner

## Mainnet Readiness Checklist

Do NOT deploy to mainnet until every box is checked:

```
## On-chain contracts
- [ ] Contracts are audited (Thirdweb/OZ) OR custom factory has passed forge test + manual review
- [ ] Mint reverts on-chain when exceeding maxSupply (not just TypeScript check)
- [ ] Non-owner mint reverts on-chain
- [ ] Token ownership set to agent wallet, NOT deployer
- [ ] Deploy cost measured on mainnet (should be < $0.05 per token)

## TypeScript
- [ ] total_minted column tracks cumulative mints; cap check uses it
- [ ] deploy_status transitions: pending → confirmed (with contract_address) or failed
- [ ] waitForTransactionReceipt timeout handling (30s, leaves "pending" on timeout)
- [ ] All unit tests pass (target: 70+)
- [ ] Lint + typecheck clean

## Testnet
- [ ] Full smoke test sequence passes on Base Sepolia
- [ ] Deployed token visible on Basescan Sepolia with correct name/symbol/supply
- [ ] Mint tx visible on Basescan with correct recipient and amount
- [ ] Over-cap mint reverts on-chain (not just 422 — verify no on-chain state change)

## Operational
- [ ] Deployer wallet funded with minimal ETH (< 0.01 ETH)
- [ ] Deployer key encrypted with production master key (not test key)
- [ ] BASE_RPC_URL set to mainnet RPC (not Sepolia)
- [ ] Monitor deployer ETH balance (alert if < 0.002 ETH)
```

## Risks

1. **Thirdweb SDK deprecation** — their factory contracts are on-chain and immutable, but the SDK could break. Mitigate: pin SDK version, keep Option C as fallback.
2. **Feature gaps** — Thirdweb may not support configurable decimals or maxSupply cap. Phase A validates this before committing.
3. **Gas estimation on mainnet** — Base Sepolia gas is free; mainnet has real costs. Measure in Phase C.
4. **Nonce collisions** — concurrent deploys from same deployer key can conflict. v1 accepts this. Revisit if it becomes a problem.
5. **RPC reliability** — `waitForTransactionReceipt` depends on RPC. Timeout at 30s, leave as "pending" (caller polls).

## Before closing

- [ ] Deploy backend selected (Thirdweb / OZ+Nick's / custom) with rationale documented
- [ ] `pnpm check` in packages/token passes (lint + typecheck + tests)
- [ ] Every row in the mint cap truth table has a corresponding unit test assertion
- [ ] Full smoke test sequence verified on Base Sepolia
- [ ] Mainnet readiness checklist reviewed — all items checked or explicitly deferred with rationale
