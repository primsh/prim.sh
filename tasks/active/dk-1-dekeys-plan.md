# DK-1: keys.sh (DeKeys) — Plan Doc

## Context

Prim can't scale with one human signing up for provider accounts. keys.sh solves the supply bottleneck by letting agents contribute underutilized API keys to a shared pool and earn credits. BitTorrent for API infrastructure.

See: `specs/whitepaper.md` (Sections 4-6), `tasks/research/keys-economy.md`

## Goal

First DeKeys transaction: an agent contributes an API key, another agent's prim call is served through the pool, contributor earns credits.

## Phases

### Phase A: keys.sh primitive (the core service)

Scaffold and implement keys.sh as a new prim at `packages/keys/`.

**Port**: 3014 (next available after track.sh at 3013)

**prim.yaml**: Define routes, pricing, env vars, interfaces. Category: `meta`. ID prefix: `DK`.

**Files to create/modify:**

| File | What |
|------|------|
| `packages/keys/prim.yaml` | Primitive spec |
| `packages/keys/src/index.ts` | Hono app, x402 middleware, route handlers |
| `packages/keys/src/api.ts` | Request/response types |
| `packages/keys/src/service.ts` | Business logic (contribute, proxy, balance, revoke, health) |
| `packages/keys/src/db.ts` | SQLite schema + queries (key store, credit ledger) |
| `packages/keys/src/crypto.ts` | AES-256-GCM encrypt/decrypt for key storage |
| `packages/keys/src/pool.ts` | Key selection logic (round-robin, health-aware) |
| `packages/keys/test/smoke.test.ts` | 5-check contract |
| `packages/keys/package.json` | Workspace member |
| `packages/keys/tsconfig.json` | TypeScript config |
| `packages/keys/vitest.config.ts` | Test runner config |

**Routes:**

| Route | Price | Description |
|-------|-------|-------------|
| `POST /v1/keys/contribute` | Free | Donate an encrypted key with provider + tier metadata |
| `POST /v1/keys/proxy` | $0.001 | Make an upstream API call through the pool. Returns result, never exposes key. |
| `GET /v1/keys/capacity` | Free | Check available pool capacity per provider |
| `GET /v1/keys/balance` | Free | Check earned credits for caller's wallet |
| `DELETE /v1/keys/:id/revoke` | Free | Revoke a contributed key (owner only) |
| `GET /v1/keys/:id/health` | Free | Key health status (rate limit remaining, last call, errors) |

**Pricing rationale:** Contribute, capacity, balance, revoke, and health are free — they're supply-side operations. You want zero friction for contributions. The proxy endpoint charges $0.001 per call (same as search.sh) because it's the consumption side.

**Free routes note:** `POST /v1/keys/contribute` is free but still requires x402 wallet identification — the wallet address in the payment header is the contributor's identity. Use the existing `freeRoutes` pattern with wallet extraction (no payment, but wallet address still parsed from headers).

#### Database schema

Two tables in `keys.db`:

```sql
-- Contributed keys
CREATE TABLE IF NOT EXISTS keys (
  id TEXT PRIMARY KEY,              -- uuid
  owner_wallet TEXT NOT NULL,       -- contributor's wallet address
  provider TEXT NOT NULL,           -- e.g. "tavily", "serper", "openai"
  tier TEXT NOT NULL DEFAULT 'free',-- "free", "basic", "pro", etc.
  encrypted_key TEXT NOT NULL,      -- AES-256-GCM ciphertext (base64)
  iv TEXT NOT NULL,                 -- initialization vector (base64)
  auth_tag TEXT NOT NULL,           -- GCM auth tag (base64)
  rate_limit INTEGER NOT NULL,      -- max calls per month (from tier)
  calls_this_month INTEGER NOT NULL DEFAULT 0,
  last_call_at INTEGER,             -- epoch ms
  last_health_at INTEGER,           -- epoch ms
  health_status TEXT NOT NULL DEFAULT 'unknown', -- "healthy", "degraded", "dead", "unknown"
  health_errors INTEGER NOT NULL DEFAULT 0,      -- consecutive failures
  created_at INTEGER NOT NULL,
  revoked_at INTEGER                -- null if active
);

CREATE INDEX IF NOT EXISTS idx_keys_provider ON keys(provider, revoked_at);
CREATE INDEX IF NOT EXISTS idx_keys_owner ON keys(owner_wallet);

-- Credit ledger
CREATE TABLE IF NOT EXISTS credits (
  id TEXT PRIMARY KEY,              -- uuid
  wallet TEXT NOT NULL,             -- wallet address
  amount_usdc REAL NOT NULL,        -- positive = earned, negative = spent
  reason TEXT NOT NULL,             -- "proxy_served", "redemption", "spend"
  key_id TEXT,                      -- which contributed key earned this (nullable)
  proxy_call_id TEXT,               -- which proxy call (nullable)
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_credits_wallet ON credits(wallet);
```

#### Encryption

Use Node's built-in `crypto` module. Encryption key derived from `KEYS_ENCRYPTION_SECRET` env var (32-byte hex string, generated once during setup).

```
encrypt(plaintext_key, secret) → { ciphertext, iv, auth_tag }
decrypt(ciphertext, iv, auth_tag, secret) → plaintext_key
```

Keys decrypted only inside the proxy handler, held in memory for the duration of the upstream call, then discarded. Never logged, never returned in API responses.

#### Pool selection (`pool.ts`)

Strategy: **health-aware round-robin**

1. Query all active keys for the requested provider (`revoked_at IS NULL AND health_status != 'dead'`)
2. Filter to keys with `calls_this_month < rate_limit`
3. Sort by `last_call_at ASC` (least-recently-used first)
4. Select first key
5. If no keys available, return 503 ("no capacity for provider")

After each proxy call:
- Increment `calls_this_month`
- Update `last_call_at`
- If upstream returns 401/403, increment `health_errors`, set `health_status = 'degraded'` (3+ consecutive errors → `'dead'`)
- If upstream succeeds, reset `health_errors`, set `health_status = 'healthy'`

Monthly reset: cron-like check on each request — if `calls_this_month` was last reset >30 days ago, reset to 0.

#### Proxy handler (`service.ts`)

The proxy handler is the critical path. It must:

1. Accept: `{ provider, method, path, headers?, body? }` — a generic upstream request descriptor
2. Select a key from the pool
3. Decrypt the key
4. Make the upstream HTTP call with the decrypted key injected as the auth header (Bearer token, API key header, query param — depends on provider)
5. Return the upstream response to the caller
6. Credit the key contributor

**Provider auth patterns** (how the decrypted key is injected):

| Provider | Auth method | Header/param |
|----------|-----------|--------------|
| Tavily | API key in body | `{ api_key: "<key>" }` |
| Serper | Bearer token | `Authorization: Bearer <key>` |
| OpenAI | Bearer token | `Authorization: Bearer <key>` |
| Hetzner | Bearer token | `Authorization: Bearer <key>` |
| DigitalOcean | Bearer token | `Authorization: Bearer <key>` |
| NameSilo | Query param | `?version=1&type=xml&key=<key>` |

This means keys.sh needs a **provider config registry** that maps provider names to auth injection strategies. Start with the 3-4 providers used by live prims (Tavily, Hetzner/DO, Circle), expand later.

```typescript
interface ProviderConfig {
  name: string;
  baseUrl: string;
  authStrategy: "bearer" | "api-key-header" | "api-key-body" | "query-param";
  authField: string; // header name, body field, or query param name
}
```

#### Credit accounting

When a proxy call succeeds:

1. Look up the prim price for the equivalent direct call (e.g., search.sh charges $0.001)
2. Credit the key contributor: `INSERT INTO credits (wallet, amount_usdc, reason, key_id, proxy_call_id)`
3. The credit amount = prim price per call (contributor gets the full value of the call their key served)

Credit balance = `SUM(amount_usdc) WHERE wallet = ?`

Credits are internal accounting only in Phase A. USDC redemption comes later.

### Phase B: Wire search.sh to use keys.sh pool

Modify search.sh to optionally route through keys.sh instead of its hardcoded `TAVILY_API_KEY`.

**Files to modify:**

| File | Change |
|------|--------|
| `packages/search/src/service.ts` | Add fallback: if `TAVILY_API_KEY` is not set, call keys.sh proxy |
| `packages/search/src/index.ts` | Pass `KEYS_INTERNAL_URL` to service layer |
| `packages/search/prim.yaml` | Add `KEYS_INTERNAL_URL` to env list |

**Logic:**

```
search request arrives at search.sh
  → if TAVILY_API_KEY is set → use it directly (current behavior, no change)
  → if TAVILY_API_KEY is not set → call keys.sh POST /v1/keys/proxy
    → { provider: "tavily", method: "POST", path: "/search", body: { query, ... } }
    → keys.sh selects a pooled key, makes the Tavily call, returns result
    → search.sh returns result to agent
```

This is a **fallback pattern**, not a replacement. Prims with their own keys use them. Prims without keys fall through to the pool. This means keys.sh can be adopted incrementally — no big-bang migration.

**Dependency direction:** search.sh → keys.sh (search calls keys). keys.sh has no dependency on search.sh. Any prim can call keys.sh.

### Phase C: Deploy to VPS

**Files to create/modify:**

| File | Change |
|------|--------|
| `/etc/prim/keys.env` | Env vars: `KEYS_DB_PATH`, `KEYS_ENCRYPTION_SECRET`, `PRIM_PAY_TO`, `PRIM_NETWORK`, `PRIM_INTERNAL_KEY`, `WALLET_INTERNAL_URL` |
| `/etc/systemd/system/prim-keys.service` | Systemd unit (same pattern as other prims) |
| Caddyfile | Add `keys.prim.sh` reverse proxy block → localhost:3014 |
| DNS | A record: `keys.prim.sh` → 157.230.187.207 |

Deploy sequence:
1. Generate `KEYS_ENCRYPTION_SECRET` (32 random bytes, hex-encoded) on VPS
2. Create env file, systemd unit, Caddy block
3. `pnpm gen` to regenerate all downstream artifacts (MCP tools, CLI commands, OpenAPI spec, landing page card)
4. `systemctl start prim-keys && systemctl enable prim-keys`
5. Health check: `curl https://keys.prim.sh/` → `{ service: "keys.sh", status: "ok" }`

### Phase D: First DeKeys transaction (end-to-end test)

Manual test to validate the full loop:

1. Create a Tavily free-tier API key (already have one)
2. Call `POST keys.prim.sh/v1/keys/contribute` with the key + provider metadata
3. Unset `TAVILY_API_KEY` from search.sh's env, restart search.sh
4. Call `POST search.prim.sh/v1/search` with a query
5. Verify: search.sh falls through to keys.sh → keys.sh proxies to Tavily → result returned
6. Check `GET keys.prim.sh/v1/keys/balance` → contributor wallet has credits

If this works, DeKeys is live.

## What's explicitly NOT in scope

- **Credit-USDC redemption** — credits are internal accounting only. Redemption requires a withdrawal flow with real USDC transfers. Later.
- **vault.sh integration** — encryption uses a local secret, not vault.sh. vault.sh doesn't exist yet.
- **browse.sh for automated signups** — agents can't sign up for new provider accounts yet. Humans still donate keys manually.
- **Reputation scoring (id.sh)** — no sybil resistance. Trust is implicit (contribute a working key, it stays in the pool).
- **Landing page** — generated by `pnpm gen:prims`, no custom design needed for v1.
- **Provider bounties** — no mechanism to incentivize scarce provider keys. Later.
- **Multi-region key pools** — single pool, single VPS. Sharding later.

## Before closing

- [ ] Run `pnpm -r check` (lint + typecheck + tests pass)
- [ ] 5-check smoke test passes for keys.sh
- [ ] search.sh smoke tests still pass with keys.sh fallback path
- [ ] Manual end-to-end: contribute key → proxy call → credit earned
- [ ] `pnpm gen` produces valid MCP tools, CLI commands, OpenAPI spec
- [ ] No hardcoded secrets in source (encryption secret from env only)
- [ ] Verify proxy handler never logs or returns decrypted keys
