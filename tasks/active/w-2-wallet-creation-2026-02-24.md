# W-2: Implement wallet creation (local keypair generation, encrypted keystore)

**Status:** Plan
**Spec:** `specs/wallet.md`, `tasks/completed/w-1-wallet-api-surface-2026-02-24.md`
**Depends on:** W-1 (API surface — done)
**Blocks:** W-3 (balance), W-4 (send), W-5 (x402 client)

## Context

wallet.sh has route stubs (from W-1) that return 501. This task implements the first real endpoint: `POST /v1/wallets` — the ONE free endpoint across all of AgentStack. An agent calls this to get a Base wallet before it can pay for anything else.

The keystore pattern comes from Railgunner: AES-256-GCM encrypted private keys, master key from env/file, atomic file writes. We port the pattern to TypeScript (Railgunner is JS) and use viem instead of ethers.

## Goals

1. `POST /v1/wallets` generates a real keypair, encrypts + persists the private key, returns the wallet address
2. `GET /v1/wallets` and `GET /v1/wallets/:address` return real wallet data from SQLite
3. `DELETE /v1/wallets/:address` soft-deactivates a wallet
4. Claim token flow works: first paid request with `X-Claim-Token` header claims ownership
5. Encrypted keystore is never readable without the master key
6. All wallet metadata persisted in SQLite via `bun:sqlite`

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Key generation | `viem/accounts` `generatePrivateKey()` + `privateKeyToAccount()` | viem is already a dep. Returns `Hex` private key and `LocalAccount` with `.address`. |
| Encryption | AES-256-GCM via Node `crypto` (available in Bun) | Same as Railgunner. 12-byte IV, 16-byte auth tag, `{ version: 1, iv, tag, ciphertext }` blob. |
| Master key | `WALLET_MASTER_KEY_FILE` or `WALLET_MASTER_KEY` env. 32 bytes (64 hex chars). | Adapted from Railgunner's `RAILGUNNER_MASTER_KEY` pattern. File takes precedence. |
| Storage | SQLite via `bun:sqlite` for metadata. Encrypted key blob stored inline in SQLite (not as separate files). | Simpler than Railgunner's file-per-wallet approach. Single DB file. Bun has native SQLite. |
| Claim token | Random 32-byte hex, prefixed `ctk_`. Stored in `wallets` table, single-use. | From W-1 plan: prevents ownership race condition on free wallet creation. |
| Wallet ID | The `0x...` address itself. No synthetic ID. | Per W-1 design decision. |

### Why inline encrypted blobs (not file-per-wallet)

Railgunner uses one `.enc` file per wallet. This made sense for a CLI tool with local filesystem. wallet.sh is an HTTP service — SQLite is the data store. Storing the encrypted blob as a TEXT column alongside wallet metadata is simpler (one backup = one file), and `bun:sqlite` handles it natively.

The encrypted blob format is identical to Railgunner's: `{ version: 1, iv: base64, tag: base64, ciphertext: base64 }`. It's just stored as a JSON string in a SQLite column instead of a file.

## Database Schema

### File: `packages/wallet/src/db.ts`

```sql
CREATE TABLE IF NOT EXISTS wallets (
  address      TEXT PRIMARY KEY,
  chain        TEXT NOT NULL DEFAULT 'eip155:8453',
  encrypted_key TEXT NOT NULL,
  claim_token  TEXT,
  created_by   TEXT,
  deactivated_at TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wallets_created_by ON wallets(created_by);
CREATE INDEX IF NOT EXISTS idx_wallets_claim_token ON wallets(claim_token);
```

- `encrypted_key`: JSON string `{ version, iv, tag, ciphertext }`
- `claim_token`: `ctk_...` or `NULL` (burned after claim)
- `created_by`: `0x...` wallet address of owner, or `NULL` (unclaimed)
- `deactivated_at`: ISO timestamp or `NULL`
- `created_at` / `updated_at`: Unix ms integers

## Module Structure

```
packages/wallet/src/
├── index.ts          # Hono app (routes + middleware) — MODIFY
├── api.ts            # Types — EXISTS, no changes
├── db.ts             # NEW: SQLite init, prepared statements
├── keystore.ts       # NEW: encrypt/decrypt, master key loading
└── service.ts        # NEW: wallet CRUD business logic
```

### Dependency direction

```
index.ts → service.ts → db.ts
                       → keystore.ts → crypto (node:crypto)
                                      → viem/accounts
```

- `index.ts` imports from `service.ts` only (no direct DB or keystore access)
- `service.ts` imports from `db.ts` and `keystore.ts`
- `keystore.ts` imports from `node:crypto` and `viem/accounts`
- `db.ts` imports from `bun:sqlite`

## Phase 1 — Keystore module

### File: `packages/wallet/src/keystore.ts`

Exports:
- `getMasterKey(): Buffer` — loads from `WALLET_MASTER_KEY_FILE` (read file, trim) or `WALLET_MASTER_KEY` (hex string). Returns 32-byte Buffer. Throws if neither set or key is wrong length.
- `encryptPrivateKey(privateKey: Hex): string` — encrypts with AES-256-GCM, returns JSON string `{ version: 1, iv, tag, ciphertext }`.
- `decryptPrivateKey(blob: string): Hex` — parses JSON blob, decrypts, returns hex private key.
- `generateWallet(): { address: Address, privateKey: Hex }` — calls viem's `generatePrivateKey()` + `privateKeyToAccount()`, returns both.

Key detail: `generatePrivateKey()` from `viem/accounts` uses `crypto.getRandomValues()` internally. No seed phrase / mnemonic — just raw private key. Simpler than Railgunner which stored mnemonics.

**Master key loading decision table:**

| `WALLET_MASTER_KEY_FILE` set? | `WALLET_MASTER_KEY` set? | Result |
|-------------------------------|--------------------------|--------|
| Yes (file exists) | — | Read file, use as key |
| Yes (file missing) | — | Throw `Master key file not found` |
| No | Yes | Use env value as key |
| No | No | Throw `No master key configured` |

**Flag: file takes precedence over env.** This is the same as Railgunner. If both are set, file wins. Don't check env as fallback when file is set but missing — that's a misconfiguration, fail loud.

## Phase 2 — Database module

### File: `packages/wallet/src/db.ts`

Exports:
- `getDb(): Database` — lazy singleton. Creates DB at `WALLET_DB_PATH` env or `./wallet.db`. Runs migrations on first call.
- `insertWallet(wallet: { address, chain, encryptedKey, claimToken }): void`
- `getWalletByAddress(address: string): WalletRow | null`
- `getWalletsByOwner(owner: string, limit: number, after?: string): WalletRow[]`
- `claimWallet(address: string, claimToken: string, owner: string): boolean` — atomic: verify token matches, set `created_by`, null out `claim_token`. Returns false if token doesn't match.
- `deactivateWallet(address: string): void` — sets `deactivated_at`.

`WalletRow` type mirrors the SQLite columns.

Use `db.query()` (prepared + cached) for all statements. Use `db.transaction()` for claim (verify + update atomically).

## Phase 3 — Service module

### File: `packages/wallet/src/service.ts`

Exports:
- `createWallet(chain?: string): WalletCreateResponse` — generates keypair, encrypts, stores in DB, returns response with claim token.
- `listWallets(owner: string, limit: number, after?: string): WalletListResponse` — queries DB by `created_by`.
- `getWallet(address: string, caller: string): WalletDetailResponse` — ownership check, fetches from DB. Balance is `"0.00"` placeholder (W-3 adds live RPC balance).
- `deactivateWallet(address: string, caller: string): WalletDeactivateResponse` — ownership check, soft-delete.
- `claimWallet(address: string, claimToken: string, caller: string): boolean` — delegates to `db.claimWallet()`.

**Ownership check logic:**

| `caller` | `wallet.created_by` | `wallet.deactivated_at` | Result |
|-----------|--------------------|-----------------------|--------|
| any | `NULL` (unclaimed) | `NULL` | 403 (must claim first) |
| `0xOwner` | `0xOwner` | `NULL` | Access granted |
| `0xOther` | `0xOwner` | `NULL` | 403 `forbidden` |
| any | any | not `NULL` | 404 `not_found` (deactivated wallets are invisible) |

**Note: inversion-prone.** Unclaimed wallets return 403, not 404. A 404 would tell the caller the wallet doesn't exist (it does — it's just unclaimed). Test both branches.

## Phase 4 — Wire routes

### File: `packages/wallet/src/index.ts`

Replace the 501 stubs for these routes:
- `POST /v1/wallets` → call `service.createWallet()`, return 201
- `GET /v1/wallets` → call `service.listWallets()`, return 200
- `GET /v1/wallets/:address` → call `service.getWallet()`, return 200
- `DELETE /v1/wallets/:address` → call `service.deactivateWallet()`, return 200

Add claim token middleware: before ownership-gated routes, check for `X-Claim-Token` header. If present, attempt `service.claimWallet()`. This runs after x402 middleware (so `walletAddress` is available).

All other routes remain 501 stubs (W-3/W-4/W-5+ will implement them).

### Claim token middleware flow

```
Request arrives → x402 middleware extracts walletAddress → claim middleware runs
  ↓
Has X-Claim-Token header?
  No → proceed to route handler (normal ownership check)
  Yes → attempt claimWallet(address, token, walletAddress)
    Success → proceed (wallet now owned by caller)
    Fail → 403 { error: { code: "forbidden", message: "Invalid claim token" } }
```

## Phase 5 — Tests

### File: `packages/wallet/test/wallet.test.ts` (NEW)

Set `WALLET_MASTER_KEY` env to a test hex key before imports. Use in-memory SQLite (`:memory:` or temp file).

**Keystore tests:**
```
assert encryptPrivateKey + decryptPrivateKey roundtrip returns original key
assert decryptPrivateKey throws with wrong master key
assert getMasterKey throws when neither env var is set
assert getMasterKey uses file when WALLET_MASTER_KEY_FILE is set
```

**Wallet creation tests:**
```
assert POST /v1/wallets returns 201 with valid address (0x prefix, 42 chars)
assert POST /v1/wallets returns claimToken starting with "ctk_"
assert POST /v1/wallets with no body defaults to eip155:8453
assert two POST /v1/wallets calls return different addresses
```

**Ownership + claim tests:**
```
assert GET /v1/wallets/:address returns 403 when wallet is unclaimed
assert GET /v1/wallets/:address with valid X-Claim-Token + payment returns 200
assert GET /v1/wallets/:address with invalid X-Claim-Token returns 403
assert claim token is single-use (second attempt fails)
assert GET /v1/wallets lists only wallets owned by the caller
```

**Deactivation tests:**
```
assert DELETE /v1/wallets/:address returns 200 with deactivatedAt timestamp
assert GET /v1/wallets/:address returns 404 after deactivation
```

**Encrypted storage tests:**
```
assert wallet row in DB has encrypted_key that is valid JSON with version/iv/tag/ciphertext
assert encrypted_key does NOT contain the raw private key as plaintext
```

### Update existing test file

`packages/wallet/test/api.test.ts` — the existing stub tests should still pass. The `POST /v1/wallets` test will now return a real address instead of `0x000...`. Update the assertion from `address: expect.any(String)` to match a valid Ethereum address pattern.

## Phase 6 — Configuration

### Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `WALLET_MASTER_KEY` | Yes (or _FILE) | — | 64 hex chars (32 bytes) for AES-256-GCM |
| `WALLET_MASTER_KEY_FILE` | Yes (or _KEY) | — | Path to file containing master key |
| `WALLET_DB_PATH` | No | `./wallet.db` | SQLite database path |
| `WALLET_PORT` | No | `3000` | HTTP server port |

For tests: set `WALLET_MASTER_KEY` to a known test value and `WALLET_DB_PATH` to `:memory:`.

## Files changed (summary)

| File | Action |
|------|--------|
| `packages/wallet/src/keystore.ts` | **New** — encrypt/decrypt, master key, key generation |
| `packages/wallet/src/db.ts` | **New** — SQLite schema, prepared statements, CRUD |
| `packages/wallet/src/service.ts` | **New** — wallet business logic |
| `packages/wallet/src/index.ts` | Modify — wire real handlers for 4 routes, add claim middleware |
| `packages/wallet/test/wallet.test.ts` | **New** — keystore + creation + ownership tests |
| `packages/wallet/test/api.test.ts` | Modify — update address assertion for real wallets |
| `packages/wallet/package.json` | Add `@types/bun` dev dep (for `bun:sqlite` types) |

## Before closing

- [ ] Run `pnpm -r check` (lint + typecheck + test pass across all packages)
- [ ] Re-read each goal and locate the code that enforces it
- [ ] For every boolean condition (ownership check, claim token match, master key source), verify both True and False paths are covered by tests
- [ ] Verify encrypted_key column never contains raw private key (test assertion)
- [ ] Verify claim token is single-use (test assertion)
- [ ] Verify deactivated wallets return 404 (test assertion)
- [ ] Verify `POST /v1/wallets` is still free (no x402 payment required)
- [ ] Verify master key loading fails loud when file path is set but file is missing (no silent fallback to env)
