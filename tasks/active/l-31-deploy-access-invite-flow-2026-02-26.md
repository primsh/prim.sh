# L-31: Deploy Access Request + Invite Flow

## Context

Track C of the CLI/Binary/Access plan built the full access request + invite code flow across three components:

1. **CF Worker** (`workers/platform/`) — Hono app with D1 for access requests + invite codes
2. **VPS wallet internal endpoints** — `POST /internal/allowlist/add`, `DELETE /internal/allowlist/:address`, `GET /internal/allowlist/check` on wallet.prim.sh
3. **Dynamic allowlist** — `checkAllowlist` async callback in x402-middleware + SQLite-backed `allowlist-db.ts`

Code is written and tests pass. This task deploys it so an agent hitting the 403 wall can self-service request access.

Supersedes L-17 (invite codes) and L-24 (access request endpoint) — both were implemented as part of the CF Worker rather than directly on wallet.prim.sh as originally scoped.

## Goal

After deployment, this flow works:
1. Agent hits store.prim.sh → gets 403 `wallet_not_allowed` with `access_url`
2. Agent POSTs to `prim.sh/api/access/request` with `{ wallet, reason }`
3. Admin runs `prim admin approve <id>` (or via API)
4. CF Worker calls `wallet.prim.sh/internal/allowlist/add`
5. Agent retries → gets past allowlist → proceeds to x402 payment

## Phases

### Phase 1: Generate secrets

Generate two secrets:
- `PRIM_ADMIN_KEY` — authenticates admin API calls to CF Worker
- `PRIM_INTERNAL_KEY` — authenticates CF Worker → VPS internal calls

Store both in `~/.config/secrets/env` (existing secrets location).

### Phase 2: Deploy CF Worker

**Directory:** `workers/platform/`

| Step | Command | Notes |
|------|---------|-------|
| 1 | `cd workers/platform && npm install` | Install hono + wrangler |
| 2 | `npx wrangler d1 create prim-platform` | Creates D1 database, outputs `database_id` |
| 3 | Update `wrangler.toml` `database_id` field | Paste the ID from step 2 |
| 4 | `npx wrangler d1 execute prim-platform --file=schema.sql` | Creates `access_requests` + `invite_codes` tables |
| 5 | `npx wrangler secret put PRIM_ADMIN_KEY` | Paste admin key |
| 6 | `npx wrangler secret put PRIM_INTERNAL_KEY` | Paste internal key |
| 7 | `npx wrangler deploy` | Deploys worker |
| 8 | Configure route `prim.sh/api/*` | Either via wrangler.toml `routes` or CF dashboard |

The worker needs a route on the `prim.sh` domain. Since `prim.sh` is on CF Pages (`prim-sh` project), the Worker route must be more specific (`/api/*`) to avoid conflicting with Pages.

**wrangler.toml route config** (add after `[vars]`):
```toml
[[routes]]
pattern = "prim.sh/api/*"
zone_name = "prim.sh"
```

### Phase 3: Redeploy VPS wallet service

**SSH target:** `root@<VPS_IP>`

| Step | What | How |
|------|------|-----|
| 1 | rsync code | `rsync -avz --exclude node_modules --exclude .git ./ root@<VPS_IP>:/opt/prim/` |
| 2 | Install deps | `ssh root@<VPS_IP> 'cd /opt/prim && pnpm install'` |
| 3 | Rebuild x402-middleware | `ssh ... 'cd /opt/prim && pnpm --filter @primsh/x402-middleware build'` |
| 4 | Add env vars to wallet | Append to `/etc/prim/wallet.env`: `PRIM_INTERNAL_KEY=<key>` and `PRIM_ALLOWLIST_DB=/var/lib/prim/allowlist.db` |
| 5 | Create data dir | `ssh ... 'mkdir -p /var/lib/prim'` |
| 6 | Seed existing wallets | Migrate current `PRIM_ALLOWLIST` env addresses into SQLite DB |
| 7 | Restart wallet | `ssh ... 'systemctl restart prim-wallet'` |
| 8 | Restart other services | `systemctl restart prim-store prim-spawn prim-faucet` (they also use the new middleware with `checkAllowlist`) |

**Important:** The other services (store, spawn) currently use the static `PRIM_ALLOWLIST` env var. After this deploy, they should also wire up `checkAllowlist` from the shared SQLite DB — OR keep using the static allowlist since only wallet.prim.sh has the internal endpoints. For Phase 1, only wallet.prim.sh uses the dynamic allowlist. Store/spawn continue using `PRIM_ALLOWLIST` env var. Unify later.

**Wait** — actually store.prim.sh and spawn.prim.sh don't have `checkAllowlist` wired in their index.ts. Only wallet.prim.sh was modified. The static `PRIM_ALLOWLIST` env var still works for all services. The dynamic DB just adds a second check path for wallet.prim.sh.

To make the dynamic allowlist work for store/spawn too, we need to either:
- (a) Wire `checkAllowlist` into store + spawn index.ts (same pattern as wallet)
- (b) Keep `PRIM_ALLOWLIST` env var in sync manually
- (c) Have the approve flow update the env var + restart services

**Decision:** Option (a) — wire `checkAllowlist` into store + spawn. Small change: import `createAllowlistChecker` from `@primsh/x402-middleware/allowlist-db`, pass to middleware options. Same pattern as wallet.prim.sh line 41+74. Do this during the rsync+deploy step.

### Phase 4: Wire store + spawn to dynamic allowlist

Modify `packages/store/src/index.ts` and `packages/spawn/src/index.ts`:

```ts
import { createAllowlistChecker } from "@primsh/x402-middleware/allowlist-db";
const ALLOWLIST_DB_PATH = process.env.PRIM_ALLOWLIST_DB ?? "/var/lib/prim/allowlist.db";
const allowlistChecker = createAllowlistChecker(ALLOWLIST_DB_PATH);

// In middleware options:
createAgentStackMiddleware({
  // ...existing options...
  checkAllowlist: allowlistChecker,
}, routes);
```

Add `PRIM_ALLOWLIST_DB=/var/lib/prim/allowlist.db` to `/etc/prim/store.env` and `/etc/prim/spawn.env`.

### Phase 5: Seed allowlist DB + migrate

Move existing `PRIM_ALLOWLIST` addresses into the SQLite DB:

```bash
# On VPS, after wallet service has started (creates the DB):
export PRIM_INTERNAL_KEY=<key>
# Add test wallet
curl -X POST http://localhost:3001/internal/allowlist/add \
  -H "X-Internal-Key: $PRIM_INTERNAL_KEY" \
  -H "Content-Type: application/json" \
  -d '{"address":"0x09D896446fBd3299Fa8d7898001b086E56f642B5","added_by":"admin","note":"test wallet"}'
# Add Asher's wallet
curl -X POST http://localhost:3001/internal/allowlist/add \
  -H "X-Internal-Key: $PRIM_INTERNAL_KEY" \
  -H "Content-Type: application/json" \
  -d '{"address":"0x63268dC14Be27957FF33C2f6494716C5dBFeCFc9","added_by":"admin","note":"asher test wallet"}'
```

Once DB is seeded, `PRIM_ALLOWLIST` env var can be removed from all service env files (the dynamic check supersedes it).

### Phase 6: Verify

| Check | Command | Expected |
|-------|---------|----------|
| CF Worker health | `curl prim.sh/api/access/request -d '{"wallet":"0xtest"}' -H 'Content-Type: application/json'` | 201 with `{ id, status: "pending" }` |
| Admin list | `curl prim.sh/api/access/requests -H 'X-Admin-Key: <key>'` | 200 with pending requests |
| VPS internal check | `curl localhost:3001/internal/allowlist/check?address=0x09D896446fBd3299Fa8d7898001b086E56f642B5 -H 'X-Internal-Key: <key>'` (from VPS) | `{ allowed: true }` |
| Full flow | Agent submits request → admin approves → agent retries store.prim.sh → 402 (not 403) | |
| Asher retest | Asher creates bucket on store.prim.sh with allowlisted wallet | 201 or 402 (payment, not 403) |

### Phase 7: Update prim.sh/access landing page (L-25)

Create `site/access/index.html` — landing page explaining how to request access. Both human-readable form and API docs for agents. This is L-25 (separate task, can be done after deployment).

## Rollback

If anything breaks:
- CF Worker: `wrangler rollback` or delete the route
- VPS: restore env files from backup, `systemctl restart prim-*`
- Dynamic allowlist is additive — static `PRIM_ALLOWLIST` env var still works as fallback

## Before closing
- [ ] CF Worker deployed and responding at `prim.sh/api/*`
- [ ] D1 tables created (`access_requests`, `invite_codes`)
- [ ] Secrets set on CF Worker (`PRIM_ADMIN_KEY`, `PRIM_INTERNAL_KEY`)
- [ ] VPS wallet redeployed with internal endpoints
- [ ] Store + spawn wired to dynamic allowlist
- [ ] Existing wallets seeded into allowlist DB
- [ ] Full flow verified: request → approve → access granted
- [ ] Asher can create a storage bucket
