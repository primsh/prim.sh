# Prim Incident Runbook

## Quick Reference Card

```bash
ssh root@<VPS_IP>

# Status — all services
systemctl status prim-{wallet,store,faucet,spawn,search,email,token,mem,domain,track,site}

# Logs — last 50 lines
journalctl -u prim-wallet -n 50 --no-pager

# Restart single service
systemctl restart prim-<name>

# Health check — individual
curl -s http://localhost:3001/   # wallet
curl -s http://localhost:3002/   # store
curl -s http://localhost:3003/   # faucet
curl -s http://localhost:3004/   # spawn
curl -s http://localhost:3005/   # search
curl -s http://localhost:3006/   # email
curl -s http://localhost:3007/   # token
curl -s http://localhost:3008/   # mem
curl -s http://localhost:3009/   # domain
curl -s http://localhost:3010/   # track

# Full redeploy
bash /opt/prim/deploy/prim/deploy.sh

# Caddy reload (zero-downtime)
systemctl reload caddy

# Stalwart restart
cd /opt/prim/deploy/email && docker compose restart
```

---

## 1. Access & Connection

| Item | Value |
|------|-------|
| SSH | `root@<VPS_IP>` (key-only, password disabled) |
| OS | Ubuntu 24.04 |
| Repo | `/opt/prim` (owned by `prim` user) |
| Env files | `/etc/prim/<service>.env` (root:prim 640) |
| Bun | `/home/prim/.bun/bin/bun` |
| pnpm | via corepack (Node 22) |
| Firewall | UFW: 22, 80, 443, 25, 465, 587, 993 |

---

## 2. Service Inventory

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
| site | prim-site | -- | prim.sh | -- | no |

All prim-* services run as `User=prim`, `WorkingDirectory=/opt/prim`, `Restart=on-failure`, `RestartSec=5`, `WantedBy=multi-user.target`.

ExecStart pattern: `/home/prim/.bun/bin/bun run packages/<name>/src/index.ts`
Exception: prim-site runs `/home/prim/.bun/bin/bun run site/serve.ts` (no EnvironmentFile).

### Related infrastructure

| Component | How it runs | Config location |
|-----------|-------------|-----------------|
| Caddy | systemd (`caddy`) | `/etc/caddy/Caddyfile` |
| Stalwart Mail | Docker (`stalwart` container) | `/opt/prim/deploy/email/docker-compose.yml` |
| Stalwart data | Docker volume | `/opt/prim/deploy/email/stalwart-data/` |
| Healthcheck | cron (every 5 min) | `/opt/prim/healthcheck.sh` |
| Backup | cron (daily 03:00 UTC) | `/opt/prim/deploy/prim/backup.sh` |
| fail2ban | systemd | `/etc/fail2ban/jail.d/prim-ssh.conf` |

Stalwart exposes ports: 25 (SMTP), 465 (SMTPS), 587 (submission), 993 (IMAPS), 127.0.0.1:8080 (HTTP API).
Caddy proxies `mail.prim.sh` to `localhost:8080` (Stalwart HTTP).

---

## 3. Restart Procedures

### Level 1: Single service restart

```bash
systemctl restart prim-<name>
```

When: service crashed, hung, or returning errors after a config change.
What happens: Bun process killed, systemd respawns it. 5s delay on failure before retry.

### Level 2: Full redeploy

```bash
bash /opt/prim/deploy/prim/deploy.sh
```

When: code changes pushed to main, dependency updates, x402-middleware changes.
What it does:
1. `git pull --ff-only`
2. `pnpm install --frozen-lockfile`
3. Rebuilds `@primsh/x402-middleware`
4. Restarts services: wallet, faucet, spawn, store, email, search

**Note:** deploy.sh currently only restarts the original 6 services. Token, mem, domain, track must be restarted manually if affected:
```bash
systemctl restart prim-token prim-mem prim-domain prim-track
```

### Level 3: Caddy reload

```bash
systemctl reload caddy
```

When: Caddyfile changes. Use `reload` not `restart` — zero-downtime TLS rotation.

Validate first:
```bash
caddy validate --config /etc/caddy/Caddyfile
```

### Level 4: Stalwart restart

```bash
cd /opt/prim/deploy/email && docker compose restart
```

When: Stalwart mail server issues (inbound SMTP failures, JMAP errors).
This is separate from `prim-email` (prim-email is the Hono API wrapper; Stalwart is the actual mail server).

### Level 5: Full VPS reboot

```bash
reboot
```

Nuclear option. All `WantedBy=multi-user.target` services auto-start. Stalwart container has `restart: unless-stopped` and will come back on its own.

Post-reboot verification:
```bash
systemctl status prim-{wallet,store,faucet,spawn,search,email,token,mem,domain,track,site}
docker ps | grep stalwart
curl -s http://localhost:3001/
```

---

## 4. Log Locations

| What | Command / Path |
|------|---------------|
| Any prim service (follow) | `journalctl -u prim-<name> -f` |
| Last 100 lines | `journalctl -u prim-<name> -n 100 --no-pager` |
| Since last boot | `journalctl -u prim-<name> -b` |
| Caddy | `journalctl -u caddy -f` |
| Stalwart | `docker logs -f stalwart` |
| Healthcheck | `/var/log/prim-health.log` |
| Health state files | `/var/lib/prim/health/<endpoint>.status` |
| Backup | `/var/log/prim-backup.log` |
| fail2ban | `journalctl -u fail2ban -f` |
| UFW | `/var/log/ufw.log` |

---

## 5. Common Failures & Fixes

### 5.1 Service won't start / crash loop

**Symptom:** `systemctl status prim-<name>` shows `activating (auto-restart)` or `failed`.

**Diagnose:**
```bash
journalctl -u prim-<name> -n 50 --no-pager
```
Look for: missing env vars, port conflicts, missing deps, syntax errors.

**Fix:**
```bash
# Check env file exists and has values
cat /etc/prim/<name>.env

# Check port not already in use
ss -tlnp | grep :<port>

# After fixing, restart
systemctl restart prim-<name>
```

### 5.2 502 Bad Gateway (Caddy)

**Symptom:** HTTPS endpoint returns 502.

**Diagnose:** The upstream Bun service is down or not listening on the expected port.
```bash
systemctl status prim-<name>
curl -s http://localhost:<port>/
```

**Fix:**
```bash
systemctl restart prim-<name>
# Verify it came back
curl -s http://localhost:<port>/
```

### 5.3 TLS certificate failure

**Symptom:** HTTPS cert expired or invalid.

**Diagnose:**
```bash
caddy validate --config /etc/caddy/Caddyfile
journalctl -u caddy -n 50 --no-pager
```

**Fix:**
```bash
# Restart forces ACME renewal
systemctl restart caddy
# Verify port 80 is open (required for ACME HTTP challenge)
ufw status | grep 80
```

### 5.4 Stalwart not receiving mail

**Symptom:** Inbound SMTP fails.

**Diagnose:**
```bash
nc -zv localhost 25
docker ps | grep stalwart
docker logs stalwart | tail -50
```

**Fix:**
```bash
cd /opt/prim/deploy/email && docker compose restart
```

### 5.5 SQLite database locked

**Symptom:** `SQLITE_BUSY` or `database is locked` in logs.

**Diagnose:** Multiple writers or backup running concurrently.

**Fix:**
```bash
# If backup is running, wait for it to finish first
ps aux | grep backup.sh

# Then restart the owning service
systemctl restart prim-<name>
```

### 5.6 Disk full

**Symptom:** Services fail to write, journald stops logging.

**Diagnose:**
```bash
df -h
du -sh /opt/prim/*.db
journalctl --disk-usage
```

**Fix:**
```bash
journalctl --vacuum-size=500M
docker system prune -f
# Remove old backup temp files if present
rm -f /tmp/prim-*.db
```

### 5.7 Bun binary missing or corrupt

**Symptom:** `ExecStart` fails, "bun: not found" in journal.

**Diagnose:**
```bash
ls -la /home/prim/.bun/bin/bun
```

**Fix:**
```bash
sudo -u prim bash -c 'curl -fsSL https://bun.sh/install | bash'
# Then restart affected services
systemctl restart prim-wallet
```

### 5.8 x402 payment failures

**Symptom:** All paid endpoints return 402 even after payment. Agents can't transact.

**Diagnose:**
```bash
# Check chain config matches what agents are using
grep PRIM_NETWORK /etc/prim/wallet.env
grep PRIM_PAY_TO /etc/prim/wallet.env
```

**Fix:** Correct env vars, then restart the affected service:
```bash
systemctl restart prim-<name>
```

---

## 6. Backup & Recovery

### Daily backup

- **Script:** `/opt/prim/deploy/prim/backup.sh`
- **Schedule:** cron at 03:00 UTC (`0 3 * * *`)
- **Log:** `/var/log/prim-backup.log`
- **Destination:** Cloudflare R2, bucket `prim-backups`, path `db/<name>/<date>.db`
- **Retention:** 30 days, auto-pruned
- **R2 credentials:** sourced from `/etc/prim/store.env` (`CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`)
- **Tool:** rclone with R2 remote `r2backup` (config at `/root/.config/rclone/rclone.conf`)

**Databases backed up:**

| DB | Path |
|----|------|
| wallet | `/opt/prim/wallet.db` |
| store | `/opt/prim/store.db` |
| spawn | `/opt/prim/spawn.db` |
| faucet | `/opt/prim/faucet.db` |

Backup method: `sqlite3 <path> ".backup '<tmp>'"` (online, consistent snapshot).

### Manual backup

```bash
bash /opt/prim/deploy/prim/backup.sh
```

### Stalwart backup

Stalwart data is not covered by the automated backup. Manual process:
```bash
cd /opt/prim/deploy/email
docker compose stop
tar czf /tmp/stalwart-data-$(date +%Y-%m-%d).tar.gz stalwart-data/
docker compose start
```

### Recovery

```bash
# List available backups
rclone ls r2backup:prim-backups/db/<name>/

# Download a specific backup
rclone copyto r2backup:prim-backups/db/wallet/2026-02-25.db /tmp/wallet-restore.db

# Stop service, replace DB, restart
systemctl stop prim-wallet
cp /tmp/wallet-restore.db /opt/prim/wallet.db
chown prim:prim /opt/prim/wallet.db
systemctl start prim-wallet
```

---

## 7. Escalation Matrix

| Severity | Criteria | Response Time | Actions |
|----------|----------|---------------|---------|
| **P0 -- All down** | VPS unreachable or Caddy down | Immediate | SSH in, `systemctl status caddy`, reboot if needed. Check DigitalOcean console if SSH fails. |
| **P1 -- Wallet down** | wallet.sh unresponsive | Immediate | Restart immediately. Wallet is the keystone -- x402 payment depends on it, blocking all paid endpoints. |
| **P2 -- Single service** | One non-wallet service down | Within 15 min | `systemctl restart prim-<name>`, check logs for root cause. |
| **P3 -- Degraded** | Slow responses, intermittent errors | Next business day | Investigate logs, check disk/memory, schedule fix. |

**Priority notes:**
- Wallet is highest priority because x402 payment flows through it. Wallet down = all paid services effectively down.
- Stalwart down only affects email inbound/outbound, not other primitives.
- prim-site down affects the marketing site only, not API availability.

---

## 8. Monitoring

### Automated healthcheck

- **Script:** `/opt/prim/healthcheck.sh`
- **Schedule:** every 5 minutes via cron
- **Checks:** curls each endpoint, logs status, alerts on state transitions (up->down, down->up)
- **Alerting:** set `ALERT_WEBHOOK_URL` in root crontab for Slack/Discord webhook
- **Currently monitored:** wallet, faucet, spawn, store, email, search

**Add new endpoints** by editing the `ENDPOINTS` array in `healthcheck.sh` (between `BEGIN:PRIM:ENDPOINTS` / `END:PRIM:ENDPOINTS` markers).

### Manual health check

```bash
for port in 3001 3002 3003 3004 3005 3006 3007 3008 3009 3010; do
  echo -n "localhost:$port -> "
  curl -s -o /dev/null -w '%{http_code}' http://localhost:$port/ 2>/dev/null || echo "FAIL"
  echo
done
```
