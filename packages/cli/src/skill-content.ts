/**
 * Embedded skill markdown content.
 *
 * These are inlined so `prim skill <name>` works in the compiled binary
 * where the skills/ directory doesn't exist on disk.
 *
 * To regenerate after editing skills/*.md, copy the file contents here.
 */

export const SKILL_CONTENT: Record<string, string> = {
  wallet: `---
name: wallet
version: 1.0.0
primitive: wallet.prim.sh
requires: []
tools:
  - wallet_register
  - wallet_list
  - wallet_get
  - wallet_deactivate
  - wallet_fund_request_create
  - wallet_fund_request_approve
  - wallet_fund_request_deny
  - wallet_policy_get
  - wallet_policy_update
  - wallet_pause
  - wallet_resume
---

# wallet.prim.sh

Wallet registration and spending control for the prim stack. Wallet is the prerequisite for every other primitive — identity and payment both flow through it.

## When to use

Use wallet when you need to:
- Register a new Ethereum address with prim.sh (required before paying for any primitive)
- Check balance or registration status of a wallet
- Request funds from a human operator
- Limit spending on an autonomous sub-agent (spending policy)
- Pause a compromised or runaway wallet

Do NOT use wallet to:
- Generate or store private keys (keys are local, in \`~/.prim/keys/\`)
- Move USDC between wallets (prim is non-custodial; use your own signing tools)
- Check on-chain balances directly (use \`wallet_get\` which reads the prim ledger)

## Prerequisites

None. Registration is free and requires no prior setup. The only inputs needed are:
- An Ethereum address
- An EIP-191 signature proving you control that address

After registration: fund the wallet with USDC on Base (testnet: use \`faucet_usdc\`) before calling any paid primitive.

## Common workflows

### 1. Register a wallet (CLI)

\`\`\`
prim wallet create
\`\`\`

This generates a keypair, encrypts it locally, and calls \`wallet_register\`. Handles EIP-191 signing automatically.

### 2. Register a wallet (MCP tool)

\`\`\`
1. wallet_register
   - address: "0xYourAddress"
   - signature: <EIP-191 sig over "Register <address> with prim.sh at <timestamp>">
   - timestamp: <ISO 8601 UTC, must be within 5 min of server time>
   - label: "my-agent-wallet"  (optional)
\`\`\`

The message to sign is exactly:
\`\`\`
Register <address> with prim.sh at <timestamp>
\`\`\`

### 3. Check wallet status

\`\`\`
1. wallet_get with address "0xYourAddress"
   → returns balance, paused status, spending policy, funded flag
\`\`\`

### 4. Request funds from a human operator

When your wallet is empty and you need USDC to proceed:

\`\`\`
1. wallet_fund_request_create
   - walletAddress: "0xYourAddress"
   - amount: "10.00"
   - reason: "Need USDC to run research queries for task #42"
   → returns fundRequest with id and status: "pending"

2. Notify the human operator with the fund request ID
3. Poll wallet_get until balance > 0, or wallet_fund_request_get until status = "approved"
\`\`\`

On testnet, skip this and use \`faucet_usdc\` instead.

### 5. Set a spending policy on a sub-agent wallet

\`\`\`
1. wallet_policy_update
   - walletAddress: "0xSubAgentAddress"
   - maxPerTx: "1.00"       (cap per transaction)
   - maxPerDay: "10.00"     (daily cap)
   - allowedPrimitives: ["store.prim.sh", "search.prim.sh"]  (optional allowlist)
\`\`\`

### 6. Pause a wallet (emergency stop)

\`\`\`
1. wallet_pause with address "0xTargetAddress"
   → wallet cannot sign x402 payments until resumed
2. wallet_resume with address "0xTargetAddress"
   → restores normal operation
\`\`\`

## Error handling

- \`invalid_request\` → Missing or malformed fields. Check address format (0x + 40 hex chars), timestamp format (ISO 8601 UTC), and that all required fields are present.
- \`forbidden\` → Signature does not match the address, or timestamp is more than 5 minutes old. Re-sign with a fresh timestamp.
- \`duplicate_request\` (409) → Wallet is already registered. Proceed — registration is idempotent from the wallet's perspective; you can use the address immediately.
- \`not_found\` → Wallet address is not registered. Run \`wallet_register\` first.
- \`wallet_paused\` → Wallet is paused. Call \`wallet_resume\` to restore it.
- \`policy_violation\` → A spending policy blocked the payment (maxPerTx or maxPerDay exceeded). Check policy with \`wallet_policy_get\`, then either increase limits or wait for daily reset (\`dailyResetAt\`).
- \`insufficient_balance\` → Not enough USDC. Fund the wallet via \`faucet_usdc\` (testnet) or \`wallet_fund_request_create\` (production).
- \`rate_limited\` (429) → Too many requests. Wait before retrying.
- \`payment_required\` (402) → x402 payment not received. The MCP server handles this automatically; if calling raw HTTP, sign and retry.

## Gotchas

- **Timestamp window:** The \`timestamp\` in registration must be within 5 minutes of server time. Generate it fresh at call time, not cached.
- **409 is not an error:** If \`wallet_register\` returns 409 \`duplicate_request\`, the wallet is registered and usable. Treat this as success.
- **Cursor pagination:** \`wallet_list\` uses cursor-based pagination. Pass the \`cursor\` field from the previous response as the \`after\` param. Null cursor means you've seen all wallets.
- **Balance is prim ledger, not on-chain:** \`balance\` in \`wallet_get\` is the prim-tracked balance, not the raw on-chain ERC-20 balance. They converge via payment settlement.
- **Non-custodial:** prim never holds private keys. If you lose your local keystore (\`~/.prim/keys/\`), you lose access to that wallet. Back up keys with \`prim wallet export\`.
- **Spending policy scope:** \`allowedPrimitives\` is a hostname allowlist. Use full subdomain format: \`"store.prim.sh"\`, not \`"store"\`.

## Related primitives

- **faucet** — Get test USDC before calling any paid primitive (testnet only)
- **store, spawn, search** — All require a registered, funded wallet
- **vault** (planned) — Encrypted key backup for wallet keystores
`,

  store: `---
name: store
version: 1.0.0
primitive: store.prim.sh
requires: [wallet]
tools:
  - store_bucket_create
  - store_bucket_list
  - store_bucket_get
  - store_bucket_delete
  - store_object_put
  - store_object_list
  - store_object_get
  - store_object_delete
  - store_quota_get
  - store_quota_set
  - store_quota_reconcile
---

# store.prim.sh

Object storage for agents. S3-compatible buckets and objects with x402 payment. Stores any binary data — text, JSON, images, archives.

## When to use

Use store when you need to:
- Persist data across agent sessions (search results, reports, configuration)
- Share data between agents (one writes, another reads)
- Cache expensive computation results
- Store files for downstream primitives (e.g. config for a spawned server)
- Implement a simple key-value store using object keys

Do NOT use store for:
- Secret storage (objects are not encrypted at rest beyond what Cloudflare R2 provides)
- Database-style queries (no indexing, no filtering beyond key prefix)
- Real-time messaging (use ring.prim.sh when available)

## Prerequisites

- Registered wallet (\`wallet_register\`)
- Wallet funded with USDC on Base (\`faucet_usdc\` on testnet)
- Wallet on access allowlist (private beta — if you get 403 \`wallet_not_allowed\`, request access at \`POST https://gate.prim.sh/v1/access/request\`)

## Common workflows

### 1. Create a bucket and store an object

\`\`\`
1. store_bucket_create
   - name: "agent-data"
   → returns bucket with id (e.g. "b1a2c3d4-...")

2. store_object_put
   - bucket_id: <id from step 1>
   - key: "results/2026-02-26.json"
   - content: <raw bytes or base64>
   - content_type: "application/json"  (optional, recommended)
   → returns {key, size, etag}

3. store_object_list
   - bucket_id: <id from step 1>
   - prefix: "results/"
   → verify the object appears in the list
\`\`\`

### 2. Retrieve a stored object

\`\`\`
1. store_bucket_list
   → find bucket by name in the list

2. store_object_get
   - bucket_id: <id>
   - key: "results/2026-02-26.json"
   → returns raw bytes with Content-Type header
\`\`\`

### 3. Delete a bucket (must be empty first)

\`\`\`
1. store_object_list with bucket_id
   → get all objects

2. store_object_delete for each object

3. store_bucket_delete with bucket_id
   → bucket removed
\`\`\`

### 4. Check and manage quota

\`\`\`
1. store_quota_get with bucket_id
   → returns {quota_bytes, usage_bytes, usage_pct}

2. store_quota_set with bucket_id
   - quota_bytes: 52428800  (50 MB)
   → updates quota

3. If usage_bytes seems wrong after bulk deletes:
   store_quota_reconcile with bucket_id
   → recomputes actual usage by scanning R2
\`\`\`

### 5. Paginate through many objects

\`\`\`
1. store_object_list
   - bucket_id: <id>
   - limit: 100
   → check is_truncated; if true, pass next_cursor as cursor in next call

2. Repeat until is_truncated is false
\`\`\`

## Error handling

- \`invalid_request\` → Bucket name contains invalid characters (use only alphanumeric, hyphens, underscores) or missing required fields.
- \`bucket_name_taken\` → Another bucket with that name exists for your wallet. Use a different name or list buckets to find the existing one.
- \`bucket_limit_exceeded\` (403) → Wallet has reached the 10-bucket limit. Delete unused buckets first with \`store_bucket_delete\`.
- \`quota_exceeded\` (413) → Upload would exceed the bucket quota (default 100 MB). Check quota with \`store_quota_get\`, increase with \`store_quota_set\`, or delete old objects.
- \`storage_limit_exceeded\` (413) → Upload would exceed the wallet's total 1 GB limit across all buckets. Delete objects from other buckets.
- \`not_found\` (404) → Bucket or object does not exist. Verify the bucket_id and key are correct.
- \`forbidden\` (403) → The bucket belongs to a different wallet. You can only access buckets your wallet owns.
- \`r2_error\` (502) → Upstream Cloudflare R2 storage error. Retry after a short wait.
- \`rate_limited\` (429) → Too many requests. Back off and retry.

## Gotchas

- **Content-Length is required for putObject:** Always set the Content-Length header when uploading. Requests without it return 411. The MCP tool handles this automatically.
- **Buckets must be empty to delete:** Call \`store_object_list\` and delete all objects before \`store_bucket_delete\`. There is no bulk-delete endpoint.
- **Object listing is cursor-based, bucket listing is page-based:** Objects use \`cursor\`/\`next_cursor\`/\`is_truncated\`. Buckets use \`page\`/\`per_page\`/\`total\`.
- **Slashes in keys are pseudo-directories:** Use keys like \`"notes/2026/feb.txt"\` to organize objects hierarchically. Filter by prefix: \`store_object_list\` with \`prefix: "notes/"\` returns only that subtree.
- **ETag is MD5:** The \`etag\` field is an MD5 hash of the object content, useful for deduplication checks.
- **Quota reconciliation costs $0.05:** Only call \`store_quota_reconcile\` when \`usage_bytes\` is visibly wrong — it does a full R2 scan.
- **Limits (beta):** 10 buckets per wallet, 100 MB default per-bucket quota, 1 GB total per wallet.

## Related primitives

- **wallet** — Required. Your wallet identity determines which buckets you own.
- **spawn** — Use store to persist config files, then deploy them to spawned servers.
- **search** — Use store to cache search results for repeated access without re-paying.
`,

  spawn: `---
name: spawn
version: 1.0.0
primitive: spawn.prim.sh
requires: [wallet]
tools:
  - spawn_server_create
  - spawn_server_list
  - spawn_server_get
  - spawn_server_delete
  - spawn_server_start
  - spawn_server_stop
  - spawn_server_reboot
  - spawn_server_resize
  - spawn_server_rebuild
  - spawn_ssh_key_create
  - spawn_ssh_key_list
  - spawn_ssh_key_delete
---

# spawn.prim.sh

VPS provisioning for agents. Create, manage, and destroy virtual machines without a cloud account. Backed by Hetzner. Payment via x402 (deposit model).

## When to use

Use spawn when you need to:
- Run a process that outlives your agent session
- Execute workloads that require more CPU or memory than your current environment
- Host a service accessible over the internet (get a public IP)
- Run untrusted code in isolation
- Provision infrastructure as part of a deployment pipeline

Do NOT use spawn for:
- Short-lived compute (a server has a minimum hourly cost; use spawn only if you need it for minutes or more)
- Database hosting without a backup plan (servers are ephemeral — store important data in store.prim.sh)

## Prerequisites

- Registered wallet with USDC balance (create takes a deposit — typically ~$5 for a small server for a day)
- SSH key registered with \`spawn_ssh_key_create\` BEFORE creating a server (you cannot add SSH keys after creation without rebuilding)
- Wallet on access allowlist (private beta)

## Common workflows

### 1. Register an SSH key and create a server

\`\`\`
1. spawn_ssh_key_create
   - name: "agent-key"
   - public_key: "ssh-ed25519 AAAA..."
   → returns ssh_key with id (e.g. "key_abc123")

2. spawn_server_create
   - name: "my-server"
   - type: "small"
   - image: "ubuntu-24.04"
   - location: "nyc3"
   - ssh_keys: ["key_abc123"]
   - user_data: "#!/bin/bash\\napt-get update -y"  (optional cloud-init)
   → returns {server: {id, status: "initializing", ...}, action, deposit_charged}

3. Poll spawn_server_get with server id every 5–10 seconds
   → wait until status = "running" AND public_net.ipv4.ip is non-null

4. SSH into server using the IP from step 3
\`\`\`

### 2. Stop and resize a server

\`\`\`
1. spawn_server_stop with server id
   → returns {action: {status: "running", ...}}
   → poll spawn_server_get until status = "off"

2. spawn_server_resize
   - id: <server id>
   - type: "medium"
   - upgrade_disk: false   (true = irreversible disk upgrade)
   → returns {action, new_type, deposit_delta}
   → if deposit_delta is positive, additional USDC is charged

3. spawn_server_start with server id
   → poll until status = "running"
\`\`\`

### 3. Rebuild a server (clean OS reinstall)

\`\`\`
1. spawn_server_rebuild
   - id: <server id>
   - image: "debian-12"
   → returns {action, root_password}
   → root_password is non-null only if no SSH keys are configured

WARNING: All data on the server is destroyed. Back up to store.prim.sh first.
\`\`\`

### 4. Delete a server

\`\`\`
1. spawn_server_delete with server id
   → returns {status: "deleted", deposit_refunded: "3.50"}
   → unused deposit is refunded to your wallet balance
\`\`\`

### 5. List all servers

\`\`\`
1. spawn_server_list
   - limit: 20  (default)
   - page: 1
   → returns {servers: [...], meta: {page, per_page, total}}
\`\`\`

## Server lifecycle states

\`\`\`
initializing → running → off → running (after start)
                       → destroying → deleted (after delete)
                       → rebuilding → running (after rebuild)
                       → migrating (provider maintenance, wait)
\`\`\`

Poll \`spawn_server_get\` and check \`status\` until you reach your target state. All operations return an \`action\` object — the action \`status\` field ("running", "success", "error") tracks the in-progress operation, while the server \`status\` field tracks the server's lifecycle.

## Error handling

- \`invalid_request\` → Missing required fields (name, type, image, location are all required). Check field names.
- \`server_limit_exceeded\` (403) → Wallet has reached the 3 concurrent server limit. Delete an existing server first.
- \`type_not_allowed\` → Only \`small\` type is available in beta. Do not request other types.
- \`insufficient_deposit\` → Not enough USDC in wallet to cover the deposit. Fund wallet and retry.
- \`not_found\` (404) → Server or SSH key ID does not exist. Verify the ID.
- \`forbidden\` (403) → Server or key belongs to a different wallet.
- \`provider_error\` (502) → Hetzner API error. Retry after a short wait. If persistent, check \`spawn_server_list\` — the server may have been created despite the error.
- \`not_implemented\` → Feature not yet available.

## Gotchas

- **Register SSH keys before creating servers.** There is no endpoint to add SSH keys to a running server without rebuilding it. Always call \`spawn_ssh_key_create\` first and pass the ID in \`ssh_keys\` during \`spawn_server_create\`.
- **Poll for running status.** \`spawn_server_create\` returns immediately with \`status: "initializing"\`. The IP address is null until the server is running. Always poll \`spawn_server_get\` before trying to connect.
- **Stop before resize.** \`spawn_server_resize\` fails if the server is not stopped. Call \`spawn_server_stop\` and wait for \`status: "off"\` before resizing.
- **Disk upgrades are irreversible.** If you pass \`upgrade_disk: true\` in \`spawn_server_resize\`, the disk cannot be downsized later. Default is false.
- **Rebuild destroys all data.** \`spawn_server_rebuild\` wipes the server. Store critical data in store.prim.sh before rebuilding.
- **Deposit model:** \`spawn_server_create\` charges a deposit (e.g. "$5.00") upfront. When you delete the server, unused deposit is refunded as \`deposit_refunded\`.
- **3 server limit (beta).** You cannot have more than 3 concurrent servers. Delete servers you're done with.
- **Small type only (beta).** 1 vCPU, 1 GB RAM. No other types available yet.

## Related primitives

- **wallet** — Required. Deposit is charged from your wallet balance.
- **store** — Persist config files and data before/after server lifecycle. Use store to back up server state before deleting or rebuilding.
- **faucet** — Get test USDC for testnet server experiments.
`,

  faucet: `---
name: faucet
version: 1.0.0
primitive: faucet.prim.sh
requires: []
tools:
  - faucet_usdc
  - faucet_eth
  - faucet_status
---

# faucet.prim.sh

Testnet token dispenser. Free USDC and ETH on Base Sepolia for testing prim primitives. No wallet registration required. No x402 payment. Rate-limited by address.

## When to use

Use faucet when you need to:
- Get test USDC to fund a wallet before using paid primitives (testnet only)
- Get test ETH for gas (rarely needed — x402 payments use USDC and prim pays gas internally)
- Verify your wallet address is correct before funding production

Do NOT use faucet for:
- Production/mainnet usage (faucet rejects all mainnet requests with 403 \`mainnet_rejected\`)
- Repeated drips within the rate limit window (results in 429)

## Prerequisites

None. Faucet is free and open — no wallet registration, no payment, no allowlist. Only requirement: a valid EVM address (\`0x\` + 40 hex chars).

## Common workflows

### 1. Get test USDC (standard first step)

\`\`\`
1. faucet_status
   - address: "0xYourAddress"
   → check usdc.available is true before dripping

2. If usdc.available is true:
   faucet_usdc
   - address: "0xYourAddress"
   → returns {tx_hash, amount: "10.00", currency: "USDC", chain: "eip155:84532"}

3. Wait for the tx to confirm (~2 seconds on Base Sepolia), then call wallet_get to see updated balance
\`\`\`

### 2. Get test ETH (for gas, rarely needed)

\`\`\`
1. faucet_status
   - address: "0xYourAddress"
   → check eth.available is true

2. If eth.available is true:
   faucet_eth
   - address: "0xYourAddress"
   → returns {tx_hash, amount: "0.01", currency: "ETH", chain: "eip155:84532"}
\`\`\`

### 3. Check status before dripping (avoid 429s)

\`\`\`
1. faucet_status
   - address: "0xYourAddress"
   → returns:
     {
       address: "0x...",
       usdc: {available: false, retry_after_ms: 4823000},
       eth: {available: true, retry_after_ms: 0}
     }

2. If available is false, compute wait time:
   retry_after_ms / 1000 = seconds to wait
   Only retry after that window expires.
\`\`\`

## Error handling

- \`invalid_request\` → Address is missing or not a valid EVM address. Check the format: must be \`0x\` followed by exactly 40 hex characters.
- \`rate_limited\` (429) → Address already received a drip within the rate limit window. Response includes \`error.retryAfter\` (seconds). Call \`faucet_status\` first to check availability before dripping.
- \`mainnet_rejected\` (403) → Faucet only operates on testnet (Base Sepolia). Do not call faucet on mainnet.
- \`faucet_error\` (502) → Both Circle API and treasury wallet failed. Rare. Retry after a few minutes.

## Gotchas

- **Always call \`faucet_status\` before dripping.** It costs nothing and prevents unnecessary 429s. Check \`usdc.available\` and \`eth.available\` before calling \`faucet_usdc\` or \`faucet_eth\`.
- **Rate limits are per-address, per-token:**
  - USDC: 10 USDC per drip, once per 2 hours per address
  - ETH: 0.01 ETH per drip, once per 1 hour per address
- **\`retry_after_ms\` is milliseconds.** Convert to seconds by dividing by 1000.
- **\`tx_hash\` may be "pending".** The Circle API sometimes returns 204 with no transaction hash. If \`tx_hash\` is "pending", the transfer was queued but you can't track it on-chain. Wait ~30 seconds and check your balance.
- **USDC source is either Circle or treasury.** The \`source\` field in the response tells you which backend was used. Both result in the same 10 USDC for you — the difference is only visible in the tx hash origin.
- **No wallet registration needed.** Faucet works for any valid address, even unregistered ones. You still need to register the wallet before using paid primitives.
- **Testnet only.** All tokens are worthless testnet tokens on Base Sepolia (\`eip155:84532\`). Do not confuse with mainnet.

## Related primitives

- **wallet** — Register your wallet after funding it. The address you drip to is the same one you register.
- **store, spawn, search** — All require a funded wallet. Faucet is the first step to funding on testnet.
`,

  search: `---
name: search
version: 1.0.0
primitive: search.prim.sh
requires: [wallet]
tools:
  - search_web
  - search_news
  - search_extract
---

# search.prim.sh

Web search for agents. Search the web, search for news, and extract content from URLs. Payment via x402 (USDC on Base).

## When to use

Use search when you need to:
- Find current information not in your training data
- Get recent news on a topic
- Extract full readable content from a specific URL found in search results
- Research a topic from multiple sources and cache results

### search_web vs search_news

- \`search_web\` — General web search. Best for: documentation, technical answers, product info, anything that isn't time-sensitive.
- \`search_news\` — News-biased search. Results are ordered by recency, biased toward news publishers. Best for: current events, announcements, recent developments (use with \`time_range\`).

Use \`search_extract\` after getting URLs from either search tool to fetch full page content rather than just snippets.

## Prerequisites

- Registered wallet (\`wallet_register\`)
- Wallet funded with USDC (\`faucet_usdc\` on testnet)
- Wallet on access allowlist (private beta)

## Common workflows

### 1. Quick answer with AI summary

\`\`\`
1. search_web
   - query: "Base L2 gas prices"
   - max_results: 5
   - include_answer: true
   → returns {answer: "...", results: [...]}
   → use answer field for a quick summary without reading all results
\`\`\`

### 2. News search for recent coverage

\`\`\`
1. search_news
   - query: "Coinbase Base blockchain"
   - max_results: 10
   - time_range: "week"
   → results ordered by recency, biased toward news sources
\`\`\`

### 3. Deep-dive on a URL from search results

\`\`\`
1. search_web
   - query: "x402 payment protocol spec"
   - max_results: 5
   → pick relevant URLs from results[].url

2. search_extract
   - urls: ["https://docs.example.com/x402"]
   - format: "markdown"
   → returns full page content as markdown
   → check failed[] for any URLs that couldn't be extracted
\`\`\`

### 4. Multi-URL extraction in one call

\`\`\`
1. search_extract
   - urls: ["https://url1.com", "https://url2.com", "https://url3.com"]
   - format: "text"
   → returns results[] (successful) and failed[] (could not extract)
   → request succeeds as long as at least one URL was attempted
\`\`\`

### 5. Domain-filtered search

\`\`\`
1. search_web
   - query: "USDC documentation"
   - include_domains: ["docs.base.org", "coinbase.com"]
   → only returns results from those domains

1. search_web
   - query: "ERC-20 token tutorial"
   - exclude_domains: ["reddit.com", "medium.com"]
   → excludes those domains from results
\`\`\`

### 6. Time-range filtered search

\`\`\`
1. search_web
   - query: "Base L2 updates"
   - time_range: "day"     # "day" | "week" | "month" | "year"
   → only results from the past day
\`\`\`

## Error handling

- \`invalid_request\` → \`query\` is missing or \`urls\` is missing. These are required fields. For \`search_extract\`, \`urls\` must be a string or an array of strings.
- \`rate_limited\` (429) → Too many requests. Response includes \`Retry-After\` header (seconds). Wait and retry.
- \`provider_error\` (502) → Upstream search provider is unavailable. Retry after a brief wait. If persistent, try a simpler query or fewer results.
- \`payment_required\` (402) → x402 payment not completed. The MCP server handles this automatically.

For \`search_extract\`: individual URL failures appear in \`failed[]\`, not as HTTP errors. The overall request returns 200 even if some URLs fail. Always check \`failed[]\` after extraction.

## Gotchas

- **\`failed[]\` is not an error.** \`search_extract\` always returns HTTP 200 as long as the request was valid. Extraction failures (404, paywalled pages, timeouts) appear in \`results[].failed[]\`. Always check this array.
- **\`answer\` is only present when \`include_answer: true\`.** The field is absent (not null) when not requested. This costs more upstream compute — only enable it when you need a summary.
- **\`search_depth: "advanced"\` costs more.** Use \`"basic"\` (default) for most queries. Use \`"advanced"\` only when basic results are insufficient — it queries more sources.
- **\`max_results\` range is 1–20.** Default is 10. You pay per-search, not per-result, so there's no cost savings to reducing results.
- **\`score\` is a relevance float 0–1.** Results are already sorted by score descending. Use score to filter low-relevance results (e.g. discard anything below 0.5).
- **\`published\` may be absent.** Not all pages have parseable publication dates. Handle missing \`published\` field gracefully.
- **URLs from search results may go stale.** For important research, extract content immediately after getting URLs rather than storing URLs for later extraction.
- **\`format: "markdown"\` (default) is better for LLM consumption.** Use \`"text"\` only if you need raw text without markdown formatting.

## Related primitives

- **store** — Cache search results and extracted content to avoid re-paying for the same query.
- **wallet** — Required. Search costs $0.01/search, $0.005/extract.
`,

  email: `---
name: email
version: 1.0.0
primitive: email.prim.sh
requires: [wallet]
tools:
  - email_mailbox_create
  - email_mailbox_list
  - email_mailbox_get
  - email_mailbox_delete
  - email_mailbox_renew
  - email_messages_list
  - email_message_get
  - email_send
  - email_webhook_create
  - email_webhook_list
  - email_webhook_delete
  - email_domain_register
  - email_domain_list
  - email_domain_get
  - email_domain_verify
  - email_domain_delete
---

# email.prim.sh

Disposable and custom-domain email for agents. Receive, send, and manage mailboxes with x402 payment.

## When to use

Use email when you need to:
- Create a temporary inbox to receive a verification code or confirmation link
- Send transactional email from an agent-owned address
- Set up a webhook to react to incoming email in real time
- Use a custom domain (e.g. \`agent@myproject.com\`) for professional outbound mail
- Route inbound messages to an agent via webhook without polling

Do NOT use email for:
- High-volume bulk sending (no bulk send endpoint — each send is a separate x402 payment)
- Long-term archiving (mailboxes expire by default; renew or use no-expiry TTL)
- Spam or unauthorized sending (Stalwart enforces rate limits and DKIM/SPF)

## Prerequisites

- Registered wallet (\`wallet_register\`)
- Wallet funded with USDC on Base (\`faucet_usdc\` on testnet)
- Wallet on access allowlist (private beta — if you get 403 \`wallet_not_allowed\`, request access at \`POST https://gate.prim.sh/v1/access/request\`)

## Common workflows

### 1. Create a temporary inbox and read a verification code

\`\`\`
1. email_mailbox_create
   - username: "tmpagent"  (optional — omit for random)
   → returns mailbox with id and address (e.g. "tmpagent@mail.prim.sh")

2. [trigger the external service to send to that address]

3. email_messages_list
   - id: <mailbox id from step 1>
   → wait for a message to appear; check total > 0

4. email_message_get
   - id: <mailbox id>
   - msgId: <message id from step 3>
   → read textBody or htmlBody for the verification code
\`\`\`

### 2. Send an email from an agent-owned address

\`\`\`
1. email_mailbox_create
   → get mailbox id and address

2. email_send
   - id: <mailbox id>
   - to: "user@example.com"
   - subject: "Report ready"
   - body: "Your weekly report is attached."
   → returns {message_id, status: "sent"}
\`\`\`

### 3. Register a webhook for real-time inbound mail

\`\`\`
1. email_mailbox_create
   → get mailbox id

2. email_webhook_create
   - id: <mailbox id>
   - url: "https://myagent.example.com/hooks/email"
   - secret: "whsec_abc123"
   - events: ["message.received"]
   → webhook fires when mail arrives; verify X-Prim-Signature with your secret

3. email_webhook_list
   - id: <mailbox id>
   → confirm webhook is registered and active
\`\`\`

### 4. Use a custom domain for outbound mail

\`\`\`
1. email_domain_register
   - domain: "myproject.com"
   → returns required_records (MX, TXT/SPF)

2. [Add required_records to your DNS registrar]

3. email_domain_verify
   - id: <domain id>
   → on success: status becomes "verified", dkim_records returned

4. [Add dkim_records to your DNS]

5. email_mailbox_create
   - domain: "myproject.com"
   - username: "agent"
   → creates "agent@myproject.com"
\`\`\`

### 5. Renew a mailbox before it expires

\`\`\`
1. email_mailbox_get
   - id: <mailbox id>
   → check expires_at

2. email_mailbox_renew
   - id: <mailbox id>
   - ttl_ms: 604800000  (7 more days)
   → returns updated expires_at
\`\`\`

## Error handling

- \`invalid_request\` (400) → Missing required fields, invalid username/domain characters, or email format error. Check field values.
- \`username_taken\` (409) → Another mailbox already uses that username on that domain. Omit username to get a random one, or pick a different name.
- \`conflict\` (409) → Domain already registered, or duplicate webhook URL. List existing resources first.
- \`not_found\` (404) → Mailbox, message, webhook, or domain does not exist. Verify IDs are correct.
- \`forbidden\` (403) → Resource belongs to a different wallet. You can only access resources your wallet owns.
- \`expired\` (410) → Mailbox has expired and can no longer receive messages. Renew with \`email_mailbox_renew\` or create a new one.
- \`stalwart_error\` (502) → Upstream Stalwart mail server error. Retry after a short wait.
- \`jmap_error\` (502) → JMAP message submission failed. Retry after a short wait.

## Gotchas

- **Mailboxes expire by default:** The default TTL is 7 days. If you need a permanent inbox, create with a very large \`ttl_ms\` or \`null\`. Renew with \`email_mailbox_renew\` before expiry.
- **Either body or html required for send:** \`email_send\` requires at least one of \`body\` (plain text) or \`html\`. Providing both creates a multipart message.
- **Custom domain verification is two-step:** Register → add DNS records → verify. After verification, add the returned \`dkim_records\` too for DKIM signing. DNS propagation can take minutes to hours.
- **Webhook URLs must be HTTPS:** HTTP webhook URLs are rejected with \`invalid_request\`.
- **Message listing is position-based:** Use \`position\` (zero-based offset) to paginate, not cursor-based like store.sh. \`total\` tells you how many messages exist.
- **One webhook per URL per mailbox:** Registering the same URL twice returns \`conflict\`. Delete the existing webhook first if you need to update the secret or events.
- **Domain deletion warns but does not block:** Deleting a domain with active mailboxes succeeds but returns a \`warning\` field. Those mailboxes stop receiving mail.

## Related primitives

- **wallet** — Required. Your wallet identity determines which mailboxes and domains you own.
- **ring** — For real-time messaging without email (when available).
- **store** — Use store to persist received message content for later analysis.
- **spawn** — Spawn a server to host the webhook endpoint that receives email events.
`,

  mem: `---
name: mem
version: 1.0.0
primitive: mem.prim.sh
requires: [wallet]
tools:
  - mem_collection_create
  - mem_collection_list
  - mem_collection_get
  - mem_collection_delete
  - mem_upsert
  - mem_query
  - mem_cache_put
  - mem_cache_get
  - mem_cache_delete
---

# mem.prim.sh

Vector memory and cache for agents. Semantic search collections backed by Qdrant with automatic text embedding. Lightweight key-value cache for fast ephemeral storage.

## When to use

Use mem when you need to:
- Store and semantically search unstructured text (research notes, document chunks, conversation history)
- Find related content by meaning rather than exact match (RAG, similarity search)
- Cache values within or across agent sessions with optional TTL
- Share semantic memory between agents (one upserts, another queries the same collection)

Do NOT use mem for:
- Exact-match key-value lookups when you know the key (use cache, or store.prim.sh objects)
- Binary or structured data storage (use store.prim.sh)
- Real-time event streaming (use pipe.prim.sh when available)

## Prerequisites

- Registered wallet (\`wallet_register\`)
- Wallet funded with USDC on Base (\`faucet_usdc\` on testnet)

## Common workflows

### 1. Create collection, upsert documents, query

\`\`\`
1. mem_collection_create
   - name: "research-notes"
   → returns collection with id

2. mem_upsert
   - collection_id: <id from step 1>
   - documents: [
       {text: "Transformer models use self-attention mechanisms.", metadata: {source: "paper-A"}},
       {text: "GPT-4 was released in March 2023.", metadata: {source: "blog"}}
     ]
   → returns {upserted: 2, ids: [...]}

3. mem_query
   - collection_id: <id from step 1>
   - text: "How does self-attention work?"
   - top_k: 3
   → returns matches sorted by similarity score
\`\`\`

### 2. Cache put and get

\`\`\`
1. mem_cache_put
   - namespace: "agent-state"
   - key: "last-search"
   - value: {"query": "attention mechanisms", "result_ids": ["..."]}
   - ttl: 3600  (1 hour, or omit for permanent)
   → returns {namespace, key, value, expires_at}

2. mem_cache_get
   - namespace: "agent-state"
   - key: "last-search"
   → returns the stored value
\`\`\`

### 3. List and manage collections

\`\`\`
1. mem_collection_list
   → find collection by name; note: document_count is null in list

2. mem_collection_get with id
   → get live document_count from Qdrant

3. mem_collection_delete with id
   → permanently removes collection and all documents
\`\`\`

### 4. Metadata filtering in queries

\`\`\`
mem_query
  - collection_id: <id>
  - text: "attention mechanisms"
  - top_k: 5
  - filter: {"must": [{"key": "source", "match": {"value": "paper-A"}}]}
→ only returns matches where metadata.source == "paper-A"
\`\`\`

## Error handling

- \`collection_name_taken\` (409) → A collection with that name already exists for your wallet. List collections to find the existing one or choose a different name.
- \`invalid_request\` (400) → Missing required fields or malformed JSON body.
- \`not_found\` (404) → Collection or cache entry does not exist. Verify the ID/namespace/key.
- \`forbidden\` (403) → The collection or namespace belongs to a different wallet.
- \`qdrant_error\` (502) → Upstream Qdrant error. Retry after a short wait.
- \`embedding_error\` (502) → Embedding model failed to process the text. Check that the text is non-empty and not excessively long.
- \`rate_limited\` (429) → Too many requests. Back off and retry.

## Gotchas

- **document_count is null in list responses:** \`mem_collection_list\` omits live counts to avoid N+1 Qdrant calls. Use \`mem_collection_get\` to get the live count for a specific collection.
- **Upsert by ID is replace, not merge:** If you provide a document ID that already exists, the entire document (text + metadata + vector) is replaced.
- **Auto-generated IDs:** If you omit \`id\` in a document, the returned \`ids\` array contains the auto-generated UUIDs in input order — save these if you need to reference the documents later.
- **Cache namespaces are wallet-scoped:** Two different wallets can use the same namespace+key without conflict. Your cache is private to your wallet.
- **Expired cache entries return 404:** After TTL expiry, \`mem_cache_get\` behaves identically to a missing entry.
- **Collection deletion is permanent:** All vectors and metadata are dropped from Qdrant. There is no recovery.
- **Qdrant filter syntax:** The \`filter\` field in \`mem_query\` is passed directly to Qdrant. See Qdrant filter docs for the full schema. Common pattern: \`{"must": [{"key": "field", "match": {"value": "..."}}]}\`.

## Related primitives

- **wallet** — Required. Your wallet identity determines which collections and cache namespaces you own.
- **store** — Use for binary or large structured data. mem is for text embeddings and cache.
- **infer** — Use infer.prim.sh to generate text, then upsert the results into mem for later retrieval.
`,

  domain: `---
name: domain
version: 1.0.0
primitive: domain.prim.sh
requires: [wallet]
tools:
  - domain_search
  - domain_quote
  - domain_register
  - domain_recover
  - domain_status
  - domain_configure_ns
  - domain_zone_create
  - domain_zone_list
  - domain_zone_get
  - domain_zone_delete
  - domain_zone_activate
  - domain_zone_verify
  - domain_zone_mail_setup
  - domain_record_create
  - domain_record_list
  - domain_record_get
  - domain_record_update
  - domain_record_delete
  - domain_record_batch
---

# domain.prim.sh

DNS and domain registration for agents. Register domains via NameSilo, manage Cloudflare DNS zones, and configure records — all with x402 payment (USDC on Base). No account, no GUI, no KYC.

## When to use

Use domain when you need to:
- Register a domain for an agent-owned service
- Manage DNS for a service you deploy (spawn.sh servers, email.sh custom domains)
- Configure custom email domains (MX, SPF, DKIM, DMARC)
- Programmatically create and update DNS records
- Verify DNS propagation before going live

Do NOT use domain for:
- Checking WHOIS information (not supported)
- Domain transfers (not supported)
- Wildcard records via proxied mode (Cloudflare restriction)

## Prerequisites

- Registered wallet (\`wallet_register\`)
- Wallet funded with USDC on Base (\`faucet_usdc\` on testnet)
- Wallet on access allowlist (private beta)

## Common workflows

### 1. Search → Quote → Register domain

\`\`\`
1. domain_search
   - query: "myagent"
   - tlds: "com,xyz,io"
   → returns results[] with available and price for each

2. domain_quote
   - domain: "myagent.com"  (pick an available one)
   - years: 1
   → returns {quote_id, total_cost_usd, expires_at}
     IMPORTANT: quote expires in 15 minutes

3. domain_register
   - quote_id: <id from step 2>
   → pays dynamic amount from quote
   → returns {domain, zone_id, nameservers, ns_configured, recovery_token}
     STORE recovery_token — needed if zone setup partially fails
\`\`\`

### 2. Create zone → Add records → Verify → Activate

\`\`\`
1. domain_zone_create
   - domain: "example.com"
   → returns {zone: {id, name_servers}}
     Configure these nameservers at your registrar before continuing

2. domain_record_create (repeat as needed)
   - zone_id: <id from step 1>
   - type: "A", name: "@", content: "203.0.113.42"
   → returns record with id

3. domain_zone_verify
   - zone_id: <id from step 1>
   → returns {all_propagated, nameservers, records[]}
     Check all_propagated before activating

4. domain_zone_activate
   - zone_id: <id from step 1>
   → triggers Cloudflare NS re-check for faster activation
\`\`\`

### 3. Mail setup (MX, SPF, DMARC, DKIM)

\`\`\`
1. domain_zone_mail_setup
   - zone_id: <zone id>
   - mail_server: "mail.example.com"
   - mail_server_ip: "203.0.113.42"
   - dkim_rsa_selector: "mail"  (optional)
   - dkim_rsa_public_key: "MIIBIjAN..."  (optional)
   → creates A, MX, SPF TXT, DMARC TXT, and DKIM TXT records in one call
   → returns records[] with type and action (created/updated) for each

2. domain_zone_verify
   - zone_id: <zone id>
   → confirm all mail records are propagated
\`\`\`

### 4. Custom email domain (register → mail-setup → email register)

\`\`\`
1. domain_search / domain_quote / domain_register
   → get domain + zone_id + nameservers

2. domain_zone_mail_setup
   - zone_id: <from step 1>
   - mail_server: "mail.prim.sh"
   - mail_server_ip: <prim mail server IP>
   → sets MX, SPF, DMARC records pointing to email.prim.sh

3. email_domain_register (email primitive)
   - domain: <your registered domain>
   → registers domain with Stalwart mail server
   → returns required_records (DKIM keys)

4. domain_record_batch
   - zone_id: <from step 1>
   - create: <DKIM TXT records from step 3>
   → adds DKIM records to your zone

5. domain_zone_verify → confirm propagation
\`\`\`

### 5. Batch DNS changes

\`\`\`
1. domain_record_list with zone_id
   → get current record IDs

2. domain_record_batch
   - zone_id: <id>
   - create: [{type: "CNAME", name: "www", content: "example.com"}]
   - update: [{id: "r...", content: "new-ip"}]
   - delete: [{id: "r..."}]
   → all changes in a single x402 payment
\`\`\`

### 6. Check registration status (post-register polling)

\`\`\`
1. domain_status
   - domain: "myagent.com"
   → returns {all_ready, ns_propagated, zone_active, next_action}
     Poll until all_ready=true (typically 15-60 minutes after registration)
\`\`\`

## Error handling

- \`invalid_request\` → Missing required fields or invalid domain name. Check the message.
- \`domain_taken\` (400) → A zone for this domain already exists. Use \`domain_zone_list\` to find it.
- \`not_found\` (404) → Zone, record, or quote not found. Verify the ID is correct.
- \`forbidden\` (403) → Resource belongs to a different wallet. You can only access zones you own.
- \`quote_expired\` (410) → Quote is older than 15 minutes. Call \`domain_quote\` again for a fresh quote.
- \`registrar_error\` (502) → NameSilo failed to process the registration. Check \`domain_status\` — the domain may still have been registered.
- \`cloudflare_error\` (502) → Cloudflare API error. If this happens during registration, use \`domain_recover\` with the recovery_token.
- \`rate_limited\` (429) → Too many \`domain_zone_activate\` calls. Wait before retrying.

## Gotchas

- **Domain registration is a 2-step flow:** Always \`domain_quote\` first, then \`domain_register\` with the \`quote_id\`. You cannot register without a valid quote.
- **Quotes expire in 15 minutes:** Get the quote immediately before registering. Do not cache quote IDs.
- **Store the recovery_token:** If zone creation or NS configuration fails during registration, the domain is still purchased. Use \`domain_recover\` with the token to retry the setup.
- **NS propagation takes time:** After configuring nameservers at your registrar, expect 15–60 minutes before \`domain_status\` shows \`ns_propagated=true\`. Use \`domain_zone_activate\` to request an early CF check.
- **proxied=true only works for A/AAAA/CNAME:** Setting \`proxied=true\` on MX or TXT records will fail at Cloudflare.
- **\`domain_zone_mail_setup\` is idempotent:** Calling it again updates existing records rather than creating duplicates.
- **batch operations are not atomic:** If one record in a batch fails, others may still succeed. Check the returned arrays.

## Related primitives

- **wallet** — Required. Your wallet identity determines which zones you own.
- **email** — Use \`domain_zone_mail_setup\` to configure DNS for custom email domains with email.prim.sh.
- **spawn** — Register a domain and point A records at spawned VPS instances.
`,

  token: `---
name: token
version: 1.0.0
primitive: token.prim.sh
requires: [wallet]
tools:
  - token_deploy
  - token_list
  - token_get
  - token_mint
  - token_supply
  - token_pool_create
  - token_pool_get
  - token_pool_liquidity_params
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

- Registered wallet (\`wallet_register\`)
- Wallet funded with USDC on Base (\`faucet_usdc\` on testnet)
- Wallet on access allowlist (private beta — if you get 403 \`wallet_not_allowed\`, request access at \`POST https://gate.prim.sh/v1/access/request\`)

## Common workflows

### 1. Deploy → Mint → Check supply

\`\`\`
1. token_deploy
   - name: "MyToken"
   - symbol: "MTK"
   - initialSupply: "1000000000000000000000000"  (1M tokens, 18 decimals)
   - mintable: true
   - maxSupply: "10000000000000000000000000"
   → returns token with id and deploy_status: "pending"

2. token_get
   - id: <id from step 1>
   → poll until deploy_status is "confirmed" and contract_address is set

3. token_mint
   - id: <id from step 1>
   - to: "0xRecipientAddress..."
   - amount: "500000000000000000000"  (500 tokens)
   → returns {tx_hash, to, amount, status: "pending"}

4. token_supply
   - id: <id from step 1>
   → returns live on-chain total_supply
\`\`\`

### 2. Deploy → Create pool → Get pool info

\`\`\`
1. token_deploy
   - name: "MyToken"
   - symbol: "MTK"
   - initialSupply: "1000000000000000000000000"
   → returns token with id

2. token_get (poll until deploy_status: "confirmed")

3. token_pool_create
   - id: <token id>
   - pricePerToken: "0.001"  (0.1 cents per token in USDC)
   - feeTier: 3000  (0.3% — default)
   → returns {pool_address, token0, token1, fee, sqrt_price_x96, tick, tx_hash}

4. token_pool_get
   - id: <token id>
   → verify pool details
\`\`\`

### 3. Full token launch: deploy → mint → create pool → add liquidity

\`\`\`
1. token_deploy (with mintable: true)
   → get token id

2. token_get — poll until deploy_status: "confirmed"

3. token_mint (optional — mint additional tokens to your wallet before creating pool)
   - to: <your wallet address>
   - amount: <amount for liquidity>

4. token_pool_create
   - pricePerToken: "0.001"
   → pool created

5. token_pool_liquidity_params
   - id: <token id>
   - tokenAmount: "1000000000000000000000"  (1000 tokens for liquidity)
   - usdcAmount: "1000000"  ($1 USDC for liquidity)
   → returns:
     - approvals[]: submit each approval first (approve token + USDC to position_manager_address)
     - position_manager_address, tick_lower, tick_upper, amount0_desired, amount1_desired, etc.

6. Submit token approvals on-chain (from the approvals[] array)

7. Call addLiquidity on the position_manager_address with the returned params
   → liquidity position minted as an NFT to your wallet
\`\`\`

## Error handling

- \`invalid_request\` → Missing required field or invalid value. Check name, symbol, initialSupply format.
- \`not_mintable\` (400) → Token was deployed with \`mintable: false\`. Cannot mint additional tokens.
- \`exceeds_max_supply\` (422) → Mint would exceed \`max_supply\`. Check current \`total_minted\` with \`token_get\`.
- \`pool_exists\` (409) → A pool already exists for this token. Use \`token_pool_get\` to retrieve it.
- \`not_found\` (404) → Token ID does not exist. Verify the id is correct.
- \`forbidden\` (403) → The token belongs to a different wallet. You can only manage tokens your wallet owns.
- \`rpc_error\` (502) → Base RPC error. Retry after a short wait.

## Gotchas

- **Deploy is asynchronous:** \`token_deploy\` returns \`deploy_status: "pending"\`. Poll \`token_get\` until \`deploy_status: "confirmed"\` before minting or creating a pool. Attempting to mint against a pending deploy will fail.
- **Token amounts are strings:** All supply values (\`initial_supply\`, \`max_supply\`, \`amount\`, \`total_supply\`) are strings representing raw integer values. For 18 decimal tokens, 1 token = \`"1000000000000000000"\`. Never pass numbers — use strings.
- **USDC has 6 decimals:** When specifying USDC amounts for pool creation or liquidity, use 6-decimal units: $1 USDC = \`"1000000"\`.
- **One pool per token:** You can only create one Uniswap V3 pool per token. \`pool_exists\` (409) means it already exists — use \`token_pool_get\` to find it.
- **Approvals required before addLiquidity:** The \`token_pool_liquidity_params\` response includes an \`approvals[]\` array. Submit each approval transaction on-chain before calling addLiquidity, or the transaction will revert.
- **feeTier options:** Valid fee tiers are 500 (0.05% — stable pairs), 3000 (0.3% — default, general use), 10000 (1% — exotic pairs). An invalid feeTier returns 400.
- **Mint is also asynchronous:** \`token_mint\` returns \`status: "pending"\`. The \`token_supply\` endpoint queries on-chain, so supply will update once the mint transaction is confirmed (~2 seconds on Base).

## Related primitives

- **wallet** — Required. Your wallet identity determines which tokens you own.
- **store** — Use store to persist deployment metadata or mint logs for later reference.
- **faucet** — Fund your wallet with USDC on testnet before deploying.
`,
  onboard: `---
name: onboard
version: 1.0.0
primitive: prim.sh
requires: []
---

# prim.sh — Agent Onboarding

Executable runbook. Run each step, check the output, diagnose failures before proceeding.

Network: Base Sepolia testnet (\`eip155:84532\`). Payment: USDC (6 decimals).

---

## Step 1: Verify CLI installed

\`\`\`sh
prim --version
\`\`\`

**Expected**: a semver string (e.g. \`0.4.0\`).

**If \`command not found\`**: install the CLI:

\`\`\`sh
curl -fsSL prim.sh/install.sh | sh
export PATH="$HOME/.prim/bin:$PATH"
prim --version
\`\`\`

If curl returns non-200 (e.g. 403): \`dl.prim.sh\` is unreachable. The CDN may be down. Stop and report.

---

## Step 2: Check API connectivity

\`\`\`sh
curl -s -o /dev/null -w '%{http_code}' https://wallet.prim.sh/
\`\`\`

**Expected**: \`200\`.

**If non-200**: \`wallet.prim.sh\` is unreachable. Stop and report the HTTP status.

---

## Step 3: Create wallet

\`\`\`sh
prim wallet list
\`\`\`

**If wallets exist**: note the default address. Skip to Step 4.

**If no wallets**:

\`\`\`sh
prim wallet create
\`\`\`

**Expected**: \`Created wallet: 0x<ADDRESS>\`. Capture the address.

---

## Step 4: Fund wallet

### With invite code

\`\`\`sh
prim gate invite --code {{CODE}} --wallet <ADDRESS>
\`\`\`

| Response | Action |
|----------|--------|
| \`"status": "redeemed"\` | Funded. Proceed to Step 5. |
| \`invalid_code\` | Code invalid. Check for typos (case-sensitive). Stop. |
| \`code_redeemed\` | Already used. Fall through to faucet. |
| \`fund_error\` | On-chain failure. Fall through to faucet. |

### Faucet fallback

\`\`\`sh
prim faucet usdc
\`\`\`

| Response | Action |
|----------|--------|
| \`tx_hash\` present | Funded. Proceed. |
| 429 / rate limited | Run \`prim faucet status\`. Report cooldown time. Stop. |

---

## Step 5: Verify balance

\`\`\`sh
prim wallet balance
\`\`\`

**Expected**: \`0x<ADDRESS>  X.XX USDC  [eip155:84532]\` with balance > 0.

**If \`(unfunded)\`**: transaction may be settling. Wait 10 seconds, retry up to 3 times.

**If \`0.00 USDC\` after retries**: funding failed. Stop and report.

---

## Step 6: Test store.sh

Create a bucket, write an object, read it back, clean up:

\`\`\`sh
prim store create-bucket --name onboard-test
echo "hello from prim" | prim store put onboard-test hello.txt
prim store get onboard-test hello.txt
\`\`\`

**Expected**: output contains \`hello from prim\`.

Clean up:

\`\`\`sh
prim store rm onboard-test hello.txt
prim store rm-bucket onboard-test
\`\`\`

| Error | Diagnosis |
|-------|-----------|
| 402 | Wallet unfunded. Run \`prim wallet balance\`, then \`prim faucet usdc\`. |
| 403 \`wallet_not_allowed\` | Invite code not redeemed. Redo Step 4. |

---

## Step 7: Test search.sh

\`\`\`sh
prim search web "what is x402 payment protocol"
\`\`\`

**Expected**: search results returned.

---

## Step 8: Submit feedback

No CLI command for feedback. Use curl:

\`\`\`sh
curl -s -X POST https://feedback.prim.sh/v1/submit \\
  -H "Content-Type: application/json" \\
  -d '{
    "primitive": "onboard",
    "type": "praise",
    "body": "Onboarding completed successfully"
  }'
\`\`\`

**Expected**: \`{"id": "...", "status": "received"}\`.

This step is optional. If it fails, proceed anyway.

---

## Done

Report a summary:

\`\`\`
Onboarding complete.

  Wallet:  <address>
  Balance: <balance> USDC
  Network: eip155:84532 (Base Sepolia)
  store:   OK | FAILED
  search:  OK | FAILED

Full API reference: https://prim.sh/llms.txt
\`\`\`

List any failed steps with the error and suggested fix.
`,
};
