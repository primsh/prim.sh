---
name: onboard
version: 1.0.0
primitive: prim.sh
requires: []
---

# prim.sh — Agent Onboarding

Executable runbook. Run each step, check the output, diagnose failures before proceeding.

Network: Base mainnet (`eip155:8453`). Payment: USDC (6 decimals).

---

## Step 1: Verify CLI installed

```sh
prim --version
```

**Expected**: a semver string (e.g. `0.4.0`).

**If `command not found`**: install the CLI:

```sh
curl -fsSL prim.sh/install.sh | sh
export PATH="$HOME/.prim/bin:$PATH"
prim --version
```

If curl returns non-200 (e.g. 403): `dl.prim.sh` is unreachable. The CDN may be down. Stop and report.

---

## Step 2: Check API connectivity

```sh
curl -s -o /dev/null -w '%{http_code}' https://wallet.prim.sh/
```

**Expected**: `200`.

**If non-200**: `wallet.prim.sh` is unreachable. Stop and report the HTTP status.

---

## Step 3: Create wallet

```sh
prim wallet list
```

**If wallets exist**: note the default address. Skip to Step 4.

**If no wallets**:

```sh
prim wallet create
```

**Expected**: `Created wallet: 0x<ADDRESS>`. Capture the address.

---

## Step 4: Redeem invite code

```sh
prim gate invite --code {{CODE}} --wallet <ADDRESS>
```

| Response | Action |
|----------|--------|
| `"status": "redeemed"` | Wallet funded and allowlisted. Proceed to Step 5. |
| `invalid_code` | Code invalid. Check for typos (case-sensitive). Stop. |
| `code_redeemed` | Already used. Request a new code. Stop. |
| `fund_error` | On-chain funding failed. Retry once. If persistent, stop and report. |

---

## Step 5: Verify balance

```sh
prim wallet balance
```

**Expected**: `0x<ADDRESS>  X.XX USDC  [eip155:8453]` with balance > 0.

**If `(unfunded)`**: transaction may be settling. Wait 10 seconds, retry up to 3 times.

**If `0.00 USDC` after retries**: funding failed. Stop and report.

---

## Step 6: Test store.sh

Create a bucket, write an object, read it back, clean up:

```sh
prim store create-bucket --name onboard-test
echo "hello from prim" | prim store put onboard-test hello.txt
prim store get onboard-test hello.txt
```

**Expected**: output contains `hello from prim`.

Clean up:

```sh
prim store rm onboard-test hello.txt
prim store rm-bucket onboard-test
```

| Error | Diagnosis |
|-------|-----------|
| 402 | Wallet unfunded. Check `prim wallet balance`. |
| 403 `wallet_not_allowed` | Invite code not redeemed. Redo Step 4. |

---

## Step 7: Test search.sh

```sh
prim search web "what is x402 payment protocol"
```

**Expected**: search results returned.

---

## Step 8: Submit feedback

No CLI command for feedback. Use curl:

```sh
curl -s -X POST https://feedback.prim.sh/v1/submit \
  -H "Content-Type: application/json" \
  -d '{
    "primitive": "onboard",
    "type": "praise",
    "body": "Onboarding completed successfully"
  }'
```

**Expected**: `{"id": "...", "status": "received"}`.

This step is optional. If it fails, proceed anyway.

---

## Done

Report a summary:

```
Onboarding complete.

  Wallet:  <address>
  Balance: <balance> USDC
  Network: eip155:8453 (Base)
  store:   OK | FAILED
  search:  OK | FAILED

Full API reference: https://prim.sh/llms.txt
```

List any failed steps with the error and suggested fix.
