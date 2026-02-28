# OPS-13: Configure Health Alerting

## Context

`deploy/prim/healthcheck.sh` runs every 5 minutes via cron on the VPS. It curls each live prim endpoint, tracks up/down state in `/var/lib/prim/health/`, and logs to `/var/log/prim-health.log`. The script already has an `alert()` function that posts to `ALERT_WEBHOOK_URL` — but the env var is never set, so alerts go nowhere. Failures are logged but invisible until someone manually checks.

## Current State

The script is structurally sound:

- Checks 7 endpoints (wallet, faucet, spawn, store, email, search, infer)
- Tracks state per endpoint in `$STATE_DIR/<name>.status` files
- Alerts only on state transitions (up->down, down->up) — no spam on sustained outages
- Posts to `ALERT_WEBHOOK_URL` if set, using `{"text": "..."}` payload (Slack format)

**What's missing:**

1. `ALERT_WEBHOOK_URL` is not configured anywhere on the VPS
2. Payload format is Slack (`{"text": "..."}`) — Discord uses `{"content": "..."}`
3. Alert messages are bare strings — no structured info (timestamp, HTTP code easily parseable)
4. No email fallback
5. No recovery confirmation after extended outages
6. `monitoring.md` says to set the var in crontab, but `/etc/prim/ops.env` would be more consistent with the rest of the infra

## Goals

1. Discord webhook as primary alert channel (project already has a Discord community)
2. Email via email.prim.sh as fallback (dogfooding)
3. Structured, readable alert messages
4. Env var lives in `/etc/prim/ops.env`, sourced by cron — consistent with other prim env files

## Changes

### 1. Create `/etc/prim/ops.env`

New env file for cross-cutting ops config. Holds:

| Var | Purpose | Example |
|-----|---------|---------|
| `ALERT_WEBHOOK_URL` | Discord webhook URL | `https://discord.com/api/webhooks/...` |
| `ALERT_EMAIL_TO` | Fallback email recipient | `ops@garric.dev` |
| `ALERT_EMAIL_FROM_MAILBOX` | email.prim.sh mailbox ID for sending | `mbx_ops123` |
| `ALERT_EMAIL_FROM_ADDR` | Sender address on email.prim.sh | `ops@mail.prim.sh` |

Add `ops.env.template` to `deploy/prim/generated/` with placeholder values and comments. Update `setup.sh` to create `/etc/prim/ops.env` from template (same pattern as service env files).

### 2. Source ops.env from cron

Update the crontab entry (or a wrapper script) to source `/etc/prim/ops.env` before running healthcheck.sh. Two options:

- **Option A** (preferred): Add `. /etc/prim/ops.env` at the top of `healthcheck.sh` itself, guarded by `[ -f /etc/prim/ops.env ]`.
- **Option B**: Wrap in a one-liner cron: `bash -c 'source /etc/prim/ops.env && /opt/prim/healthcheck.sh'`

Option A is simpler and keeps crontab clean.

### 3. Fix alert payload for Discord

Discord webhooks expect `{"content": "..."}`, not `{"text": "..."}`. Detect which format to use based on the URL:

| URL contains | Payload key |
|-------------|-------------|
| `discord.com/api/webhooks` | `content` |
| Anything else (Slack, generic) | `text` |

This keeps the script compatible with Slack/generic webhooks if the URL changes later.

### 4. Improve alert message format

Current: `"DOWN: https://wallet.prim.sh (HTTP 000)"`

Proposed format for Discord (uses markdown):

```
**DOWN** wallet.prim.sh
HTTP 000 | 2026-02-27T14:30:00Z
```

And for recovery:

```
**RECOVERED** wallet.prim.sh
HTTP 200 | 2026-02-27T14:35:00Z | was down ~5m
```

To compute downtime duration: read the modification time of the state file (it was last written when the service went down). Use `stat` to get mtime, diff against current time.

### 5. Add email fallback

When `ALERT_EMAIL_TO` is set and the Discord webhook POST fails (non-2xx or curl error), send an alert email via `email.prim.sh`.

Call: `POST https://email.prim.sh/v1/mailboxes/{ALERT_EMAIL_FROM_MAILBOX}/send` with `{"to": "$ALERT_EMAIL_TO", "subject": "...", "body": "..."}`.

This requires x402 payment. Two approaches:

- **Option A**: Use `PRIM_INTERNAL_KEY` header to bypass payment for internal ops traffic (if supported).
- **Option B**: Pre-fund a small USDC balance and let it pay per-send. Each email costs fractions of a cent, so even $1 covers thousands of alerts.

Decide based on whether internal-key bypass exists for email.sh at implementation time. If neither works easily, skip email fallback for v1 and file a follow-up task.

### 6. Update monitoring.md

Replace the "set in crontab" instructions with the new `/etc/prim/ops.env` approach. Document both Discord and email fallback setup.

## Files to Modify

| File | Change |
|------|--------|
| `deploy/prim/healthcheck.sh` | Source ops.env, fix payload format, improve message format, add email fallback, add downtime duration on recovery |
| `deploy/prim/generated/ops.env.template` | **New file** — template with `ALERT_WEBHOOK_URL`, `ALERT_EMAIL_TO`, `ALERT_EMAIL_FROM_MAILBOX`, `ALERT_EMAIL_FROM_ADDR` |
| `deploy/prim/setup.sh` | Add ops.env to the env file creation loop (or handle separately since it's not a service) |
| `deploy/prim/monitoring.md` | Rewrite alerting section to reference ops.env and Discord setup |

## Alert Behavior Truth Table

| prev_status | current_status | WEBHOOK set | Action |
|-------------|---------------|-------------|--------|
| up | up | any | Log only |
| up | down | yes | POST webhook (Discord), email fallback if webhook fails |
| up | down | no | Log `ALERT:` line only |
| down | down | any | Log only (no repeat alert) |
| down | up | yes | POST recovery webhook, email fallback if webhook fails |
| down | up | no | Log `ALERT:` line only |
| unknown | down | yes | POST webhook (first check after deploy) |
| unknown | up | any | Log only |

## Testing

- On VPS: set `ALERT_WEBHOOK_URL` to a Discord webhook in a `#ops-alerts` channel. Manually stop a service (`systemctl stop prim-wallet`), wait for next cron run, verify Discord message appears. Start service, verify recovery message.
- Dry run: add a `--dry-run` flag that prints the alert payload to stdout instead of POSTing. Useful for verifying format without a real webhook.
- Email fallback: set `ALERT_WEBHOOK_URL` to an invalid URL, set email vars, verify email arrives.

## Before Closing

- [ ] Run `healthcheck.sh` manually on VPS and verify Discord alert fires
- [ ] Verify recovery message fires when service comes back
- [ ] Verify no alert fires on sustained down (second check with same state)
- [ ] Verify `unknown -> down` transition fires an alert (fresh state dir)
- [ ] Verify email fallback sends when webhook URL is unreachable
- [ ] Verify script exits cleanly when neither `ALERT_WEBHOOK_URL` nor `ALERT_EMAIL_TO` is set (current behavior preserved)
- [ ] `monitoring.md` updated with new setup instructions
- [ ] `ops.env.template` committed to repo
