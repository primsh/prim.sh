# SITE-11: Remove prim-site from VPS

**Status**: pending
**Depends**: SITE-10 merged, deployed, and smoke check green on live site

## Context

After SITE-10, Cloudflare Pages owns `prim.sh`. The VPS still runs `prim-site` (Bun server, port 3000) and Caddy still proxies `prim.sh` → `localhost:3000` — both now dead weight. This task removes them.

**Do not start until SITE-10 smoke check passes in production.** Removing prim-site before Pages is confirmed live takes the site down.

## Changes

### 1. `deploy/prim/deploy.sh` — remove prim-site restart block

Remove the block that was added outside the generated SERVICES section:

```bash
# ── 4. Restart site ───────────────────────────────────────────────────────────
log "Restarting prim-site..."
systemctl restart prim-site
log "  prim-site restarted"
```

The generated `SERVICES=(wallet faucet spawn store email search)` block stays — prim-site was never in it and never should be.

### 2. `.github/workflows/deploy.yml` — exclude site/ from VPS rsync

Add `--exclude='site/'` to the rsync step in `deploy-vps` job. VPS no longer needs site files.

### 3. `scripts/sync-vps.sh` — exclude site/ + scope comment

- Add `--exclude='site/'` to the rsync call
- Add a comment near the top clarifying scope:

```bash
# Scope: API services only. Site deploys via GHA → Cloudflare Pages (SITE-10).
# To deploy site changes: push to main and let GHA handle it.
```

### 4. VPS Caddyfile — remove `prim.sh {}` block

The `prim.sh {}` block in `/etc/caddy/Caddyfile` proxies `prim.sh` → `localhost:3000`. Remove it entirely. Pages handles the domain.

Check whether the Caddyfile is managed in-repo (`deploy/prim/Caddyfile`) or edited directly on VPS. If in-repo: edit the file and redeploy. If VPS-only: SSH in and edit directly, then `systemctl reload caddy`.

After removing the block: `ssh root@157.230.187.207 "systemctl reload caddy"`

### 5. VPS — stop, disable, remove prim-site systemd unit

```bash
ssh root@157.230.187.207 "
  systemctl stop prim-site
  systemctl disable prim-site
  rm /etc/systemd/system/prim-site.service
  systemctl daemon-reload
"
```

If a unit file exists in-repo (e.g., `deploy/prim/prim-site.service`), delete it there too so it doesn't get re-synced.

## Files

| File | Change |
|------|--------|
| `deploy/prim/deploy.sh` | Remove prim-site restart block |
| `.github/workflows/deploy.yml` | Add `--exclude='site/'` to rsync in `deploy-vps` job |
| `scripts/sync-vps.sh` | Add `--exclude='site/'`; add scope comment |
| `/etc/caddy/Caddyfile` (VPS) | Remove `prim.sh {}` block; reload caddy |
| `/etc/systemd/system/prim-site.service` (VPS) | Stop, disable, delete |

## Staging note

If a staging environment is added later (see SITE-10 plan), it will have its own Pages deployment and its own VPS. No `prim-site` equivalent should be deployed there either — staging also serves the site from Pages.

## Verification checklist

After all changes are applied:

1. `curl https://prim.sh/` → 200, content matches current site, headers show Cloudflare (no `Server: Caddy`)
2. `curl https://prim.sh/_build_id.txt` → returns a git SHA (proves Pages is live)
3. `ssh root@157.230.187.207 "systemctl status prim-site"` → `Unit prim-site.service could not be found`
4. `ssh root@157.230.187.207 "ss -tlnp | grep :3000"` → no output (port 3000 unbound)
5. Deploy a trivial site change (edit one word in `site/index.html`), push to `main`, confirm GHA deploys it to Pages and smoke check passes

## Before closing

- [ ] SITE-10 smoke check is green in production before touching VPS
- [ ] `deploy.sh` prim-site block removed
- [ ] `--exclude='site/'` added to rsync in both `deploy.yml` and `sync-vps.sh`
- [ ] Scope comment added to `sync-vps.sh`
- [ ] prim-site systemd unit stopped, disabled, and removed on VPS
- [ ] Caddy `prim.sh {}` block removed and Caddy reloaded
- [ ] Port 3000 is unbound on VPS (`ss -tlnp | grep 3000` returns empty)
- [ ] End-to-end test: push a site change, confirm it appears live within ~30s
