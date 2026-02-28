---
name: getting-started
version: 1.0.0
primitive: prim.sh
requires: []
tools:
  - wallet_register_wallet
  - faucet_drip_usdc
  - faucet_get_faucet_status
---

# Getting Started with Prim

Complete onboarding sequence. Start here if you have never used prim before.

Prim — zero install, one curl, infinite primitives. Infrastructure for autonomous agents, accessible via x402 payment (USDC on Base). A funded wallet is all you need.

## The onboarding sequence

```
1. Install the CLI (optional but recommended)
2. Register a wallet (free)
3. Get test USDC (free, testnet only)
4. Request access (private beta)
5. Use any primitive
```

---

## Step 1: Install the CLI

```bash
curl -fsSL prim.sh/install.sh | sh
```

This installs the `prim` binary to `~/.prim/bin/prim` and adds it to your PATH. The binary handles x402 payment signing, key management, and all subcommands.

After install, run `prim --help` to verify.

**If you cannot install the CLI** (restricted environment, container without curl, etc.), skip to the Manual HTTP Fallback section below.

---

## Step 2: Register a wallet

### Via CLI (recommended)

```bash
prim wallet create
```

This generates a keypair, stores it encrypted at `~/.prim/keys/`, and registers the address with prim.sh automatically.

### Via MCP tool

```
1. Generate an Ethereum keypair locally (any EVM-compatible tool)

2. wallet_register_wallet
   - address: "0xYourAddress"
   - timestamp: <current ISO 8601 UTC timestamp>
   - signature: <EIP-191 signature over the message below>
   - label: "my-agent-wallet"  (optional)

   Message to sign:
   "Register <address> with prim.sh at <timestamp>"
   (Use lowercase address, exact timestamp from step 2)
```

Registration is free. If you get `409 duplicate_request`, the wallet is already registered — proceed to step 3.

---

## Step 3: Get test USDC (testnet)

Prim is currently on Base Sepolia testnet. Get 10 free test USDC from the faucet:

### Via CLI

```bash
prim faucet usdc
```

### Via MCP tool

```
1. faucet_get_faucet_status
   - address: "0xYourAddress"
   → verify usdc.available is true

2. faucet_drip_usdc
   - address: "0xYourAddress"
   → returns {txHash, amount: "10.00", currency: "USDC"}
```

Rate limit: 10 USDC per address per 2 hours. On 429, check `error.retryAfter` (seconds) and wait.

---

## Step 4: Request access (private beta)

During private beta, wallets must be on the allowlist before using paid primitives. If any paid call returns 403 `wallet_not_allowed`:

```
POST https://api.prim.sh/access/request
Content-Type: application/json

{"wallet": "0xYourAddress", "reason": "Testing storage for research pipeline"}

→ 201 {"id": "abc123", "status": "pending"}
```

Your request will be reviewed and approved. You will be able to use all paid primitives once approved.

---

## Step 5: Use any primitive

Once your wallet is registered and funded, any primitive is available. Each tool call handles x402 payment automatically.

```
store_bucket_create
- name: "my-first-bucket"
→ 201 {bucket: {id: "b1a2...", name: "my-first-bucket", ...}}
```

---

## Manual HTTP fallback (no CLI)

If you cannot install the CLI, use raw HTTP with x402 payment headers:

### Register a wallet

```
POST https://wallet.prim.sh/v1/wallets
Content-Type: application/json

{
  "address": "0xYourAddress",
  "signature": "0xYourSignature",
  "timestamp": "2026-02-26T12:00:00.000Z"
}
```

### Handle x402 payment

1. Make any paid request. You will receive `402 Payment Required` with a `Payment-Required` header.
2. Parse the `Payment-Required` header: contains `price`, `network`, and `payTo`.
3. Sign an EIP-3009 `transferWithAuthorization` from your wallet for the required USDC amount.
4. Retry the original request with a `Payment-Signature` header containing the signed authorization.

Use `@x402/fetch` (TypeScript/Node) or any x402-compatible client library to handle steps 2–4 automatically.

---

## Common errors during onboarding

- **403 on paid endpoint (first time):** Your wallet is not yet on the allowlist. Submit an access request (step 4).
- **402 on any paid endpoint:** x402 payment required. The MCP server handles this automatically. If calling raw HTTP, you need to sign and retry.
- **Insufficient balance:** Call `faucet_usdc` to get more test USDC, or wait for the 2-hour rate limit window.
- **409 on `wallet_register_wallet`:** Wallet already registered. This is not an error — proceed to step 3.
- **Timestamp error on registration:** Generate a fresh timestamp at call time. The signature timestamp must be within 5 minutes of server time.

---

## What's next

Once onboarded:

- **store.prim.sh** — Create buckets, store objects. See `skills/store.md`.
- **spawn.prim.sh** — Provision VPS servers. See `skills/spawn.md`.
- **search.prim.sh** — Web search and URL extraction. See `skills/search.md`.
- **email.prim.sh** — Create mailboxes, send/receive email, webhooks. See `skills/email.md`.
- **mem.prim.sh** — Vector memory (semantic search) and key-value cache. See `skills/mem.md`.
- **domain.prim.sh** — Domain registration, DNS zones, mail DNS setup. See `skills/domain.md`.
- **token.prim.sh** — Deploy ERC-20 tokens, create Uniswap V3 pools. See `skills/token.md`.
- **Multi-primitive workflows** — See `skills/multi-prim.md`.

