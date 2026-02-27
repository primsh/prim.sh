#!/usr/bin/env bash
# G2: Mainnet switchover — switch v0 prims from Sepolia to Base mainnet
#
# Usage:
#   bash g2-mainnet-switchover.sh            # execute
#   bash g2-mainnet-switchover.sh --dry-run  # print what would change
#
# Run as root on the VPS after all code PRs are merged and deploy.yml has completed.
# Idempotent: safe to run more than once.
#
# V0 scope: wallet, store, search (feedback not deployed yet)

set -euo pipefail

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

# shellcheck source=../deploy/prim/prim-env.sh
source "$(dirname "${BASH_SOURCE[0]}")/../deploy/prim/prim-env.sh"

LOG_FILE="/var/log/prim-g2-switchover.log"
# V0 scope: intentionally limited to these 3 prims (not all deployed services)
V0_SERVICES=(wallet store search)

log() {
  local ts
  ts=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
  echo "$ts  $*" | tee -a "$LOG_FILE"
}

dry() {
  # Print action in dry-run mode, execute in live mode
  if $DRY_RUN; then
    echo "[DRY-RUN] $*"
  else
    eval "$*"
  fi
}

# ── 0. Preflight ──────────────────────────────────────────────────────────────

log "=== G2 mainnet switchover start (dry_run=$DRY_RUN) ==="

for svc in "${V0_SERVICES[@]}"; do
  env_file="$ENV_DIR/$svc.env"
  if [[ ! -f "$env_file" ]]; then
    log "ERROR: missing $env_file — abort"
    exit 1
  fi
done
log "Preflight OK: all env files present"

# ── 1. Switch PRIM_NETWORK in env files ───────────────────────────────────────

log "Step 1: Switch PRIM_NETWORK to mainnet in env files"

for svc in "${V0_SERVICES[@]}"; do
  env_file="$ENV_DIR/$svc.env"
  current=$(grep -E "^PRIM_NETWORK=" "$env_file" 2>/dev/null || echo "PRIM_NETWORK=<not set>")

  if grep -qE "^PRIM_NETWORK=$MAINNET" "$env_file" 2>/dev/null; then
    log "  $svc: already mainnet — skip"
    continue
  fi

  log "  $svc: $current → PRIM_NETWORK=$MAINNET"

  if grep -qE "^PRIM_NETWORK=" "$env_file" 2>/dev/null; then
    # Replace existing line
    dry "sed -i 's|^PRIM_NETWORK=.*|PRIM_NETWORK=$MAINNET|' '$env_file'"
  else
    # Append (default_network is mainnet so this line may not exist on testnet setups that overrode it)
    dry "echo 'PRIM_NETWORK=$MAINNET' >> '$env_file'"
  fi
done

# ── 2. Restart v0 services ────────────────────────────────────────────────────

log "Step 2: Restart v0 services"

for svc in "${V0_SERVICES[@]}"; do
  log "  Restarting prim-$svc..."
  dry "systemctl restart prim-$svc"
  if ! $DRY_RUN; then
    sleep 1
    if systemctl is-active --quiet "prim-$svc"; then
      log "  prim-$svc: up"
    else
      log "  ERROR: prim-$svc failed to start — check: journalctl -u prim-$svc -n 50"
      exit 1
    fi
  fi
done

# ── 3. Reload Caddy ───────────────────────────────────────────────────────────

log "Step 3: Reload Caddy (picks up log directive from Caddyfile)"
dry "systemctl reload caddy"
if ! $DRY_RUN; then
  sleep 1
  if systemctl is-active --quiet caddy; then
    log "  Caddy: up"
  else
    log "  ERROR: Caddy failed to reload — check: journalctl -u caddy -n 50"
    exit 1
  fi
fi

# ── 4. Install metrics snapshot cron ─────────────────────────────────────────

SNAPSHOT_SCRIPT="/opt/prim/scripts/metrics-snapshot.sh"
CRON_MARKER="prim-metrics-snapshot"
CRON_LINE="0 */6 * * * root $SNAPSHOT_SCRIPT >> /var/log/prim-metrics-cron.log 2>&1  # $CRON_MARKER"
CRON_FILE="/etc/cron.d/prim-metrics"

log "Step 4: Install metrics snapshot cron (every 6 hours)"

if [[ -f "$CRON_FILE" ]] && grep -q "$CRON_MARKER" "$CRON_FILE"; then
  log "  Cron already installed — skip"
else
  if [[ ! -f "$SNAPSHOT_SCRIPT" ]]; then
    log "  ERROR: $SNAPSHOT_SCRIPT not found — ensure deploy completed before running this script"
    exit 1
  fi
  dry "chmod +x '$SNAPSHOT_SCRIPT'"
  dry "echo '$CRON_LINE' > '$CRON_FILE'"
  dry "chmod 0644 '$CRON_FILE'"
  log "  Cron installed: $CRON_FILE"
fi

# ── 5. Health checks ──────────────────────────────────────────────────────────

log "Step 5: Health checks"

if $DRY_RUN; then
  log "  [DRY-RUN] Would check: wallet.prim.sh, store.prim.sh, search.prim.sh"
else
  ENDPOINTS=(
    "https://wallet.prim.sh"
    "https://store.prim.sh"
    "https://search.prim.sh"
  )
  all_ok=true
  for ep in "${ENDPOINTS[@]}"; do
    http_code=$(curl -sf -o /dev/null -w '%{http_code}' --max-time 10 "$ep" 2>/dev/null || echo "000")
    if [[ "$http_code" == "200" ]]; then
      log "  $ep → $http_code OK"
    else
      log "  ERROR: $ep → $http_code (expected 200)"
      all_ok=false
    fi
  done

  if ! $all_ok; then
    log "Health check FAILED — investigate before proceeding to G3"
    exit 1
  fi
fi

# ── 6. Verify network in health response ─────────────────────────────────────

log "Step 6: Verify mainnet reported in /v1/metrics"

if $DRY_RUN; then
  log "  [DRY-RUN] Would check network field in wallet /v1/metrics"
else
  metrics=$(curl -sf --max-time 10 "https://wallet.prim.sh/v1/metrics" 2>/dev/null || echo "{}")
  network_field=$(echo "$metrics" | grep -o '"network":"[^"]*"' | head -1 || echo "not found")
  if echo "$network_field" | grep -q "8453"; then
    log "  Mainnet confirmed: $network_field"
  else
    log "  WARNING: network not confirmed mainnet: $network_field — check manually"
    log "  Full metrics: $metrics"
  fi
fi

# ── Done ──────────────────────────────────────────────────────────────────────

log "=== G2 switchover complete ==="
log ""
log "Next steps:"
log "  G3: Dogfood the golden path on mainnet yourself"
log "  Run: bun run scripts/smoke-cli.ts (against mainnet endpoints)"
