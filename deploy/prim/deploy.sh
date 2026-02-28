#!/usr/bin/env bash
# deploy.sh — Reinstall deps, rebuild middleware, restart services
# Usage: bash deploy.sh
# Run as root (or a user with sudo + systemctl access) on the VPS.
# Source delivery is handled externally (rsync from GHA, or manual sync-vps.sh).

set -euo pipefail

# shellcheck source=prim-env.sh
source "$(dirname "${BASH_SOURCE[0]}")/prim-env.sh"
# BEGIN:PRIM:SERVICES
SERVICES=(wallet faucet gate store search feedback)
# END:PRIM:SERVICES

log() { echo "[deploy] $*"; }

# ── 1. Install dependencies ───────────────────────────────────────────────────
log "Installing dependencies..."
sudo -u "$PRIM_USER" bash -c "cd $REPO_DIR && pnpm install --frozen-lockfile"

# ── 2. Rebuild x402-middleware ────────────────────────────────────────────────
log "Building @primsh/x402-middleware..."
sudo -u "$PRIM_USER" bash -c "cd $REPO_DIR && pnpm --filter @primsh/x402-middleware build"

# ── 3. Restart services ───────────────────────────────────────────────────────
log "Restarting prim services..."
for svc in "${SERVICES[@]}"; do
  systemctl restart "prim-$svc"
  log "  prim-$svc restarted"
done

log ""
log "Deploy complete. Check logs with: journalctl -u prim-wallet -f"
