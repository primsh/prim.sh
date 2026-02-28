#!/usr/bin/env bash
# deploy.sh — Reinstall deps, rebuild middleware, install new services, restart
# Usage: bash deploy.sh
# Run as root (or a user with sudo + systemctl access) on the VPS.
# Source delivery is handled externally (rsync from GHA, or manual sync-vps.sh).

set -euo pipefail

# shellcheck source=prim-env.sh
source "$(dirname "${BASH_SOURCE[0]}")/prim-env.sh"
# BEGIN:PRIM:SERVICES
SERVICES=(wallet faucet gate store search feedback)
# END:PRIM:SERVICES

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
log() { echo "[deploy] $*"; }

# ── 1. Install dependencies ───────────────────────────────────────────────────
log "Installing dependencies..."
sudo -u "$PRIM_USER" bash -c "cd $REPO_DIR && pnpm install --frozen-lockfile"

# ── 2. Rebuild x402-middleware ────────────────────────────────────────────────
log "Building @primsh/x402-middleware..."
sudo -u "$PRIM_USER" bash -c "cd $REPO_DIR && pnpm --filter @primsh/x402-middleware build"

# ── 3. Bootstrap new services ────────────────────────────────────────────────
# Auto-install systemd units and env files for new services so deploys
# never require manual SSH. Env templates have empty secrets — the service
# will start (health check works) but feature endpoints fail until configured.
NEED_RELOAD=false
for svc in "${SERVICES[@]}"; do
  UNIT_SRC="$SCRIPT_DIR/services/prim-$svc.service"
  UNIT_DST="/etc/systemd/system/prim-$svc.service"
  ENV_FILE="$ENV_DIR/$svc.env"
  TEMPLATE="$REPO_DIR/deploy/prim/generated/$svc.env.template"

  # Install systemd unit if missing
  if [[ ! -f "$UNIT_DST" ]] && [[ -f "$UNIT_SRC" ]]; then
    cp "$UNIT_SRC" "$UNIT_DST"
    systemctl enable "prim-$svc"
    NEED_RELOAD=true
    log "  prim-$svc unit installed + enabled"
  fi

  # Create env file from template if missing
  if [[ ! -f "$ENV_FILE" ]]; then
    if [[ -f "$TEMPLATE" ]]; then
      cp "$TEMPLATE" "$ENV_FILE"
    else
      touch "$ENV_FILE"
    fi
    chmod 640 "$ENV_FILE"
    chown root:"$PRIM_USER" "$ENV_FILE"
    log "  $ENV_FILE created from template — configure secrets to enable full functionality"
  fi
done

if $NEED_RELOAD; then
  systemctl daemon-reload
fi

# ── 4. Update Caddyfile ──────────────────────────────────────────────────────
cp "$SCRIPT_DIR/Caddyfile" /etc/caddy/Caddyfile
systemctl reload caddy 2>/dev/null || true

# ── 5. Restart services ─────────────────────────────────────────────────────
log "Restarting prim services..."
for svc in "${SERVICES[@]}"; do
  systemctl restart "prim-$svc"
  log "  prim-$svc restarted"
done

log ""
log "Deploy complete. Check logs with: journalctl -u prim-wallet -f"
