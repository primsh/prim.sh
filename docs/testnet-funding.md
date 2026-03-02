# Testnet Funding

How to get ETH and USDC on Base Sepolia and move funds between prim wallets.

## Prerequisites

```bash
# foundry (cast)
curl -L https://foundry.paradigm.xyz | bash && foundryup

# secrets (CDP + Circle API keys)
source ~/.config/secrets/env

# testnet wallet private key
source scripts/.env.testnet
```

## Wallet roles

See `docs/wallets.yaml` for addresses. Funding flow:

```
CDP faucet ──ETH──▶ TESTNET_WALLET ──USDC+ETH──▶ GATE_WALLET ──▶ beta testers
Circle faucet ──USDC──▶ TESTNET_WALLET
```

## Get testnet ETH (CDP faucet)

CDP faucet is reliable (~0.0001 ETH per drip, no rate limit hit at 10 sequential calls).

Existing code in `packages/faucet/src/service.ts:refillTreasury()` wraps this.

## Get testnet USDC

Circle faucet is consistently rate-limited (429). No reliable USDC faucet API exists yet. For now, TESTNET_WALLET has USDC from previous drips — use `cast` to move it where needed.

Better USDC sourcing (testnet USDC mint, alternative faucet, cron) is TBD.

## Check balances

```bash
RPC=https://sepolia.base.org
USDC=0x036CbD53842c5426634e7929541eC2318f3dCF7e

# ETH
cast balance 0x09D896446fBd3299Fa8d7898001b086E56f642B5 --rpc-url $RPC

# USDC (6 decimals)
cast call $USDC "balanceOf(address)(uint256)" 0x09D896446fBd3299Fa8d7898001b086E56f642B5 --rpc-url $RPC
```

## Fund GATE_WALLET from TESTNET_WALLET

```bash
RPC=https://sepolia.base.org
USDC=0x036CbD53842c5426634e7929541eC2318f3dCF7e
GATE=0xa9D8307305F4a6B49231C22eFe621Eb26cA40A65

# Send USDC (5 USDC = 5000000 in 6-decimal units)
cast send $USDC "transfer(address,uint256)" $GATE 5000000 \
  --private-key $TESTNET_WALLET --rpc-url $RPC

# Send ETH (for gas)
cast send $GATE --value 0.001ether \
  --private-key $TESTNET_WALLET --rpc-url $RPC
```

## Gate fund amounts

`packages/gate/src/fund.ts` reads these env vars (set in `/etc/prim/gate.env` on VPS):

| Env var | Default | Notes |
|---------|---------|-------|
| `GATE_USDC_AMOUNT` | `5.00` | Lower for smoke tests (e.g. `0.50`) |
| `GATE_ETH_AMOUNT` | `0.001` | Lower for smoke tests (e.g. `0.0001`) |

## Rate limit reference

| Provider | Token | Limit | Throughput hack |
|----------|-------|-------|-----------------|
| CDP | ETH | ~10/min observed | Batch sequential calls with 1s delay |
| Circle | USDC | 1/token/chain/24h per key×wallet | Unreliable — consistently 429'd |
| Circle | ETH | 1/token/chain/24h per key×wallet | Same — use CDP instead |
