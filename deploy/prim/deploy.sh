#!/usr/bin/env bash
# deploy.sh — Quick redeploy: pull latest, reinstall deps, rebuild middleware, restart services
# Usage: bash deploy.sh
# Run as root (or a user with sudo + systemctl access) on the VPS.

set -euo pipefail

REPO_DIR="/opt/prim"
PRIM_USER="prim"
SERVICES=(wallet store faucet spawn search)

log() { echo "[deploy] $*"; }

# ── 1. Pull latest ────────────────────────────────────────────────────────────
log "Pulling latest from origin..."
sudo -u "$PRIM_USER" git -C "$REPO_DIR" pull --ff-only

# ── 2. Install dependencies ───────────────────────────────────────────────────
log "Installing dependencies..."
sudo -u "$PRIM_USER" bash -c "cd $REPO_DIR && pnpm install --frozen-lockfile"

# ── 3. Rebuild x402-middleware ────────────────────────────────────────────────
log "Building @primsh/x402-middleware..."
sudo -u "$PRIM_USER" bash -c "cd $REPO_DIR && pnpm --filter @primsh/x402-middleware build"

# ── 4. Restart services ───────────────────────────────────────────────────────
log "Restarting prim services..."
for svc in "${SERVICES[@]}"; do
  systemctl restart "prim-$svc"
  log "  prim-$svc restarted"
done

log ""
log "Deploy complete. Check logs with: journalctl -u prim-wallet -f"
