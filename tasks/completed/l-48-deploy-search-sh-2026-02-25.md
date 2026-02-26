# L-48: Deploy search.sh to VPS

**Date:** 2026-02-25
**Depends on:** SE-1 (done), L-10 (done)
**Blocks:** L-49 (llms.txt update)
**Owner:** Claude + Garric

## Context

search.sh is the 5th launch primitive. It's stateless (no DB, no persistent storage) — a Tavily API proxy gated by x402. Code is complete (SE-1, 30 tests, SE-2 live smoke test passed). The other 4 primitives are already deployed on VPS `157.230.187.207` using the identical pattern: systemd unit + Caddy reverse proxy + env file.

## Goal

`https://search.prim.sh/` returns `{"service":"search.sh","status":"ok"}` and x402 paid endpoints accept payment.

## Changes

### 1. Create systemd unit file

**File:** `deploy/prim/services/prim-search.service`

Same pattern as `prim-store.service`:

```ini
[Unit]
Description=prim.sh search service
After=network.target

[Service]
Type=simple
User=prim
WorkingDirectory=/opt/prim
EnvironmentFile=/etc/prim/search.env
ExecStart=/home/prim/.bun/bin/bun run packages/search/src/index.ts
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### 2. Add search to Caddyfile

**File:** `deploy/prim/Caddyfile`

Append:

```
search.prim.sh {
    reverse_proxy localhost:3005
}
```

### 3. Update setup.sh

**File:** `deploy/prim/setup.sh`

- Add `search` to the `SERVICES` array: `SERVICES=(wallet store faucet spawn search)`
- Add a `search)` case in the env file template section:

```
PORT=3005
PRIM_PAY_TO=0xYOUR_TREASURY_ADDRESS
PRIM_NETWORK=eip155:8453
TAVILY_API_KEY=your_tavily_api_key
```

### 4. Update deploy.sh

**File:** `deploy/prim/deploy.sh`

- Add `search` to the `SERVICES` array: `SERVICES=(wallet store faucet spawn search)`

### 5. Add search health check to smoke-live.ts

**File:** `scripts/smoke-live.ts`

Add a health check step for `https://search.prim.sh/` alongside the existing 4 service health checks. Follow the same pattern used for wallet/store/faucet/spawn.

## Garric manual steps (on VPS)

These are the steps to run on the VPS after the code changes are pushed:

1. **DNS A record** — Add `search.prim.sh` → `157.230.187.207` in Cloudflare DNS (same as wallet/store/faucet/spawn). Proxy status: DNS only (gray cloud) — Caddy handles TLS.

2. **Create env file** on VPS:
   ```bash
   cat > /etc/prim/search.env <<'EOF'
   PORT=3005
   PRIM_PAY_TO=<same as other services>
   PRIM_NETWORK=eip155:84532
   TAVILY_API_KEY=<your Tavily API key>
   EOF
   chmod 640 /etc/prim/search.env
   chown root:prim /etc/prim/search.env
   ```

3. **Deploy** — from VPS:
   ```bash
   cd /opt/prim
   git pull --ff-only
   pnpm install --frozen-lockfile
   pnpm --filter @primsh/x402-middleware build
   cp deploy/prim/services/prim-search.service /etc/systemd/system/
   cp deploy/prim/Caddyfile /etc/caddy/Caddyfile
   systemctl daemon-reload
   systemctl enable prim-search
   systemctl start prim-search
   systemctl reload caddy
   ```

4. **Verify**:
   ```bash
   # Health check
   curl -s https://search.prim.sh/ | jq .
   # Expected: {"service":"search.sh","status":"ok"}

   # Check logs
   journalctl -u prim-search -n 20

   # x402 discovery (should return 402 with payment requirements)
   curl -s -o /dev/null -w "%{http_code}" -X POST https://search.prim.sh/v1/search
   # Expected: 402

   # Full smoke (from VPS, with env vars set)
   bun run scripts/smoke-live.ts --health-only
   ```

## Verification

| Check | Expected |
|-------|----------|
| `curl https://search.prim.sh/` | `{"service":"search.sh","status":"ok"}` |
| `curl -X POST https://search.prim.sh/v1/search` | 402 with payment requirements |
| `journalctl -u prim-search` | No errors, listening on 3005 |
| `systemctl is-active prim-search` | `active` |
| Caddy TLS cert issued for `search.prim.sh` | Valid Let's Encrypt cert |
| `bun run scripts/smoke-live.ts --health-only` | All 5 health checks pass |

## Before closing

- [ ] `prim-search.service` file created and matches existing pattern
- [ ] Caddyfile includes `search.prim.sh` block
- [ ] `setup.sh` and `deploy.sh` include `search` in SERVICES array
- [ ] DNS A record created in Cloudflare
- [ ] `/etc/prim/search.env` created with `TAVILY_API_KEY`
- [ ] `systemctl is-active prim-search` returns `active`
- [ ] `curl https://search.prim.sh/` returns health check
- [ ] POST to `/v1/search` returns 402 (x402 gate working)
- [ ] `smoke-live.ts` includes search health check
