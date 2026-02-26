# L-35: Agent access request e2e test

## Context

The access request flow is deployed (L-31 done):
- **wallet.prim.sh** — SQLite allowlist via `checkAllowlist`, 403 with `access_url` for blocked wallets
- **api.prim.sh** — CF Worker handling access requests (D1 DB), admin approve/deny
- **VPS internal API** — `POST /internal/allowlist/add` bridges CF Worker → wallet SQLite

Only wallet.prim.sh enforces the allowlist. Store/faucet/spawn are open (no `checkAllowlist` wired). The test must exercise wallet.sh paid endpoints.

## Goal

A single script that proves the full autonomous access flow works end-to-end against live services. Fresh wallet, no pre-seeding, no manual steps (admin approval is automated via admin key in the script).

## Flow

```
┌─ Step 1: Generate fresh wallet keypair (random, never seen before)
│
├─ Step 2: Register wallet at wallet.prim.sh (POST /v1/wallets, free, EIP-191)
│
├─ Step 3: Get testnet USDC from faucet.prim.sh (POST /v1/faucet/usdc, free, open)
│     └─ 429 rate limit is OK — skip and rely on manual funding note
│
├─ Step 4: First attempt — hit paid wallet endpoint (e.g. GET /v1/wallets)
│     └─ createPrimFetch sends request → 402 → signs → retries with Payment-Signature
│     └─ Middleware extracts wallet → checks allowlist → NOT found → 403
│     └─ Assert: status === 403
│     └─ Assert: body.access_url exists
│     └─ Assert: body.error === "wallet_not_allowed"
│
├─ Step 5: Agent discovers access_url from 403 body → POSTs access request
│     └─ POST {access_url} with { wallet, reason: "smoke test" }
│     └─ Assert: status === 201
│     └─ Assert: body.status === "pending"
│     └─ Capture: request ID
│
├─ Step 6: Admin approves the request (automated)
│     └─ POST api.prim.sh/api/access/requests/{id}/approve (x-admin-key header)
│     └─ Assert: status === 200
│     └─ Assert: body.status === "approved"
│
├─ Step 7: Retry paid wallet endpoint
│     └─ Same request as Step 4
│     └─ createPrimFetch sends → 402 → signs → retries
│     └─ Middleware checks allowlist → found → proceeds to x402 settlement
│     └─ Assert: status === 200
│
└─ Step 8: Cleanup — remove wallet from allowlist
      └─ DELETE wallet.prim.sh/internal/allowlist/{address} (X-Internal-Key header)
      └─ Best-effort (don't fail test on cleanup error)
```

## Files

| File | What |
|------|------|
| `scripts/smoke-access.ts` | New test script (follows smoke-live.ts pattern) |

## Design

### Script location & pattern

`scripts/smoke-access.ts` — same `step()` helper, same summary reporter as `smoke-live.ts`.

### Env vars required

| Var | Source | Purpose |
|-----|--------|---------|
| `PRIM_NETWORK` | `scripts/.env.testnet` | Must be `eip155:84532` (testnet guard) |
| `PRIM_ADMIN_KEY` | `~/.config/secrets/env` or manual | Admin auth for approve endpoint |
| `PRIM_INTERNAL_KEY` | `~/.config/secrets/env` or manual | Internal auth for allowlist cleanup |

**No `AGENT_PRIVATE_KEY`** — the script generates a fresh random wallet each run. This is the point: prove a brand-new wallet can navigate the access flow.

### Fresh wallet generation

```ts
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);
```

### Paid endpoint to test

`GET /v1/wallets` — cheapest paid wallet endpoint ($0.001). The 402→sign→403 flow exercises the full path without spending more than necessary.

### Faucet step

The agent needs USDC for the x402 payment in Step 7 to settle on-chain. Call `POST /v1/faucet/usdc` with the fresh wallet address. If rate-limited (429), print a warning — the test will fail at Step 7 but the access flow (Steps 4-6) still validates. Alternatively, the test can transfer from the test wallet if `AGENT_PRIVATE_KEY` is set.

### 403 detection

`createPrimFetch` handles 402 internally and retries with payment. If the retry gets 403, it returns the 403 to the caller. The test must NOT use `createPrimFetch` for Step 4 — it needs to see the raw 403 with `access_url`.

Two options:
1. **Use raw fetch for Step 4** — manually do the 402→sign→retry flow to see the 403
2. **Use createPrimFetch but check the returned response** — `createPrimFetch` returns whatever the retry gets, including 403

Option 2 is simpler. `createPrimFetch` returns the retry response as-is. If the retry gets 403, the caller sees 403. Check `res.status === 403` and parse body.

**Decision: Option 2.** Use `createPrimFetch` for both Step 4 and Step 7. Step 4 expects 403, Step 7 expects 200.

### Admin approval automation

The script calls the admin approve endpoint directly:

```
POST https://api.prim.sh/api/access/requests/{id}/approve
Headers: { "x-admin-key": PRIM_ADMIN_KEY }
```

This requires `PRIM_ADMIN_KEY` to be set. If not set, the script prints an error and exits (admin approval is not optional for this test).

### Cleanup

After all steps (pass or fail), remove the test wallet from the allowlist via internal API:

```
DELETE https://wallet.prim.sh/internal/allowlist/{address}
Headers: { "X-Internal-Key": PRIM_INTERNAL_KEY }
```

Best-effort — don't fail the test if cleanup fails. Log a warning so stale entries can be cleaned manually.

### Edge case: faucet funding

The fresh wallet has no USDC. The faucet gives 1 USDC per drip. Two scenarios:

| Faucet result | Effect on test |
|---------------|----------------|
| 200 (dripped) | Step 7 will succeed (agent can pay) |
| 429 (rate-limited) | Step 7 will fail (no USDC for settlement). Steps 1-6 still validate access flow. |

If `AGENT_PRIVATE_KEY` is also set, the script could fund the fresh wallet directly via a USDC transfer. But that adds complexity. Simpler: just document that the faucet must not be rate-limited. Running the test once per 2 hours is fine.

### Execution

```bash
# From VPS (local DNS can't resolve *.prim.sh)
ssh root@157.230.187.207
export PRIM_NETWORK=eip155:84532 \
  PRIM_ADMIN_KEY=<admin-key> \
  PRIM_INTERNAL_KEY=<internal-key>
cd /opt/prim && bun run scripts/smoke-access.ts
```

## Script structure (high-level)

```
#!/usr/bin/env bun

imports: viem/accounts, @primsh/x402-client

Config:
  WALLET_URL, FAUCET_URL, API_URL = "https://api.prim.sh"
  Preflight: require PRIM_NETWORK=84532, PRIM_ADMIN_KEY, PRIM_INTERNAL_KEY

step("Generate fresh wallet")
  → generatePrivateKey() + privateKeyToAccount()
  → print address

step("Register wallet (EIP-191)")
  → sign message, POST /v1/wallets
  → assert 201

step("Faucet USDC drip")
  → POST faucet.prim.sh/v1/faucet/usdc { address }
  → 200 or 429 (warn, don't fail)

step("Hit paid endpoint → expect 403")
  → primFetch(GET wallet.prim.sh/v1/wallets)
  → assert status === 403
  → parse body, assert access_url exists
  → capture access_url

step("Submit access request")
  → POST {access_url} { wallet, reason: "e2e smoke test" }
  → assert 201, capture id

step("Admin approve")
  → POST api.prim.sh/api/access/requests/{id}/approve (x-admin-key)
  → assert 200, body.status === "approved"

step("Retry paid endpoint → expect 200")
  → primFetch(GET wallet.prim.sh/v1/wallets)
  → assert status === 200

Cleanup:
  → DELETE wallet.prim.sh/internal/allowlist/{address} (X-Internal-Key)
  → best-effort

Summary: N passed, M failed
```

## Before closing

- [ ] Run `bun run scripts/smoke-access.ts` on VPS with valid env vars
- [ ] Verify Step 4 returns exactly 403 (not 402 or 500)
- [ ] Verify Step 7 returns exactly 200 (not 402 or 403)
- [ ] Verify cleanup removes the test wallet from allowlist
- [ ] Confirm no secrets are hardcoded in the script (all from env vars)
- [ ] Test with missing `PRIM_ADMIN_KEY` — should exit with clear error, not crash
