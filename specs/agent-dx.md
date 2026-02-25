# Agent DX Spec — `prim` CLI, Install, Key Management, Multi-Interface

## The Agent Journey

```
1. Discover    → llms.txt, web search, system prompt mentions prim.sh
2. Install     → curl -fsSL prim.sh | sh  (or individual primitive)
3. Wallet      → prim wallet create  (free, generates local keys)
4. Fund        → prim wallet fund  (generates payment link for human)
5. Use         → prim store create-bucket / prim email create-mailbox / ...
6. Backup      → prim wallet backup  (encrypted export, or upload to vault.sh later)
```

## Install Model

### Unified install

```bash
curl -fsSL prim.sh | sh
# Installs `prim` binary to ~/.prim/bin/prim
# Adds to PATH (appends to .bashrc/.zshrc)
# Creates ~/.prim/ config directory
```

`prim` is a Bun-compiled single-file executable. All subcommands are baked in — the binary is small (TypeScript + viem for signing). One install, everything works.

### Individual primitive install

```bash
curl -fsSL wallet.prim.sh/install | sh   # just wallet
curl -fsSL store.prim.sh/install | sh    # just store
curl -fsSL email.prim.sh/install | sh    # just email
```

Each installs the same `prim` binary but auto-runs setup for that primitive only. The install script at each subdomain is a thin wrapper:

```bash
#!/bin/bash
# wallet.prim.sh/install
set -euo pipefail
# Install prim binary if not present
if ! command -v prim &>/dev/null; then
  curl -fsSL prim.sh | sh
fi
# Run wallet-specific setup
prim wallet init
```

Result: the agent gets just what it asked for, but the underlying binary is always the full `prim` CLI. No plugin system, no module downloads — one binary, many subcommands.

**Why this works:** The binary is self-contained (~10-15MB compiled). Individual primitive landing pages tell agents exactly what to install for their use case. An agent that only needs storage runs `curl store.prim.sh/install | sh` and never thinks about wallet, email, etc.

**Why not separate binaries:** Shared infrastructure — config dir, key management, x402 signing — is needed across primitives. One binary avoids duplication and version skew.

### Zero-install fallback: raw HTTP

Every primitive is always accessible via REST. No install required.

```bash
# Agent with curl but no prim CLI
curl -X POST https://wallet.prim.sh/v1/wallets \
  -H "Content-Type: application/json" \
  -d '{"address":"0x...","signature":"0x...","timestamp":"..."}'
```

The CLI is convenience. The API is the substrate.

## Local Directory Structure

```
~/.prim/
├── config.toml           # default wallet, network, preferences
├── bin/
│   └── prim              # compiled binary
└── keys/
    ├── 0xABC123.json     # AES-256-GCM encrypted keystore (like foundry)
    └── 0xDEF456.json     # multiple wallets supported
```

### config.toml

```toml
default_wallet = "0xABC123..."
network = "eip155:8453"          # mainnet default
```

## Key Management

### Create

```bash
prim wallet create
# → Generates secp256k1 keypair
# → Encrypts private key with AES-256-GCM
# → Stores at ~/.prim/keys/0xABC.json
# → Registers address with wallet.prim.sh (EIP-191 signature)
# → Prints: address, balance, funding instructions
```

Encryption key derivation: scrypt from a random device secret generated on first run and stored at `~/.prim/device.key`. This avoids machine-specific identifiers (MAC address, hostname) which are unreliable in containers and VMs — identical MACs across container instances, hostname changes on reimage. The device secret is 32 random bytes, created once, never transmitted. For higher security: `--passphrase` flag derives the encryption key from a user-provided passphrase instead.

### Import

```bash
prim wallet import 0xPRIVATEKEY
prim wallet import keystore.json    # foundry/geth format
```

### List

```bash
prim wallet list
# ADDRESS          BALANCE    DEFAULT
# 0xABC123...      12.50 USDC  *
# 0xDEF456...       0.00 USDC
```

### Rotate

```bash
prim wallet rotate
# → Generates new keypair
# → Registers new address with wallet.prim.sh
# → Prints: "Transfer funds from 0xOLD to 0xNEW, then: prim wallet deactivate 0xOLD"
```

No auto-transfer (non-custodial — prim doesn't move funds). Agent or human transfers manually.

### Export

```bash
prim wallet export 0xABC123
# ⚠ WARNING: Private key will be displayed in plaintext.
# → 0xPRIVATEKEY...
```

## Key Backup

Keys are local. Local means losable.

### Phase 1: Manual export

```bash
prim wallet export --all --format=keystore > backup.json
# Agent saves this wherever it wants (local disk, store.sh, cloud storage, etc.)
```

This is the only backup path until vault.sh exists. Sufficient for early adopters and agents with their own storage.

### Future: vault.sh backup

**Depends on:** vault.sh implementation (not yet planned — no task exists).

```bash
prim wallet backup
# → Encrypts ~/.prim/keys/* with device secret or passphrase
# → Uploads encrypted blob to vault.prim.sh (x402 payment, ~$0.01)
# → Prints: backup ID + restore instructions

prim wallet restore
# → Downloads encrypted blob from vault.prim.sh
# → Decrypts locally
# → Restores to ~/.prim/keys/
```

**Encryption:** Client-side. vault.sh never sees plaintext keys. Agent encrypts before upload. vault.sh stores opaque bytes.

**Bootstrap:** Agent needs a funded wallet to pay vault.sh. Wallet creation is free, so the flow is: create wallet → get funded → back up to vault. If vault.sh wants to offer a free tier (one blob per address), that's a vault.sh product decision, not a wallet concern.

## Funding Flow

### Current: manual

```
Agent: "Please fund 0xABC with USDC on Base"
Human: opens Coinbase, copies address, sends USDC
```

### Better: payment link

```bash
prim wallet fund --amount 5
# → https://pay.prim.sh/0xABC?amount=5&chain=base
# Human clicks → connect wallet → one-click USDC transfer
```

`pay.prim.sh` is a simple web page:
- Shows: recipient address, amount, chain
- Connect wallet button (MetaMask, Coinbase Wallet, WalletConnect)
- One-click approve + transfer
- Confirmation displayed + event emitted

Agent sends this link to human via whatever channel (email.prim.sh, Slack, SMS, terminal output). Human pays in browser. Agent polls `prim wallet balance` until funded.

This is the pay.sh primitive — a payment link generator. Simple enough to ship early.

## Multi-Interface

Once `prim` is installed, the agent chooses its interface:

### CLI (default)

```bash
prim store create-bucket --name research
prim store put bkt_abc notes.txt < ./notes.txt
prim email send --to user@example.com --body "Report attached"
```

### MCP Server

```bash
prim mcp
# Starts MCP server on stdio
# Claude Code / Cursor / any MCP client connects
```

Exposes each primitive as MCP tools:
- `wallet_create`, `wallet_balance`, `wallet_fund`
- `store_create_bucket`, `store_put`, `store_get`, `store_list`
- `email_create_mailbox`, `email_send`, `email_read`
- etc.

Agent runtimes that support MCP (Claude, Cursor, custom) get native tool integration with no glue code.

### OpenAI Function Schemas

```bash
prim openai-tools
# Outputs JSON array of OpenAI function definitions
# Agent framework loads these into its tool config
```

```bash
prim openai-tools --primitives wallet,store
# Only wallet + store schemas
```

### REST (always available, no install needed)

```
POST https://wallet.prim.sh/v1/wallets
PUT  https://store.prim.sh/v1/buckets/:id/objects/*
POST https://email.prim.sh/v1/mailboxes
```

x402 payment headers handled by the agent's own HTTP client.

## Primitive-Specific Init

Each primitive may have setup beyond "install the binary":

| Primitive | `prim <name> init` does |
|-----------|-------------------------|
| wallet | Generate keypair, encrypt, register with wallet.prim.sh |
| store | Nothing (stateless — just needs a funded wallet) |
| email | Nothing (stateless) |
| spawn | Nothing (stateless) |
| vault | Nothing (stateless) |
| domain | Nothing (stateless) |

Most primitives are stateless from the agent's perspective — they just need a wallet address + USDC. Only wallet has local state (keys).

## `.sh` Branding Justification

Every primitive subdomain (`wallet.prim.sh`, `store.prim.sh`, etc.) serves:
1. **Landing page** — human-readable docs at the root
2. **Install script** — `curl -fsSL <primitive>.prim.sh/install | sh`
3. **API** — REST endpoints under `/v1/`
4. **llms.txt** — machine-readable spec at `<primitive>.prim.sh/llms.txt`

The `.sh` in the name is literal: the onboarding IS a shell command. Every primitive can be installed, configured, and used from a shell. The shell is the agent's native environment.

## Implementation Phases

### Phase 1: Core CLI + Wallet
- `prim` binary (Bun-compiled)
- `prim wallet create/list/balance/export/import`
- Local keystore at `~/.prim/keys/`
- Install script at `prim.sh`

### Phase 2: Primitive Subcommands
- `prim store` — bucket + object CRUD
- `prim email` — mailbox + message CRUD
- `prim spawn` — VM lifecycle
- x402 signing built into every subcommand

### Phase 3: MCP + OpenAI
- `prim mcp` — MCP server exposing all primitives as tools
- `prim openai-tools` — function schema export
- Individual primitive MCP servers: `prim mcp --primitives wallet,store`

### Phase 4: Funding + Rotation
- `prim wallet fund` — payment link generation (pay.prim.sh web UI)
- Key rotation flow

### Phase 5: Vault Backup (depends on vault.sh)
- vault.sh primitive must be built first (no task exists yet)
- `prim wallet backup/restore` — encrypted upload/download via vault.prim.sh
- Manual export (`prim wallet export`) remains available from Phase 1

### Phase 6: Individual Primitive Install
- Install scripts at each subdomain
- `curl wallet.prim.sh/install | sh` → installs prim + runs `prim wallet init`
- Landing pages updated with install instructions
