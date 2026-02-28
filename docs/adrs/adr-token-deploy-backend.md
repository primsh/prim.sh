# ADR: Token Deploy Backend — OZ Contracts + viem `deployContract`

> token.sh deploys ERC-20s by compiling a minimal OpenZeppelin-based Solidity contract once, embedding the bytecode in TypeScript, and calling viem's `deployContract` per token. No on-chain factory, no third-party SDK.

**Date:** 2026-02-25
**Status:** Accepted
**Task:** TK-4

## Context

token.sh has a working TypeScript service layer (TK-1/TK-2, 58 unit tests) but no way to deploy tokens on-chain. The current code assumes an on-chain factory contract (`TOKEN_FACTORY_ADDRESS`) that doesn't exist. We need to choose how tokens actually get deployed.

This is the security-critical layer: it controls token ownership, minting authority, and supply caps. Bugs in custom Solidity are irreversible and exploitable. The decision optimizes for auditability and minimal novel code.

### Feature requirements

Every option must support:

```
- Custom name + symbol
- Configurable decimals (0-18, not just 18)
- Fixed initial supply minted to specified owner address
- Optional mintable with maxSupply cap enforced on-chain
- Owner-only mint (non-owner reverts)
- ERC20Burnable (anyone burns their own)
- Ownership set to agent wallet, not deployer/msg.sender
- Contract address retrievable from tx receipt
```

### Gas context

Base L2 gas is low enough to be negligible for our use case. At the time of this decision (Feb 2026), a full ERC-20 deploy (~1M gas) costs approximately $0.00003 on Base at typical gas prices. This estimate will be validated with actual measurements during the Phase C testnet smoke test before mainnet launch. At these economics, there is no justification for gas-optimization patterns like clone factories or CREATE2 deterministic deploys.

## Options Considered

### Option A: Custom Solidity Factory

Write `TokenFactory.sol` + `AgentToken.sol`, deploy via Foundry. Factory uses CREATE2 for deterministic addresses.

| Pro | Con |
|-----|-----|
| Full control over gas/salt/events | 0 audits, 0 production deploys |
| No third-party dependency | Every line is novel attack surface |
| No API keys or rate limits | Must write + maintain Foundry test suite |
| Deterministic addresses via CREATE2 | Ownership/mint/cap bugs are irreversible |

**Rejected.** The factory contract itself is unnecessary complexity that adds attack surface. Deterministic addresses are not a product requirement.

### Option B: Thirdweb SDK

Use `thirdweb` SDK to deploy pre-audited ERC-20s.

| Pro | Con |
|-----|-----|
| Contracts audited by multiple firms | SDK dependency (~50MB, heavy) |
| Millions of tokens deployed through their factories | Must match their ABI for mint/supply reads |
| Eliminates all custom Solidity | Factory address is theirs (they could deprecate) |
| Built-in mintable + burnable + supply cap | Unclear if configurable decimals supported |

**Rejected.** 50MB SDK dependency for a function we can do in ~5 lines of viem. Vendor lock-in on factory address. Feature coverage uncertain without evaluation.

### Option C: OZ Contracts + Nick's Deterministic Deployer

Use OpenZeppelin contracts deployed via the [deterministic deployer](https://github.com/Arachnid/deterministic-deployment-proxy) (`0x4e59b44847b379578588920cA78FbF26c0B4956C`) for CREATE2 addresses.

| Pro | Con |
|-----|-----|
| Contracts are audited (OpenZeppelin) | Must assemble bytecode + constructor args manually |
| No custom Solidity | Nick's Factory emits no events (must parse tx differently) |
| Deterministic addresses via CREATE2 | More complex TypeScript encode logic |
| Factory can never be deprecated | CREATE2 encoding is error-prone |

**Rejected.** All the complexity of CREATE2 encoding for a feature we don't need. Deterministic addresses add no product value when the caller gets the address from the tx receipt.

### Option D: OZ Contracts + viem `deployContract` (chosen)

Write a ~30-line Solidity contract inheriting audited OZ building blocks. Compile once, embed bytecode in TypeScript, deploy each token via viem's `deployContract`.

| Pro | Con |
|-----|-----|
| All ERC-20 logic from audited OZ contracts | Need solc/forge for one-time compile |
| Zero runtime vendor dependency | Not deterministic (address from receipt, not predictable) |
| viem already in project (^2.21.0) | ~30 lines of glue Solidity (constructor + mint) |
| Simplest TypeScript integration | Each deploy is full contract creation (not clone) |
| No factory contract to maintain or deprecate | |
| `receipt.contractAddress` — no log parsing | |

### Option E: EIP-1167 Clone Factory

Deploy one master token contract, then create cheap clones via EIP-1167 minimal proxy.

| Pro | Con |
|-----|-----|
| ~$0.00001/clone (vs ~$0.00003/full deploy) | Requires deploying + maintaining a master contract |
| Saves gas per token | Proxies complicate verification on Basescan |
| Proven pattern | Premature optimization — $0.00002 savings is meaningless |

**Rejected.** Saves $0.00002 per deploy while adding proxy complexity. Not worth it until token volume makes gas a real cost center.

## Decision

**Option D: OZ contracts + viem `deployContract`.**

### What gets built

1. **`AgentToken.sol`** (~30 lines) — inherits OZ v5 `ERC20`, `ERC20Burnable`, `Ownable`
   - Constructor: `(name, symbol, decimals_, initialSupply, mintable_, maxSupply_, owner)`
   - One `mint()` function: `onlyOwner`, checks `mintable`, enforces `maxSupply`
   - `decimals()` override for configurable decimals
   - All transfer/burn/ownership logic is unmodified OZ code

2. **`contracts.ts`** — replaces `factory.ts`
   - `AGENT_TOKEN_ABI` and `AGENT_TOKEN_BYTECODE` as TypeScript constants (compiled artifacts)
   - `ERC20_ABI` for post-deploy reads (mint, totalSupply, owner)
   - No factory address, no CREATE2 salt computation, no address prediction

3. **Chain configuration** — `deployer.ts` and `service.ts` currently hardcode `base` mainnet chain. Add `getChain()` helper that reads `BASE_CHAIN_ID` env var and returns `base` (8453) or `baseSepolia` (84532). Assert chain ID matches before any write tx.

4. **`service.ts` deploy path** — `writeContract` (factory call) replaced with:
   ```
   deployContract({ abi, bytecode, args: [name, symbol, decimals, supply, mintable, maxSupply, owner] })
   → waitForTransactionReceipt
   → check receipt.status === "success" AND receipt.contractAddress !== null
   → updateDeploymentStatus(id, "confirmed", contractAddress)
   ```
   Receipt status must be checked explicitly — `waitForTransactionReceipt` returns reverted receipts without throwing.

### What gets removed

| Removed | Reason |
|---------|--------|
| `TOKEN_FACTORY_ADDRESS` env var | No factory contract |
| `factory_address` DB column | No factory to reference |
| `factoryAddress` API response field | Not applicable |
| `FACTORY_ABI` | Replaced by `AGENT_TOKEN_ABI` |
| `computeDeploySalt()` | No CREATE2 |
| `predictTokenAddress()` | Address comes from receipt |
| `getFactoryAddress()` | No factory |

## Consequences

- **Solidity compilation is a one-time step.** Compile `AgentToken.sol` with solc or forge, embed bytecode in TypeScript. Provenance metadata (solc version, optimizer settings, OZ version, bytecode SHA-256) recorded in `contracts/BUILD.md` for reproducibility and Basescan verification. No Solidity toolchain needed at runtime or in CI (unless contract changes).
- **Each token is a standalone contract.** No shared factory state. Tokens are independent on-chain.
- **Contract verification on Basescan is straightforward.** Standard OZ inheritance, constructor args ABI-encoded. No proxy pattern. Compiler settings in `BUILD.md` enable verification.
- **DB migration required.** Drop `factory_address` column, add `total_minted` column. SQLite `DROP COLUMN` is unreliable across versions — requires table-rebuild migration (create new table → copy data → drop old → rename).
- **API breaking change.** `factoryAddress` removed from `TokenResponse`. Acceptable — no production consumers yet.
- **Chain must be configurable.** Hardcoded `base` mainnet replaced with env-driven chain selection (`BASE_CHAIN_ID`). Chain ID assertion before writes prevents accidental mainnet deploys during testnet work.
- **~30 lines of novel Solidity.** Constructor and mint function. All actual ERC-20 logic is audited OZ code. This is the smallest possible attack surface for the feature set.

## Revisit triggers

- If deploy volume exceeds 10K tokens/month and gas becomes a real cost → evaluate EIP-1167 clones (Option E)
- If a product requirement emerges for predictable addresses before deploy → evaluate CREATE2 via Nick's Factory (Option C)
- If OZ v6 ships breaking changes → recompile AgentToken.sol (should be trivial given ~30 lines)
- If Base L2 gas economics change significantly (e.g. blob fee market shifts) → re-measure deploy cost and reassess clone/factory approach
