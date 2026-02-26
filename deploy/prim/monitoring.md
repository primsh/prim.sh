# Prim Monitoring

## Healthcheck

`/opt/prim/healthcheck.sh` runs every 5 minutes via cron, curls each live endpoint, and alerts on state transitions (up→down, down→up).

## Alerting

Set `ALERT_WEBHOOK_URL` in root crontab for webhook alerts (Slack/Discord/generic):

```bash
sudo crontab -e
# Add at top:
ALERT_WEBHOOK_URL=https://hooks.slack.com/services/XXX/YYY/ZZZ
# Cron line:
*/5 * * * * /opt/prim/healthcheck.sh
```

Or set it system-wide in `/etc/environment`.

## Logs & State

- **Log**: `/var/log/prim-health.log` — timestamped status per check
- **State**: `/var/lib/prim/health/<endpoint>.status` — current up/down per endpoint

## Extending

To add UptimeRobot later: create monitors via API (`https://api.uptimerobot.com/v2/newMonitor`) for each endpoint. The self-hosted check remains as a secondary signal.
