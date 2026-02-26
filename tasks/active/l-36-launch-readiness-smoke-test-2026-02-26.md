# L-36: Launch readiness smoke test (CLI end-to-end)

**Status:** pending
**Depends on:** L-33 (done), L-34 (done)
**Blocks:** nothing (final validation gate before launch)

## Context

Existing smoke tests use direct HTTP calls and `createPrimFetch` (TypeScript library). L-36 validates the **agent experience**: a fresh wallet goes from zero to using a paid service, entirely through the `prim` CLI binary. If this test passes, an agent can onboard without writing custom code.

## Gap: no `prim wallet register` CLI command

The CLI has `create`, `list`, `balance`, `import`, `export`, `default`, `remove` — but no `register`. Wallet registration (EIP-191 signature → `POST /v1/wallets`) is currently only possible via direct HTTP (`smoke-live.ts` lines 106-123).

**Decision:** Add `prim wallet register` to cli.ts. Without it, the CLI-only flow is broken — agents can't register their wallet without writing HTTP code.

| Action | Who does it | How |
|--------|-------------|-----|
| Create local keypair | `prim wallet create` | Already works (L-33 fixed) |
| Register with wallet.prim.sh | **Missing** | Need `prim wallet register` |
| Get testnet USDC | `prim faucet usdc` | Already works |
| Use paid service | `prim store create-bucket` | Already works |

`prim wallet register` should:
1. Load the default wallet's private key (decrypt keystore)
2. Sign an EIP-191 message: `Register <address> with prim.sh at <ISO timestamp>`
3. POST to `https://wallet.prim.sh/v1/wallets` with `{ address, signature, timestamp }`
4. Handle 409 (already registered) as success
5. Print the registered address

Flags: `--passphrase` (for keystore decryption), `--url` (override wallet URL). Same patterns as other CLI commands.

**Dependency direction:** cli.ts imports from `viem/accounts` (already a dependency via keystore.ts) for `privateKeyToAccount` + `signMessage`. No new packages.

## Test Script

**File:** `scripts/smoke-cli.sh` (shell script, not TypeScript)

A shell script proves the actual binary works — no TypeScript runtime, no import tricks. Each step runs `prim` commands and checks exit codes + output.

### Environment

```bash
# Required:
PRIM_NETWORK=eip155:84532     # Testnet guard
PRIM_HOME=$(mktemp -d)        # Isolated keystore (fresh wallet)

# Optional overrides (default to live *.prim.sh):
PRIM_WALLET_URL, PRIM_FAUCET_URL, PRIM_STORE_URL
```

### Steps

| # | Command | Assert | Notes |
|---|---------|--------|-------|
| 1 | `prim wallet create --passphrase=test123` | Exit 0, output contains `0x` address | Captures address from stdout |
| 2 | `prim wallet register --passphrase=test123` | Exit 0 or "already registered" | New command (see Gap section) |
| 3 | `prim faucet usdc` | Exit 0, output contains `txHash` | Uses default wallet (set in step 1) |
| 4 | Poll `prim wallet balance` | Output shows non-zero USDC | Retry up to 60s, 5s interval |
| 5 | `prim store create-bucket --name=smoke-$RANDOM` | Exit 0, output contains bucket id | x402 payment happens automatically |
| 6 | `echo "hello prim" \| prim store put $BUCKET smoke.txt` | Exit 0 | Pipe stdin as object body |
| 7 | `prim store get $BUCKET smoke.txt` | Output equals `hello prim` | Verify round-trip |
| 8 | `prim store rm $BUCKET smoke.txt` | Exit 0 | Cleanup |
| 9 | `prim store rm-bucket $BUCKET` | Exit 0 | Cleanup |

### Decision table: step 3 faucet error handling

| HTTP status | Meaning | Test behavior |
|-------------|---------|---------------|
| 200 | Dripped | Continue |
| 429 | Rate limited | Skip (print warning), continue if wallet already has balance |
| 4xx/5xx | Service error | Fail test |

### Decision table: step 4 balance polling

| Balance | Funded | Action |
|---------|--------|--------|
| > 0 | true | Continue to store tests |
| 0 | false | Retry (up to 60s) |
| 0 after 60s | false | Fail test (faucet didn't deliver) |

## Implementation Scope

### New code

1. **`prim wallet register`** — new case in cli.ts `wallet` switch block (~15 lines of logic)
   - Loads keystore → decrypts → gets private key and account
   - Signs EIP-191 message
   - POSTs to wallet.prim.sh
   - Handles 409 as success

2. **`scripts/smoke-cli.sh`** — shell script (~80 lines)
   - `set -euo pipefail`
   - Testnet guard (`PRIM_NETWORK` must be `eip155:84532`)
   - Step function that logs and checks exit codes
   - Cleanup trap (rm bucket + rm-bucket on exit)
   - Uses `--quiet` flags where available to simplify output parsing
   - Captures values via command substitution: `ADDR=$(prim wallet create --quiet ...)`

### Files modified

| File | Change |
|------|--------|
| `packages/keystore/src/cli.ts` | Add `register` case to wallet switch |
| `scripts/smoke-cli.sh` | New file — CLI smoke test |

### Files NOT modified

- No changes to store/faucet/spawn services
- No changes to x402-middleware
- No new packages

## Risks

- **Faucet rate limiting**: If the test wallet recently dripped, step 3 returns 429. The test must handle this gracefully (check balance, skip if already funded).
- **x402 settlement latency**: On-chain settlement takes a few seconds. If store create-bucket fails with a payment error, it may be a timing issue. One retry with 3s delay is reasonable.
- **Allowlist**: If the VPS wallet service has allowlist enforcement re-enabled, a freshly registered wallet won't be on it. The test either needs admin approval (manual) or must run with allowlist disabled. Document this as a prerequisite.

## Before Closing

- [ ] `prim wallet register --passphrase=test123` succeeds against live wallet.prim.sh
- [ ] `scripts/smoke-cli.sh` passes end-to-end with a fresh `PRIM_HOME`
- [ ] All 9 steps succeed (or faucet gracefully skipped with existing balance)
- [ ] Cleanup runs — no orphaned buckets left on store.prim.sh
- [ ] Script exits 0 on full success, non-zero on any failure
- [ ] Existing tests still pass: `pnpm --filter @primsh/keystore test`
