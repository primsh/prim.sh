#!/usr/bin/env bash
# Prim self-hosted healthcheck — checks all live endpoints, logs results,
# alerts on state transitions via webhook (Slack/Discord/generic).
# Intended for cron: */5 * * * * /opt/prim/healthcheck.sh

set -euo pipefail

# BEGIN:PRIM:ENDPOINTS
ENDPOINTS=(
  "https://wallet.prim.sh"
  "https://faucet.prim.sh"
  "https://spawn.prim.sh"
  "https://store.prim.sh"
  "https://email.prim.sh"
  "https://search.prim.sh"
  "https://infer.prim.sh"
)
# END:PRIM:ENDPOINTS

STATE_DIR="/var/lib/prim/health"
LOG_FILE="/var/log/prim-health.log"
TIMEOUT=10

mkdir -p "$STATE_DIR"

log() {
  echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') $1" >> "$LOG_FILE"
}

alert() {
  local msg="$1"
  log "ALERT: $msg"
  if [ -n "${ALERT_WEBHOOK_URL:-}" ]; then
    curl -sf -X POST "$ALERT_WEBHOOK_URL" \
      -H 'Content-Type: application/json' \
      -d "{\"text\": \"$msg\"}" \
      --max-time 10 >/dev/null 2>&1 || true
  fi
}

for endpoint in "${ENDPOINTS[@]}"; do
  # Derive a safe filename from the endpoint
  name=$(echo "$endpoint" | sed 's|https://||;s|[/.]|-|g')
  status_file="$STATE_DIR/$name.status"
  prev_status="unknown"
  [ -f "$status_file" ] && prev_status=$(cat "$status_file")

  # Check endpoint
  http_code=$(curl -sf -o /dev/null -w '%{http_code}' --max-time "$TIMEOUT" "$endpoint" 2>/dev/null || echo "000")

  if [ "$http_code" = "200" ]; then
    current_status="up"
  else
    current_status="down"
  fi

  log "$endpoint status=$current_status http=$http_code"

  # Alert on transitions only
  if [ "$prev_status" != "$current_status" ]; then
    if [ "$current_status" = "down" ]; then
      alert "DOWN: $endpoint (HTTP $http_code)"
    elif [ "$prev_status" = "down" ]; then
      alert "RECOVERED: $endpoint (HTTP $http_code)"
    fi
  fi

  echo "$current_status" > "$status_file"
done
