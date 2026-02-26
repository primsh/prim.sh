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
- Wallet on access allowlist (private beta — if you get 403 \`wallet_not_allowed\`, request access at \`POST https://api.prim.sh/api/access/request\`)

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
   → returns {txHash, amount: "10.00", currency: "USDC", chain: "eip155:84532"}

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
   → returns {txHash, amount: "0.01", currency: "ETH", chain: "eip155:84532"}
\`\`\`

### 3. Check status before dripping (avoid 429s)

\`\`\`
1. faucet_status
   - address: "0xYourAddress"
   → returns:
     {
       address: "0x...",
       usdc: {available: false, retryAfterMs: 4823000},
       eth: {available: true, retryAfterMs: 0}
     }

2. If available is false, compute wait time:
   retryAfterMs / 1000 = seconds to wait
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
- **\`retryAfterMs\` is milliseconds.** Convert to seconds by dividing by 1000.
- **\`txHash\` may be "pending".** The Circle API sometimes returns 204 with no transaction hash. If \`txHash\` is "pending", the transfer was queued but you can't track it on-chain. Wait ~30 seconds and check your balance.
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
};
