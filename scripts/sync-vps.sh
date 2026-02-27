#!/usr/bin/env bash
# sync-vps.sh — Push local source to VPS, then restart services.
#
# Runs LOCALLY. Rsyncs all files the VPS needs, then SSHes in to
# reinstall deps and restart services.
#
# Usage:
#   bash scripts/sync-vps.sh           # sync + restart all services
#   bash scripts/sync-vps.sh --dry-run # show what would change, no writes
#   bash scripts/sync-vps.sh --sync-only # sync files, skip restart

set -euo pipefail

VPS="root@157.230.187.207"
REMOTE="/opt/prim"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

DRY_RUN=""
SYNC_ONLY=false
for arg in "$@"; do
  case "$arg" in
    --dry-run)   DRY_RUN="--dry-run" ;;
    --sync-only) SYNC_ONLY=true ;;
  esac
done

log() { echo "[sync-vps] $*"; }

# ── 1. Rsync source files ─────────────────────────────────────────────────────
log "Syncing source files to $VPS:$REMOTE ..."

rsync -avz --delete $DRY_RUN \
  --exclude='node_modules/' \
  --exclude='.git/' \
  --exclude='*.db' \
  --exclude='*.db-shm' \
  --exclude='*.db-wal' \
  --exclude='server.log' \
  --exclude='.env*' \
  --exclude='brand/assets/' \
  --exclude='research/' \
  --exclude='specs/' \
  --exclude='.claude/' \
  --exclude='bun.lock' \
  "$ROOT/" "$VPS:$REMOTE/"

if [[ -n "$DRY_RUN" ]]; then
  log "Dry run complete — no files written."
  exit 0
fi

if $SYNC_ONLY; then
  log "Sync complete (--sync-only, skipping restart)."
  exit 0
fi

# ── 2. Fix ownership + restart on VPS ────────────────────────────────────────
log "Running remote deploy..."
# shellcheck disable=SC2029
ssh "$VPS" "chown -R prim:prim $REMOTE && bash $REMOTE/deploy/prim/deploy.sh"
