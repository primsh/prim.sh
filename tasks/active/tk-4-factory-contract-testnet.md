# TK-4: Token Deploy Backend + Testnet Validation

## Context

token.sh TypeScript is implemented (TK-1/TK-2, 58 unit tests) but can't run against a real chain. The deploy backend — the on-chain contract that actually creates ERC-20s — doesn't exist yet. This is the security-critical layer: it controls token ownership, minting authority, and supply caps. Bugs here are irreversible and exploitable.

## Decision: OZ Contracts + viem `deployContract` (Option D)

**Chosen approach:** Write a minimal Solidity token contract inheriting from audited OpenZeppelin building blocks. Compile once, embed bytecode in TypeScript, deploy each token via viem's `deployContract`. No factory contract, no third-party SDK.

### Why Option D

| Factor | Assessment |
|--------|------------|
| Security | All ERC-20 logic comes from audited OZ contracts — we only write ~30 lines of constructor glue |
| Dependencies | viem already in project (^2.21.0). OZ contracts needed only at compile time, not runtime |
| Complexity | Simpler than Nick's Factory (no CREATE2 encoding) and lighter than Thirdweb SDK (~50MB) |
| Gas cost | ~$0.00003/deploy on Base. No reason to optimize with clone factories or CREATE2 |
| Vendor risk | Zero. No factory contract to deprecate, no SDK to break |
| Deterministic addresses | Not needed. Caller gets contract address from tx receipt |

### Options considered

- **Option A** (Custom Solidity factory) — rejected: novel attack surface, no audits
- **Option B** (Thirdweb SDK) — rejected: 50MB dependency, vendor lock-in, may not support all features
- **Option C** (OZ + Nick's deterministic deployer) — rejected: CREATE2 encoding complexity for no benefit at Base gas prices
- **Option D** (OZ + viem `deployContract`) — **chosen**: audited contracts, zero vendor dependency, tools already in project
- **Option E** (EIP-1167 clone factory) — rejected: premature optimization, saves ~$0.00002/deploy

## Contract Design

### `AgentToken.sol` (~30 lines)

Inherits from OZ v5: `ERC20`, `ERC20Burnable`, `Ownable`.

Constructor params map 1:1 to our `CreateTokenRequest`:

```
constructor(name, symbol, decimals_, initialSupply, mintable_, maxSupply_, owner)
```

| Feature | Implementation |
|---------|---------------|
| Custom name + symbol | ERC20 constructor |
| Configurable decimals (0-18) | State variable + `decimals()` override |
| Initial supply minted to owner | `_mint(owner, initialSupply)` in constructor |
| Mintable with on-chain cap | `mint()` function with `require(mintable)` + `require(totalSupply + amount <= maxSupply)` |
| Owner-only mint | `onlyOwner` modifier from Ownable |
| Burn | ERC20Burnable (anyone burns their own tokens) |
| Ownership transfer | Ownable (owner can `transferOwnership`) |

**Note on decimals:** OZ v5 ERC20 defaults to 18 and exposes `decimals()` as a virtual function. We override it to return a constructor-set value stored in an immutable state variable.

**Mint guard logic:**

| mintable | maxSupply | totalSupply + amount <= maxSupply | mint allowed? |
|----------|-----------|-----------------------------------|---------------|
| false | any | any | NO (revert) |
| true | 0 | any | YES (uncapped) |
| true | >0 | true | YES |
| true | >0 | false | NO (revert) |

## Known Bugs to Fix

### Bug 1: Mint cap check uses stale `initial_supply`

`service.ts:269` computes remaining cap as `maxSupply - initialSupply`, but `initial_supply` is static from deploy time. After the first mint, subsequent mints re-use the original supply figure and can exceed `maxSupply`.

| minted so far | initial_supply (DB) | maxSupply | mint request | current check | correct check |
|---------------|--------------------:|----------:|-------------:|--------------:|--------------:|
| 0 | 1000 | 2000 | 500 | 1000+500=1500 <= 2000 PASS | same |
| 500 | 1000 | 2000 | 600 | 1000+600=1600 <= 2000 PASS | 1500+600=2100 > 2000 FAIL |

**Fix:** Add `total_minted TEXT NOT NULL DEFAULT '0'` column to `deployments` table. Increment on successful mint. Cap check becomes `initial_supply + total_minted + amount > maxSupply`. The on-chain contract also enforces this (defense in depth), but the TypeScript check must be correct too.

### Bug 2: No deploy confirmation / contract address population

`deployToken()` submits a tx and stores `deploy_status: "pending"` with `contract_address: null`. Nothing ever:
- Waits for the tx receipt
- Updates status to `confirmed` / `failed`
- Populates `contract_address`

**Fix:** After deploy tx, call `waitForTransactionReceipt` (with 30s timeout), parse the receipt to extract contract address (`receipt.contractAddress` — viem provides this for deploy txs), then `updateDeploymentStatus(id, "confirmed", contractAddress)`. On revert, set `"failed"`. On timeout, leave `"pending"` (caller retries GET).

## Phases

### Phase A: Compile OZ Token Contract

1. Add `contracts/` directory in `packages/token/`
2. Write `contracts/AgentToken.sol` — inherits OZ v5 `ERC20`, `ERC20Burnable`, `Ownable`
   - Constructor: `(string name, string symbol, uint8 decimals_, uint256 initialSupply, bool mintable_, uint256 maxSupply_, address owner)`
   - `decimals()` override returns stored `_decimals` immutable
   - `mint(address to, uint256 amount)` — `onlyOwner`, requires `mintable`, enforces `maxSupply` if nonzero
   - That's it. ~30 lines total. Zero novel logic.
3. Compile with `solc` (or `forge build`) to produce ABI + bytecode
4. Embed compiled artifacts as TypeScript constants: `AGENT_TOKEN_ABI` and `AGENT_TOKEN_BYTECODE` in a new `contracts.ts` file
   - ABI as `const` array (for viem type inference)
   - Bytecode as hex string
5. OZ contracts are a compile-time dependency only — `@openzeppelin/contracts` in devDependencies or compile in a separate step and check in the artifacts

**Compile strategy:** Either:
- (a) Add forge/solc as a dev tool, compile in CI → artifacts checked into repo
- (b) Use OZ Wizard to generate, compile once locally, embed bytecode → no Solidity toolchain in project

Option (b) is simpler for v1. Compile once, embed, done. Revisit if the contract changes.

**Reproducibility:** Check in a `contracts/BUILD.md` alongside the source with:
- Exact solc version (e.g. `0.8.24`)
- Optimizer settings (runs count, or disabled)
- OZ contracts version (e.g. `@openzeppelin/contracts@5.1.0`)
- SHA-256 of the compiled bytecode
- Command used to reproduce (e.g. `solc --optimize --optimize-runs 200 ...`)

This enables future verification and Basescan source verification without keeping solc in the project.

### Phase B: TypeScript Refactor + Bug Fixes

**Files to modify:** `factory.ts`, `service.ts`, `db.ts`, `api.ts`, `deployer.ts`

1. **Make chain configurable** (`deployer.ts`, `service.ts`):
   - Current code hardcodes `import { base } from "viem/chains"` and `chain: base`
   - Add `getChain()` helper: reads `BASE_CHAIN_ID` env var (default `8453`), returns `base` or `baseSepolia`
   - `getDeployerClient()` and `getPublicClient()` both use `getChain()`
   - Add chain ID assertion before any write tx: `assert client.chain.id === expectedChainId` — prevents accidental mainnet deploys during testnet work

2. **Replace `factory.ts`** → rename to `contracts.ts` (or replace contents):
   - Remove: `FACTORY_ABI`, `computeDeploySalt`, `predictTokenAddress`, `getFactoryAddress`
   - Add: `AGENT_TOKEN_ABI` (full ABI from compiled contract), `AGENT_TOKEN_BYTECODE` (hex)
   - Keep: `ERC20_ABI` (for mint/supply reads on deployed tokens)

3. **Update `service.ts` `deployToken()`:**
   - Remove `getFactoryAddress()` call
   - Remove `computeDeploySalt()` call
   - Replace `writeContract` (factory call) with `deployContract`:
     ```
     viem deployContract({ abi: AGENT_TOKEN_ABI, bytecode: AGENT_TOKEN_BYTECODE, args: [name, symbol, decimals, initialSupplyWei, mintable, maxSupplyWei, ownerAddress] })
     ```
   - `deployContract` returns a tx hash. Then call `waitForTransactionReceipt` → check receipt:
     ```
     receipt.status === "reverted"  → set deploy_status: "failed"
     receipt.contractAddress === null → set deploy_status: "failed" (defensive — shouldn't happen for deploy txs)
     receipt.status === "success" && receipt.contractAddress !== null → set deploy_status: "confirmed"
     ```
   - On timeout (30s), leave `"pending"` — caller polls GET
   - **Do NOT rely solely on exception catching for failure detection.** `waitForTransactionReceipt` can return a receipt with `status: "reverted"` without throwing.

4. **Update `db.ts`:**
   - Add `total_minted TEXT NOT NULL DEFAULT '0'` column to schema
   - **Migration for `factory_address` removal:** SQLite doesn't reliably support `DROP COLUMN` across all versions. Use table-rebuild migration:
     1. `CREATE TABLE deployments_v2 (...)` — new schema without `factory_address`, with `total_minted`
     2. `INSERT INTO deployments_v2 SELECT <columns except factory_address>, '0' FROM deployments`
     3. `DROP TABLE deployments`
     4. `ALTER TABLE deployments_v2 RENAME TO deployments`
     5. Re-create indexes
   - Wrap in a transaction. Gate on a `schema_version` pragma or table introspection (`PRAGMA table_info(deployments)` — check if `factory_address` column exists).
   - Add `incrementTotalMinted(id, amount)` function
   - Remove `factory_address` from `DeploymentRow` and schema

4. **Fix `service.ts` `mintTokens()` (Bug 1):**
   - Read `total_minted` from row
   - Cap check: `BigInt(initial_supply) + BigInt(total_minted) + amountWei > BigInt(max_supply)` (use BigInt, not Number — avoids precision loss on large supplies)
   - After successful mint tx, call `waitForTransactionReceipt`, then `incrementTotalMinted(id, amount)`

5. **Update `api.ts` `TokenResponse`:**
   - Remove `factoryAddress` field
   - Add `totalMinted` field (optional, for mintable tokens)

6. **Update `rowToTokenResponse()`** to reflect schema changes

7. **New unit tests** (additions to existing test file):
   - Mint cap tracks cumulative mints:
     - `assert` mint #1 succeeds when `initial_supply + total_minted + amount <= max_supply`
     - `assert` mint #2 fails when cumulative would exceed max_supply (the Bug 1 case)
   - Deploy transitions to confirmed with contract address
   - Deploy transitions to failed on revert
   - Large supply values (verify no Number precision loss — use BigInt assertions)
   - Duplicate deploy (same owner+name+symbol) — should succeed (different contract addresses)

### Phase C: Testnet Smoke Test

1. Generate testnet deployer wallet, fund with Sepolia ETH from faucet
2. Set env vars for Base Sepolia:
   ```
   TOKEN_MASTER_KEY=<32-byte hex>
   TOKEN_DEPLOYER_ENCRYPTED_KEY=<encrypted blob>
   BASE_RPC_URL=https://sepolia.base.org
   BASE_CHAIN_ID=84532
   TOKEN_DB_PATH=./token-testnet.db
   ```
   **Critical:** `BASE_CHAIN_ID=84532` selects Base Sepolia (not mainnet `8453`). The chain ID assertion in `getDeployerClient()` prevents accidental mainnet deploys.
3. Run `bun run src/index.ts` locally
4. Smoke test sequence (call service functions directly, like R-11 pattern — bypasses x402 middleware):
   - `deployToken({ name, symbol, decimals: 18, initialSupply: "1000" }, wallet)` → verify status confirmed, contractAddress populated
   - `getToken(id, wallet)` → verify all fields
   - `getSupply(id, wallet)` → verify on-chain totalSupply matches initialSupply
   - `deployToken({ ..., mintable: true, maxSupply: "2000000", initialSupply: "1000000" }, wallet)` → verify confirmed
   - `mintTokens(id, { to: wallet, amount: "500000" }, wallet)` → verify 200, on-chain supply now 1.5M
   - `mintTokens(id, { to: wallet, amount: "600000" }, wallet)` → verify 422 exceeds_max_supply
   - `mintTokens(id, { to: otherWallet, amount: "100" }, otherWallet)` → verify 403
   - Verify both tokens visible on [Basescan Sepolia](https://sepolia.basescan.org) with correct name/symbol/supply/owner
   - Test with decimals: 0, 6, 18 to confirm configurable decimals work
5. Write as `test/smoke-live.test.ts` using `bun:test` (same pattern as relay R-11)

## Mainnet Readiness Checklist

Do NOT deploy to mainnet until every box is checked:

```
## On-chain contract
- [ ] AgentToken.sol inherits only audited OZ contracts (ERC20, ERC20Burnable, Ownable)
- [ ] Total custom logic is < 40 lines (constructor + mint function)
- [ ] Mint reverts on-chain when exceeding maxSupply (not just TypeScript check)
- [ ] Non-owner mint reverts on-chain
- [ ] Token ownership set to agent wallet, NOT deployer
- [ ] Deploy cost measured on mainnet (should be < $0.01 per token on Base)

## TypeScript
- [ ] total_minted column tracks cumulative mints; cap check uses BigInt
- [ ] deploy_status transitions: pending → confirmed (with contract_address) or failed
- [ ] waitForTransactionReceipt timeout handling (30s, leaves "pending" on timeout)
- [ ] factory_address removed from schema and API response
- [ ] All unit tests pass (target: 70+)
- [ ] Lint + typecheck clean

## Testnet
- [ ] Full smoke test sequence passes on Base Sepolia
- [ ] Deployed token visible on Basescan Sepolia with correct name/symbol/supply
- [ ] Mint tx visible on Basescan with correct recipient and amount
- [ ] Over-cap mint reverts on-chain (not just 422 — verify no on-chain state change)
- [ ] Configurable decimals verified (0, 6, 18)

## Operational
- [ ] Deployer wallet funded with minimal ETH (< 0.01 ETH)
- [ ] Deployer key encrypted with production master key (not test key)
- [ ] BASE_RPC_URL set to mainnet RPC (not Sepolia)
- [ ] Monitor deployer ETH balance (alert if < 0.002 ETH)
```

## Risks

1. **Solidity compilation dependency** — Need solc or forge to compile AgentToken.sol. Mitigate: compile once, embed bytecode with provenance metadata in `contracts/BUILD.md`, no runtime dependency on Solidity toolchain.
2. **OZ version breaking changes** — OZ v5 changed `_beforeTokenTransfer` → `_update`. Pin `@openzeppelin/contracts` version. Our contract is simple enough that upgrading is trivial.
3. **Gas estimation on mainnet** — Base Sepolia gas is free; mainnet has real costs. Phase C must measure actual deploy gas on testnet. Record gas used per deploy in smoke test output. Expected: <$0.01/deploy on mainnet at current Base gas prices, but verify before launch.
4. **Nonce collisions** — concurrent deploys from same deployer key can conflict. v1 accepts this. Revisit if it becomes a problem.
5. **RPC reliability** — `waitForTransactionReceipt` depends on RPC. Timeout at 30s, leave as "pending" (caller polls).
6. **Chain misconfiguration** — deployer client must reject writes if configured chain doesn't match RPC chain. `getChain()` helper + chain ID assertion before writes prevents accidental mainnet deploys.

## Before closing

- [ ] AgentToken.sol compiled and bytecode embedded in TypeScript
- [ ] `factory_address` removed from DB schema, API types, and all references
- [ ] `pnpm check` in packages/token passes (lint + typecheck + tests)
- [ ] Every row in the mint cap truth table has a corresponding unit test assertion
- [ ] Full smoke test sequence verified on Base Sepolia
- [ ] Mainnet readiness checklist reviewed — all items checked or explicitly deferred with rationale
