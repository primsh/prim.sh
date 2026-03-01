#!/usr/bin/env bash
# migrate-db-paths.sh — Consolidate scattered DBs into $PRIM_HOME/data/
#
# After PR #100, services default to ~/.prim/data/<service>.db instead of ./<service>.db.
# On VPS, PRIM_HOME=/opt/prim so DBs go to /opt/prim/data/.
#
# This script:
#   1. Stops all prim services
#   2. Backs up existing DBs
#   3. Moves them to /opt/prim/data/
#   4. Adds PRIM_HOME to each service env file
#   5. Restarts services
#
# Usage:
#   ssh root@157.230.187.207
#   bash /opt/prim/scripts/migrate-db-paths.sh --dry-run   # review first
#   bash /opt/prim/scripts/migrate-db-paths.sh              # execute

set -euo pipefail

# shellcheck source=../deploy/prim/prim-env.sh
source "$(dirname "${BASH_SOURCE[0]}")/../deploy/prim/prim-env.sh"

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

DATA_DIR="$REPO_DIR/data"
BACKUP_DIR="$REPO_DIR/data-backup-$(date +%Y%m%d-%H%M%S)"

log() { echo "[migrate] $*"; }
run() {
  if $DRY_RUN; then
    log "(dry-run) $*"
  else
    "$@"
  fi
}

# Known DB files and their canonical names
# Format: "source_path:canonical_name"
DB_MAP=(
  "$REPO_DIR/wallet.db:wallet.db"
  "$REPO_DIR/store.db:store.db"
  "$REPO_DIR/packages/faucet/faucet.db:faucet.db"
  "$REPO_DIR/faucet.db:faucet.db"
  "$REPO_DIR/gate.db:gate.db"
  "$REPO_DIR/search.db:search.db"
  "$REPO_DIR/feedback.db:feedback.db"
  "$REPO_DIR/packages/feedback/feedback.db:feedback.db"
  "$REPO_DIR/spawn.db:spawn.db"
  "$REPO_DIR/domain.db:domain.db"
  "$REPO_DIR/email.db:email.db"
  "$REPO_DIR/mem.db:mem.db"
  "$REPO_DIR/token.db:token.db"
)

# Services that use DBs
SERVICES_WITH_DB=(wallet store faucet gate search feedback spawn domain email mem token)

# ── 1. Find actual DB files ───────────────────────────────────────────────────
log "Scanning for DB files..."
FOUND_DBS=()
for entry in "${DB_MAP[@]}"; do
  src="${entry%%:*}"
  if [[ -f "$src" ]]; then
    FOUND_DBS+=("$entry")
    log "  found: $src ($(du -h "$src" | cut -f1))"
  fi
done

if [[ ${#FOUND_DBS[@]} -eq 0 ]]; then
  log "No DB files found. Nothing to migrate."
  exit 0
fi

# Also scan for any we missed
log "Scanning for unlisted DB files..."
while IFS= read -r f; do
  known=false
  for entry in "${DB_MAP[@]}"; do
    src="${entry%%:*}"
    [[ "$f" == "$src" ]] && known=true && break
  done
  if ! $known && [[ "$f" != *"/data/"* ]] && [[ "$f" != *"/data-backup"* ]]; then
    log "  WARNING: unknown DB file: $f"
  fi
done < <(find "$REPO_DIR" -name "*.db" -not -path "*/node_modules/*" -not -path "*/.worktrees/*" 2>/dev/null)

# ── 2. Stop services ─────────────────────────────────────────────────────────
log "Stopping services..."
STOPPED_SERVICES=()
for svc in "${SERVICES_WITH_DB[@]}"; do
  if systemctl is-active "prim-$svc" &>/dev/null; then
    run systemctl stop "prim-$svc"
    STOPPED_SERVICES+=("$svc")
    log "  stopped prim-$svc"
  fi
done

# ── 3. Back up ────────────────────────────────────────────────────────────────
log "Backing up to $BACKUP_DIR..."
run mkdir -p "$BACKUP_DIR"
for entry in "${FOUND_DBS[@]}"; do
  src="${entry%%:*}"
  name="${entry##*:}"
  if [[ -f "$BACKUP_DIR/$name" ]]; then
    log "  WARNING: backup collision — $BACKUP_DIR/$name already exists, skipping $src"
    continue
  fi
  run cp "$src" "$BACKUP_DIR/$name"
  log "  backed up: $src → $BACKUP_DIR/$name"
done

# ── 4. Move to data dir ──────────────────────────────────────────────────────
log "Moving DBs to $DATA_DIR..."
run mkdir -p "$DATA_DIR"
for entry in "${FOUND_DBS[@]}"; do
  src="${entry%%:*}"
  name="${entry##*:}"
  dst="$DATA_DIR/$name"
  if [[ -f "$dst" ]] && [[ "$src" != "$dst" ]]; then
    log "  WARNING: $dst already exists, skipping $src (check manually)"
    continue
  fi
  run mv "$src" "$dst"
  log "  moved: $src → $dst"
done
run chown -R "$PRIM_USER:$PRIM_USER" "$DATA_DIR"

# ── 5. Add PRIM_HOME to env files ────────────────────────────────────────────
log "Adding PRIM_HOME=$REPO_DIR to env files..."
for svc in "${SERVICES_WITH_DB[@]}"; do
  env_file="$ENV_DIR/$svc.env"
  [[ ! -f "$env_file" ]] && continue
  if grep -q "^PRIM_HOME=" "$env_file" 2>/dev/null; then
    log "  $env_file: PRIM_HOME already set"
  else
    run bash -c "echo 'PRIM_HOME=$REPO_DIR' >> '$env_file'"
    log "  $env_file: added PRIM_HOME=$REPO_DIR"
  fi
done

# ── 6. Restart services ──────────────────────────────────────────────────────
log "Restarting services..."
for svc in "${STOPPED_SERVICES[@]}"; do
  run systemctl start "prim-$svc"
  log "  started prim-$svc"
done

log ""
log "Migration complete."
log "  Data dir: $DATA_DIR"
log "  Backup:   $BACKUP_DIR"
log ""
log "Verify with: ls -la $DATA_DIR"
