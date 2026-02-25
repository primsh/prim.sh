# AgentToken Contract Build Provenance

## Contract

`AgentToken.sol` — minimal ERC-20 inheriting OpenZeppelin v5 `ERC20`, `ERC20Burnable`, `Ownable`.
Custom additions: configurable `decimals()`, optional `mint()` with `onlyOwner` + supply cap.

## Compilation

| Field | Value |
|-------|-------|
| Compiler | solc 0.8.24 (via forge 1.5.1-stable) |
| OZ version | @openzeppelin/contracts@5.1.0 |
| Optimizer | enabled, 200 runs |
| Output | `out/AgentToken.sol/AgentToken.json` |
| Bytecode SHA-256 | `b787e753fe808c2757446f52b0f87957547f44dbc3714905ff4ec7eff067b9e6` |

## Reproduce

```bash
cd packages/token/contracts
forge build --skip "lib/openzeppelin-contracts/certora/**"
# Artifact: out/AgentToken.sol/AgentToken.json
```

## Embedded artifacts

ABI and bytecode are embedded in `packages/token/src/contracts.ts`. Regenerate with:

```bash
# From packages/token/contracts:
forge build --skip "lib/openzeppelin-contracts/certora/**"
# Then extract: cat out/AgentToken.sol/AgentToken.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['bytecode']['object'])"
```

## Basescan source verification

To verify a deployed token on Basescan:
1. Use Basescan's "Verify & Publish" with "Solidity (Standard JSON Input)"
2. Select compiler version `0.8.24`, optimizer: yes, runs: 200
3. Upload the standard JSON input from `out/build-info/<hash>.json`
