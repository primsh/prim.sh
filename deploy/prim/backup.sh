#!/usr/bin/env bash
set -euo pipefail

# Daily SQLite backup → Cloudflare R2 (30-day retention)
# Cron: 0 3 * * * /opt/prim/backup.sh >> /var/log/prim-backup.log 2>&1

LOG_PREFIX="[prim-backup $(date -u +%Y-%m-%dT%H:%M:%SZ)]"
log() { echo "$LOG_PREFIX $*"; }

# --- Config ---
ENV_FILE="/etc/prim/store.env"
BUCKET="prim-backups"
R2_REMOTE="r2backup"
RCLONE_CONF="/root/.config/rclone/rclone.conf"
RETENTION_DAYS=30
DATE=$(date -u +%Y-%m-%d)

# DB files to back up (name:path)
DBS=(
  "wallet:/opt/prim/wallet.db"
  "store:/opt/prim/store.db"
  "spawn:/opt/prim/spawn.db"
  "faucet:/opt/prim/faucet.db"
)

# --- Load R2 credentials ---
if [[ ! -f "$ENV_FILE" ]]; then
  log "ERROR: $ENV_FILE not found — cannot load R2 credentials"
  exit 1
fi
set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

for var in CLOUDFLARE_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY; do
  if [[ -z "${!var:-}" ]]; then
    log "ERROR: $var not set in $ENV_FILE"
    exit 1
  fi
done

# --- Ensure rclone config ---
if ! command -v rclone &>/dev/null; then
  log "ERROR: rclone not installed — run: curl https://rclone.org/install.sh | bash"
  exit 1
fi

if [[ ! -f "$RCLONE_CONF" ]] || ! grep -q "\\[$R2_REMOTE\\]" "$RCLONE_CONF" 2>/dev/null; then
  log "Creating rclone config for R2..."
  mkdir -p "$(dirname "$RCLONE_CONF")"
  cat > "$RCLONE_CONF" <<EOF
[$R2_REMOTE]
type = s3
provider = Cloudflare
access_key_id = ${R2_ACCESS_KEY_ID}
secret_access_key = ${R2_SECRET_ACCESS_KEY}
endpoint = https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com
acl = private
no_check_bucket = true
EOF
  log "rclone config written to $RCLONE_CONF"
fi

# --- Create bucket if needed ---
if ! rclone lsd "${R2_REMOTE}:" 2>/dev/null | grep -q "$BUCKET"; then
  log "Creating R2 bucket $BUCKET..."
  rclone mkdir "${R2_REMOTE}:${BUCKET}" || {
    log "ERROR: Failed to create bucket $BUCKET"
    exit 1
  }
fi

# --- Backup each DB ---
BACKED_UP=0
for entry in "${DBS[@]}"; do
  name="${entry%%:*}"
  path="${entry#*:}"

  if [[ ! -f "$path" ]]; then
    log "SKIP: $path does not exist"
    continue
  fi

  tmp="/tmp/prim-${name}-${DATE}.db"

  log "Backing up $name ($path)..."
  sqlite3 "$path" ".backup '$tmp'" || {
    log "ERROR: sqlite3 backup failed for $name"
    rm -f "$tmp"
    continue
  }

  rclone copyto "$tmp" "${R2_REMOTE}:${BUCKET}/db/${name}/${DATE}.db" || {
    log "ERROR: rclone upload failed for $name"
    rm -f "$tmp"
    continue
  }

  rm -f "$tmp"
  log "OK: $name → db/${name}/${DATE}.db"
  BACKED_UP=$((BACKED_UP + 1))
done

log "Backed up $BACKED_UP databases"

# --- Prune old backups (>30 days) ---
log "Pruning backups older than ${RETENTION_DAYS} days..."
CUTOFF=$(date -u -d "${RETENTION_DAYS} days ago" +%Y-%m-%d 2>/dev/null || date -u -v-${RETENTION_DAYS}d +%Y-%m-%d)

for entry in "${DBS[@]}"; do
  name="${entry%%:*}"
  rclone lsf "${R2_REMOTE}:${BUCKET}/db/${name}/" 2>/dev/null | while read -r file; do
    file_date="${file%.db}"
    if [[ "$file_date" < "$CUTOFF" ]]; then
      log "DELETE: db/${name}/${file} (older than ${RETENTION_DAYS} days)"
      rclone deletefile "${R2_REMOTE}:${BUCKET}/db/${name}/${file}" || true
    fi
  done
done

log "Done"
