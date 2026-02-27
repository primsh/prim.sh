#!/usr/bin/env bash
# metrics-snapshot.sh — Snapshot /v1/metrics from all live prims
#
# Appends a timestamped JSON line per service to /var/log/prim-metrics.log
# Designed for cron (every 6 hours) to persist metrics across service restarts.
#
# Usage: bash metrics-snapshot.sh

set -euo pipefail

LOG_FILE="/var/log/prim-metrics.log"
TIMEOUT=10

# BEGIN:PRIM:V0-ENDPOINTS
ENDPOINTS=(
  "https://wallet.prim.sh/v1/metrics"
  "https://store.prim.sh/v1/metrics"
  "https://search.prim.sh/v1/metrics"
)
# END:PRIM:V0-ENDPOINTS

ts=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

for url in "${ENDPOINTS[@]}"; do
  service=$(echo "$url" | sed 's|https://||;s|/v1/metrics||')
  body=$(curl -sf --max-time "$TIMEOUT" "$url" 2>/dev/null || echo '{"error":"unreachable"}')
  echo "{\"ts\":\"$ts\",\"service\":\"$service\",\"metrics\":$body}" >> "$LOG_FILE"
done
