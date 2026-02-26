# OPS-3: Incident Runbook

**Date:** 2026-02-26
**Status:** pending
**Owner:** Claude
**Depends on:** nothing

## Context

Prim runs 11 services on a single DigitalOcean VPS (157.230.187.207). There is no runbook — restart procedures, log locations, and failure modes live scattered across `deploy/`, CLAUDE.md memory, and tribal knowledge. When something breaks at 2am, the operator needs a single document to consult.

## Goal

Create `docs/ops/runbook.md` — a single-file incident reference covering every deployed service. Audience: Garric and any future operator with SSH access.

## Runbook Sections

### 1. Access & Connection

- SSH: `root@157.230.187.207` (key-only, password disabled)
- Repo: `/opt/prim` (owned by `prim` user)
- Env files: `/etc/prim/<service>.env` (root:prim 640)
- Runtime: Bun at `/home/prim/.bun/bin/bun`, pnpm via corepack

### 2. Service Inventory Table

One table, all services. Columns:

| Service | Unit | Port | Endpoint | Env File | Has DB? |
|---------|------|------|----------|----------|---------|

Populate from Caddyfile + systemd units. Full list:

| Service | Unit | Port | Endpoint | Env File | DB |
|---------|------|------|----------|----------|----|
| wallet | prim-wallet | 3001 | wallet.prim.sh | wallet.env | wallet.db (SQLite) |
| store | prim-store | 3002 | store.prim.sh | store.env | store.db (SQLite) |
| faucet | prim-faucet | 3003 | faucet.prim.sh | faucet.env | faucet.db (SQLite) |
| spawn | prim-spawn | 3004 | spawn.prim.sh | spawn.env | spawn.db (SQLite) |
| search | prim-search | 3005 | search.prim.sh | search.env | no |
| email | prim-email | 3006 | email.prim.sh | email.env | no (Stalwart owns data) |
| token | prim-token | 3007 | token.prim.sh | token.env | no |
| mem | prim-mem | 3008 | mem.prim.sh | mem.env | no (Qdrant owns data) |
| domain | prim-domain | 3009 | domain.prim.sh | domain.env | no |
| track | prim-track | 3010 | track.prim.sh | track.env | no |
| site | prim-site | — | prim.sh | — | no |

### 3. Restart Procedures

Cover each escalation level:

- **Single service restart**: `systemctl restart prim-<name>` — when to use, what it does (Bun process killed, systemd respawns, 5s delay on failure)
- **Full redeploy**: `bash /opt/prim/deploy/prim/deploy.sh` — git pull, pnpm install, rebuild x402-middleware, restart all services. When to use (code changes, dependency updates).
- **Caddy reload**: `systemctl reload caddy` — after Caddyfile changes. Note: `reload` not `restart` (zero-downtime).
- **Stalwart (email backend)**: `docker compose restart` from `/opt/prim/deploy/email/`. Separate from prim-email (prim-email is the Hono wrapper; Stalwart is the mail server).
- **Full VPS reboot**: `reboot` — nuclear option. All `WantedBy=multi-user.target` services auto-start. Stalwart container has `restart: unless-stopped`. Verify with healthcheck after boot.

### 4. Log Locations

| What | Command / Path |
|------|---------------|
| Any prim service | `journalctl -u prim-<name> -f` |
| Last 100 lines | `journalctl -u prim-<name> -n 100 --no-pager` |
| Since last boot | `journalctl -u prim-<name> -b` |
| Caddy | `journalctl -u caddy -f` |
| Stalwart | `docker logs -f stalwart` |
| Healthcheck | `/var/log/prim-health.log` |
| Health state | `/var/lib/prim/health/<endpoint>.status` |
| Backup | `/var/log/prim-backup.log` |
| fail2ban | `journalctl -u fail2ban -f` |
| UFW | `/var/log/ufw.log` |

### 5. Common Failures & Fixes

Document each with: symptom, diagnosis command, fix.

**Service won't start / crash loop:**
- Symptom: `systemctl status prim-<name>` shows `activating (auto-restart)` or `failed`
- Diagnose: `journalctl -u prim-<name> -n 50 --no-pager` — look for missing env vars, port conflicts, missing deps
- Fix: check env file exists and is populated (`cat /etc/prim/<name>.env`), check port not occupied (`ss -tlnp | grep :<port>`)

**502 Bad Gateway (Caddy):**
- Symptom: HTTPS endpoint returns 502
- Diagnose: service is down or not listening on expected port
- Fix: restart the service, verify port with `curl -s http://localhost:<port>/`

**TLS cert failure:**
- Symptom: HTTPS cert expired or invalid
- Diagnose: `caddy validate --config /etc/caddy/Caddyfile`, check Caddy logs
- Fix: `systemctl restart caddy` (forces ACME renewal), verify port 80 is open for ACME challenge

**Stalwart not receiving mail:**
- Symptom: inbound SMTP fails
- Diagnose: `nc -zv localhost 25`, `docker ps | grep stalwart`, `docker logs stalwart | tail -50`
- Fix: `cd /opt/prim/deploy/email && docker compose restart`

**SQLite database locked:**
- Symptom: `SQLITE_BUSY` or `database is locked` in logs
- Diagnose: multiple writers or backup running concurrently
- Fix: restart the owning service (`systemctl restart prim-<name>`). If during backup, wait for backup.sh to finish.

**Disk full:**
- Symptom: services fail to write, journald stops logging
- Diagnose: `df -h`, `du -sh /opt/prim/*.db`, `journalctl --disk-usage`
- Fix: `journalctl --vacuum-size=500M`, remove old backup files, consider pruning Docker images (`docker system prune`)

**Bun binary missing or corrupt:**
- Symptom: `ExecStart` fails, "bun: not found"
- Diagnose: `ls -la /home/prim/.bun/bin/bun`
- Fix: `sudo -u prim bash -c 'curl -fsSL https://bun.sh/install | bash'`

**x402 payment failures (agents getting 402 but can't pay):**
- Symptom: all paid endpoints returning 402 even after payment
- Diagnose: check `PRIM_NETWORK` in env files matches chain agents are using, check `PRIM_PAY_TO` is correct
- Fix: verify env vars, restart service after fix

### 6. Backup & Recovery

- Daily SQLite backup via `/opt/prim/deploy/prim/backup.sh` (cron at 03:00 UTC)
- Backs up: wallet.db, store.db, spawn.db, faucet.db to R2 (`prim-backups` bucket)
- 30-day retention, auto-prune
- Stalwart backup: stop container, tar `stalwart-data/`, restart
- Recovery: download from R2 via rclone, replace DB file, restart service

### 7. Escalation

Define severity levels and actions:

| Severity | Criteria | Response |
|----------|----------|----------|
| P0 — All down | VPS unreachable or Caddy down | SSH in, check `systemctl status caddy`, reboot if needed |
| P1 — Wallet down | wallet.sh unresponsive (blocks payments for all services) | Restart immediately, check logs for crash cause |
| P2 — Single service down | One non-wallet service down | Restart within 15 min, not urgent |
| P3 — Degraded | Slow responses, intermittent errors | Investigate logs, schedule fix |

Wallet is the highest-priority service because x402 payment depends on it.

### 8. Quick Reference Card

A condensed cheat sheet at the top of the runbook (commands only, no explanation) for copy-paste during incidents:

```
ssh root@157.230.187.207
systemctl status prim-{wallet,store,faucet,spawn,email,search,token,mem,domain,track}
journalctl -u prim-wallet -n 50 --no-pager
systemctl restart prim-<name>
curl -s http://localhost:3001/   # wallet health
bash /opt/prim/deploy/prim/deploy.sh
```

## Files to create/modify

| File | Change |
|------|--------|
| `docs/ops/runbook.md` | New — the full runbook, all sections above |
| `TASKS.md` | Update OPS-3 status to done |

## Execution guidance

Single file, single agent. No parallelization needed.

The runbook should be written as terse operational reference, not tutorial prose. Favor tables and command blocks over paragraphs. The operator already knows what Bun and systemd are — skip explanations of tools, focus on prim-specific details.

Cross-reference existing files for accuracy:
- Port numbers from `deploy/prim/Caddyfile`
- Service names from `deploy/prim/services/prim-*.service`
- Env file paths from `deploy/prim/generated/*.env.template`
- DB paths from `deploy/prim/backup.sh`
- Healthcheck details from `deploy/prim/healthcheck.sh` and `deploy/prim/monitoring.md`

## Before closing

- [ ] Every deployed service (11 total) appears in the inventory table with correct port
- [ ] Port numbers match Caddyfile (`wallet=3001, store=3002, faucet=3003, spawn=3004, search=3005, email=3006, token=3007, mem=3008, domain=3009, track=3010`)
- [ ] Restart commands are tested mentally against systemd unit structure (User=prim, WorkingDirectory=/opt/prim, EnvironmentFile=/etc/prim/*.env)
- [ ] Stalwart (Docker) restart is documented separately from prim-email (Hono wrapper)
- [ ] Log commands use `journalctl -u` (not file paths) for systemd services
- [ ] Backup section matches `backup.sh` (DB list: wallet, store, spawn, faucet; destination: R2 prim-backups)
- [ ] Quick reference card at top is copy-paste ready (no placeholders that need filling)
