#!/usr/bin/env bash
# metrics-snapshot.sh — Snapshot /v1/metrics from all live prims
#
# Appends a timestamped JSON line per service to /var/log/prim-metrics.log
# Designed for cron (every 6 hours) to persist metrics across service restarts.
#
# Usage: bash metrics-snapshot.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_SH="$SCRIPT_DIR/../deploy/prim/deploy.sh"
LOG_FILE="/var/log/prim-metrics.log"
TIMEOUT=10

# Derive service list from deploy.sh (single source of truth)
if [[ ! -f "$DEPLOY_SH" ]]; then
  echo "ERROR: $DEPLOY_SH not found" >&2
  exit 1
fi
eval "$(grep -A1 'BEGIN:PRIM:SERVICES' "$DEPLOY_SH" | tail -1)"

ts=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

for svc in "${SERVICES[@]}"; do
  url="https://$svc.prim.sh/v1/metrics"
  body=$(curl -sf --max-time "$TIMEOUT" "$url" 2>/dev/null || echo '{"error":"unreachable"}')
  echo "{\"ts\":\"$ts\",\"service\":\"$svc.prim.sh\",\"metrics\":$body}" >> "$LOG_FILE"
done
