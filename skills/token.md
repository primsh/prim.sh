---
name: token
version: 1.0.0
primitive: token.prim.sh
requires: [wallet]
tools:
  - token_deploy_token
  - token_list_tokens
  - token_get_token
  - token_mint_tokens
  - token_get_token_supply
  - token_create_pool
  - token_get_pool
  - token_get_liquidity_params
---

# token.prim.sh

ERC-20 token deployment and management for agents. Deploy tokens, mint supply, and create Uniswap V3 liquidity pools — no signup, no KYC, x402 payment only.

## When to use

Use token when you need to:
- Deploy a new ERC-20 token on Base
- Mint additional supply to a wallet address
- Create a Uniswap V3 liquidity pool for a token paired with USDC
- Get calldata for adding liquidity to an existing pool
- Check live on-chain total supply

Do NOT use token for:
- NFTs or ERC-721 tokens (not supported)
- Transferring tokens between wallets (call the contract directly)
- Tokens on chains other than Base

## Prerequisites

- Registered wallet (`wallet_register`)
- Wallet funded with USDC on Base (`faucet_usdc` on testnet)
- Wallet on access allowlist (private beta — if you get 403 `wallet_not_allowed`, request access at `POST https://gate.prim.sh/v1/access/request`)

## Common workflows

### 1. Deploy → Mint → Check supply

```
1. token_deploy_token
   - name: "MyToken"
   - symbol: "MTK"
   - initialSupply: "1000000000000000000000000"  (1M tokens, 18 decimals)
   - mintable: true
   - maxSupply: "10000000000000000000000000"
   → returns token with id and deployStatus: "pending"

2. token_get_token
   - id: <id from step 1>
   → poll until deployStatus is "confirmed" and contractAddress is set

3. token_mint_tokens
   - id: <id from step 1>
   - to: "0xRecipientAddress..."
   - amount: "500000000000000000000"  (500 tokens)
   → returns {txHash, to, amount, status: "pending"}

4. token_get_token_supply
   - id: <id from step 1>
   → returns live on-chain totalSupply
```

### 2. Deploy → Create pool → Get pool info

```
1. token_deploy_token
   - name: "MyToken"
   - symbol: "MTK"
   - initialSupply: "1000000000000000000000000"
   → returns token with id

2. token_get_token (poll until deployStatus: "confirmed")

3. token_create_pool
   - id: <token id>
   - pricePerToken: "0.001"  (0.1 cents per token in USDC)
   - feeTier: 3000  (0.3% — default)
   → returns {poolAddress, token0, token1, fee, sqrtPriceX96, tick, txHash}

4. token_get_pool
   - id: <token id>
   → verify pool details
```

### 3. Full token launch: deploy → mint → create pool → add liquidity

```
1. token_deploy_token (with mintable: true)
   → get token id

2. token_get_token — poll until deployStatus: "confirmed"

3. token_mint_tokens (optional — mint additional tokens to your wallet before creating pool)
   - to: <your wallet address>
   - amount: <amount for liquidity>

4. token_create_pool
   - pricePerToken: "0.001"
   → pool created

5. token_get_liquidity_params
   - id: <token id>
   - tokenAmount: "1000000000000000000000"  (1000 tokens for liquidity)
   - usdcAmount: "1000000"  ($1 USDC for liquidity)
   → returns:
     - approvals[]: submit each approval first (approve token + USDC to positionManagerAddress)
     - positionManagerAddress, tickLower, tickUpper, amount0Desired, amount1Desired, etc.

6. Submit token approvals on-chain (from the approvals[] array)

7. Call addLiquidity on the positionManagerAddress with the returned params
   → liquidity position minted as an NFT to your wallet
```

## Error handling

- `invalid_request` → Missing required field or invalid value. Check name, symbol, initialSupply format.
- `not_mintable` (400) → Token was deployed with `mintable: false`. Cannot mint additional tokens.
- `exceeds_max_supply` (422) → Mint would exceed `maxSupply`. Check current `totalMinted` with `token_get_token`.
- `pool_exists` (409) → A pool already exists for this token. Use `token_get_pool` to retrieve it.
- `not_found` (404) → Token ID does not exist. Verify the id is correct.
- `forbidden` (403) → The token belongs to a different wallet. You can only manage tokens your wallet owns.
- `rpc_error` (502) → Base RPC error. Retry after a short wait.

## Gotchas

- **Deploy is asynchronous:** `token_deploy_token` returns `deployStatus: "pending"`. Poll `token_get_token` until `deployStatus: "confirmed"` before minting or creating a pool. Attempting to mint against a pending deploy will fail.
- **Token amounts are strings:** All supply values (`initialSupply`, `maxSupply`, `amount`, `totalSupply`) are strings representing raw integer values. For 18 decimal tokens, 1 token = `"1000000000000000000"`. Never pass numbers — use strings.
- **USDC has 6 decimals:** When specifying USDC amounts for pool creation or liquidity, use 6-decimal units: $1 USDC = `"1000000"`.
- **One pool per token:** You can only create one Uniswap V3 pool per token. `pool_exists` (409) means it already exists — use `token_get_pool` to find it.
- **Approvals required before addLiquidity:** The `token_get_liquidity_params` response includes an `approvals[]` array. Submit each approval transaction on-chain before calling addLiquidity, or the transaction will revert.
- **feeTier options:** Valid fee tiers are 500 (0.05% — stable pairs), 3000 (0.3% — default, general use), 10000 (1% — exotic pairs). An invalid feeTier returns 400.
- **Mint is also asynchronous:** `token_mint_tokens` returns `status: "pending"`. The `token_get_token_supply` endpoint queries on-chain, so supply will update once the mint transaction is confirmed (~2 seconds on Base).

## Related primitives

- **wallet** — Required. Your wallet identity determines which tokens you own.
- **store** — Use store to persist deployment metadata or mint logs for later reference.
- **faucet** — Fund your wallet with USDC on testnet before deploying.
