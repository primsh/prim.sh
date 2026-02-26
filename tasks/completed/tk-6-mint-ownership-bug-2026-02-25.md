# TK-6: Fix mint ownership bug

**Date:** 2026-02-25
**Status:** completed
**Depends on:** TK-2 (done)

## Context

On-chain `mint()` reverts when called from token.sh because of a role mismatch between the transaction signer and the contract's `onlyOwner` check.

### The bug

```
deployToken() → deployContract(…, owner_ = agentWallet)
  → AgentToken constructor: Ownable(owner_=agentWallet), _mint(owner_, initialSupply)
  → On-chain owner() == agentWallet ✓

mintTokens() → getDeployerClient().writeContract({ functionName: "mint", … })
  → msg.sender == deployerKey address
  → onlyOwner checks msg.sender == owner() → deployerKey ≠ agentWallet → REVERT
```

| Actor | Address | On-chain role | Can call mint()? |
|-------|---------|--------------|-----------------|
| Deployer key (token.sh service) | `TOKEN_DEPLOYER_ENCRYPTED_KEY` | `msg.sender` at deploy time, no role after | No (not owner) |
| Agent wallet (x402 payer) | `callerWallet` from payment | `Ownable.owner()` | Yes (but agent has no server-side signing — non-custodial) |

The agent can't sign the mint tx server-side because wallet.sh is non-custodial (W-10). The deployer can't mint because it's not the on-chain owner.

## Decision: separate `minter` role from `owner`

**Rejected alternatives:**

1. **Make deployer the Ownable owner** — breaks agent sovereignty; agent can't `transferOwnership` or `renounceOwnership` without going through the service.
2. **Return mint calldata (like `getLiquidityParams`)** — breaks existing POST /mint API contract; requires agent to submit their own on-chain tx which adds friction and gas costs.
3. **Transfer ownership to deployer, mint, transfer back** — race conditions, gas waste, complex error recovery.

**Chosen approach:** Add a `minter` storage variable to `AgentToken.sol`. The deployer (`msg.sender` at construction) becomes the minter. The agent (`owner_` param) remains the Ownable owner and initial supply recipient. The owner can reassign or revoke the minter via `setMinter()`.

This preserves:
- Agent sovereignty (owner can transfer ownership, revoke minter)
- Service-mediated minting (deployer signs mint txs)
- Existing API contract (POST /mint works unchanged)
- No new constructor parameters (minter = msg.sender, implicit)

## Files to modify

### 1. `packages/token/contracts/AgentToken.sol` — add minter role

- Add `address public minter;` storage variable
- Set `minter = msg.sender;` in constructor (no new constructor param)
- Replace `onlyOwner` on `mint()` with a `require(msg.sender == minter, ...)` check
- Add `setMinter(address newMinter) external onlyOwner` — lets agent reassign minter
- Add `MinterChanged(address indexed previousMinter, address indexed newMinter)` event

### 2. `packages/token/src/contracts.ts` — recompile + update artifacts

After modifying AgentToken.sol, recompile with forge:
```bash
cd packages/token/contracts && forge build
```

Update in contracts.ts:
- `AGENT_TOKEN_BYTECODE` — new compiled bytecode
- `AGENT_TOKEN_ABI` — add `minter()` view function, `setMinter()` function, `MinterChanged` event
- `ERC20_ABI` — add `minter()` view (for optional read in service layer)

### 3. `packages/token/test/api.test.ts` — test updates

No service-layer code changes needed (deployer client still calls `mint()`, which now checks minter instead of owner — and deployer IS the minter). However, the mock wallet client's `account.address` (`0xDEPLOYER0000...`) is used. The test mock for `readContract` that backs `getPool` / `slot0` may need updating if new ABI entries are queried.

Add test cases:
- `assert` that deploy succeeds and the deployer can mint (existing happy-path test now actually reflects on-chain reality)
- Verify the mock's writeContract call goes through without the `onlyOwner` revert scenario

### No changes needed

- `service.ts` — `deployToken()` constructor args unchanged (still 7 params, same order). `mintTokens()` still calls `getDeployerClient().writeContract(...)` which is now the minter.
- `index.ts` — routes unchanged.
- `db.ts` — schema unchanged.
- `deployer.ts` — unchanged.
- `api.ts` — types unchanged.

## Role truth table

| Caller | Is minter? | Is owner? | `mint()` result |
|--------|-----------|-----------|-----------------|
| Deployer key | Yes (msg.sender at construction) | No | Success |
| Agent wallet | No (unless setMinter called) | Yes | Revert |
| Random address | No | No | Revert |
| Agent wallet after `setMinter(agentWallet)` | Yes | Yes | Success |

## Risk: minter revocation

If the agent calls `setMinter(address(0))` or `setMinter(agentWallet)`, the service can no longer mint on their behalf. This is intentional — the agent has sovereignty. The service should handle the on-chain revert gracefully (already returns `rpc_error` 502).

## Phase 1: Contract + artifacts

1. Edit `AgentToken.sol` as described above
2. `cd packages/token/contracts && forge build`
3. Copy new bytecode + ABI into `contracts.ts`
4. Verify `pnpm -C packages/token test` passes (95 tests)

## Before closing

- [ ] Run `pnpm -C packages/token test` (all 95 tests pass)
- [ ] Verify `forge build` succeeds with no warnings
- [ ] Confirm bytecode SHA-256 comment in contracts.ts is updated
- [ ] Confirm constructor args order unchanged (7 params: name, symbol, decimals, initialSupply, mintable, maxSupply, owner)
- [ ] For the `mint()` guard: verify both minter=true and minter=false paths are tested
- [ ] Verify `setMinter()` has onlyOwner guard (not onlyMinter — owner controls who mints)
