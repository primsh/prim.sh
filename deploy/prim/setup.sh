#!/usr/bin/env bash
# setup.sh — Idempotent first-run setup for prim.sh Core 4 on Ubuntu 24.04
# Run as root on a fresh DigitalOcean droplet.
# Usage: bash setup.sh

set -euo pipefail

REPO_URL="https://github.com/useprim/prim.sh"
REPO_DIR="/opt/prim"
PRIM_USER="prim"
ENV_DIR="/etc/prim"
SERVICES=(wallet store faucet spawn search email)

log() { echo "[setup] $*"; }

# ── 1. System packages ────────────────────────────────────────────────────────
log "Updating apt..."
apt-get update -qq
apt-get install -y -qq curl git ufw

# ── 2. Create prim user ───────────────────────────────────────────────────────
if ! id "$PRIM_USER" &>/dev/null; then
  log "Creating user '$PRIM_USER'..."
  useradd --system --shell /bin/bash --create-home "$PRIM_USER"
else
  log "User '$PRIM_USER' already exists."
fi

# ── 3. Install Bun (for prim user) ───────────────────────────────────────────
BUN_BIN="/home/$PRIM_USER/.bun/bin/bun"
if [[ ! -x "$BUN_BIN" ]]; then
  log "Installing Bun..."
  sudo -u "$PRIM_USER" bash -c 'curl -fsSL https://bun.sh/install | bash'
else
  log "Bun already installed."
fi

# Add bun to root PATH for this script too
export PATH="/home/$PRIM_USER/.bun/bin:$PATH"

# ── 4. Install pnpm via corepack ──────────────────────────────────────────────
if ! command -v pnpm &>/dev/null; then
  log "Installing pnpm via corepack..."
  # corepack ships with Node 16+; install Node if missing
  if ! command -v node &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y -qq nodejs
  fi
  corepack enable
  corepack prepare pnpm@latest --activate
else
  log "pnpm already installed."
fi

# ── 5. Clone or update repo ───────────────────────────────────────────────────
if [[ -d "$REPO_DIR/.git" ]]; then
  log "Repo exists — pulling latest..."
  git -C "$REPO_DIR" pull --ff-only
else
  log "Cloning repo to $REPO_DIR..."
  git clone "$REPO_URL" "$REPO_DIR"
fi
chown -R "$PRIM_USER:$PRIM_USER" "$REPO_DIR"

# ── 6. Install dependencies ───────────────────────────────────────────────────
log "Running pnpm install..."
sudo -u "$PRIM_USER" bash -c "cd $REPO_DIR && pnpm install --frozen-lockfile"

# ── 7. Build x402-middleware ──────────────────────────────────────────────────
log "Building @primsh/x402-middleware..."
sudo -u "$PRIM_USER" bash -c "cd $REPO_DIR && pnpm --filter @primsh/x402-middleware build"

# ── 8. Create env file directory ──────────────────────────────────────────────
log "Creating $ENV_DIR..."
mkdir -p "$ENV_DIR"
chmod 750 "$ENV_DIR"
chown root:"$PRIM_USER" "$ENV_DIR"

for svc in "${SERVICES[@]}"; do
  ENV_FILE="$ENV_DIR/$svc.env"
  if [[ ! -f "$ENV_FILE" ]]; then
    log "Creating placeholder $ENV_FILE — FILL IN SECRETS BEFORE STARTING SERVICE"
    touch "$ENV_FILE"
    chmod 640 "$ENV_FILE"
    chown root:"$PRIM_USER" "$ENV_FILE"

    case "$svc" in
      wallet)
        cat >"$ENV_FILE" <<'EOF'
# Required env vars for prim-wallet.service
# Docs: packages/wallet/src/index.ts

PORT=3001

# x402 payment recipient address (your treasury wallet)
PRIM_PAY_TO=0xYOUR_TREASURY_ADDRESS

# Chain: eip155:8453 (Base mainnet) or eip155:84532 (Base Sepolia)
PRIM_NETWORK=eip155:8453

# Optional: custom Base RPC URL (defaults to public endpoint)
# BASE_RPC_URL=https://mainnet.base.org

# Optional: custom SQLite path (defaults to ./wallet.db)
# WALLET_DB_PATH=/var/lib/prim/wallet.db
EOF
        ;;
      store)
        cat >"$ENV_FILE" <<'EOF'
# Required env vars for prim-store.service
# Docs: packages/store/src/index.ts

PORT=3002

# x402 payment recipient address (your treasury wallet)
PRIM_PAY_TO=0xYOUR_TREASURY_ADDRESS

# Chain: eip155:8453 (Base mainnet) or eip155:84532 (Base Sepolia)
PRIM_NETWORK=eip155:8453

# Cloudflare R2 credentials
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_API_TOKEN=your_api_token_with_r2_edit
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key

# Optional: custom SQLite path (defaults to ./store.db)
# STORE_DB_PATH=/var/lib/prim/store.db
EOF
        ;;
      faucet)
        cat >"$ENV_FILE" <<'EOF'
# Required env vars for prim-faucet.service
# Docs: packages/faucet/src/service.ts

PORT=3003

# Circle API key for Base Sepolia USDC drips
CIRCLE_API_KEY=your_circle_api_key

# Treasury wallet private key (hex, no 0x prefix) for ETH drips
FAUCET_TREASURY_KEY=your_private_key_hex

# Optional: custom Base RPC URL (defaults to public endpoint)
# BASE_RPC_URL=https://sepolia.base.org

# Optional: ETH drip amount per request (default: 0.01)
# FAUCET_DRIP_ETH=0.01
EOF
        ;;
      spawn)
        cat >"$ENV_FILE" <<'EOF'
# Required env vars for prim-spawn.service
# Docs: packages/spawn/src/index.ts

PORT=3004

# x402 payment recipient address (your treasury wallet)
PRIM_PAY_TO=0xYOUR_TREASURY_ADDRESS

# Chain: eip155:8453 (Base mainnet) or eip155:84532 (Base Sepolia)
PRIM_NETWORK=eip155:8453

# VPS provider credentials (use one or both)
DO_API_TOKEN=your_digitalocean_api_token
# HETZNER_API_KEY=your_hetzner_api_key

# Optional: custom SQLite path (defaults to ./spawn.db)
# SPAWN_DB_PATH=/var/lib/prim/spawn.db
EOF
        ;;
      search)
        cat >"$ENV_FILE" <<'EOF'
# Required env vars for prim-search.service
# Docs: packages/search/src/index.ts

PORT=3005

# x402 payment recipient address (your treasury wallet)
PRIM_PAY_TO=0xYOUR_TREASURY_ADDRESS

# Chain: eip155:8453 (Base mainnet) or eip155:84532 (Base Sepolia)
PRIM_NETWORK=eip155:8453

# Tavily API key (https://tavily.com)
TAVILY_API_KEY=your_tavily_api_key
EOF
        ;;
      email)
        cat >"$ENV_FILE" <<'EOF'
# Required env vars for prim-email.service
# Docs: packages/email/src/index.ts

PORT=3006

# x402 payment recipient address (your treasury wallet)
PRIM_PAY_TO=0xYOUR_TREASURY_ADDRESS

# Chain: eip155:8453 (Base mainnet) or eip155:84532 (Base Sepolia)
PRIM_NETWORK=eip155:8453

# Stalwart Mail Server connection
STALWART_API_URL=http://localhost:8080
STALWART_API_CREDENTIALS=your_base64_credentials
STALWART_JMAP_URL=https://mail.email.prim.sh
STALWART_WEBHOOK_SECRET=your_webhook_secret

# Email domain
EMAIL_DEFAULT_DOMAIN=email.prim.sh
EOF
        ;;
    esac
    log "  -> $ENV_FILE created with documented placeholders."
  else
    log "$ENV_FILE already exists — skipping."
  fi
done

# ── 9. Install systemd unit files ────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
log "Installing systemd unit files..."
for svc in "${SERVICES[@]}"; do
  cp "$SCRIPT_DIR/services/prim-$svc.service" "/etc/systemd/system/prim-$svc.service"
done
systemctl daemon-reload

# ── 10. Install Caddy ─────────────────────────────────────────────────────────
if ! command -v caddy &>/dev/null; then
  log "Installing Caddy..."
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  echo "deb [signed-by=/usr/share/keyrings/caddy-stable-archive-keyring.gpg] \
https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main" \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy
else
  log "Caddy already installed."
fi

# ── 11. Copy Caddyfile ────────────────────────────────────────────────────────
log "Installing Caddyfile..."
cp "$SCRIPT_DIR/Caddyfile" /etc/caddy/Caddyfile
systemctl reload caddy 2>/dev/null || true

# ── 12. Configure UFW ─────────────────────────────────────────────────────────
log "Configuring UFW..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP  (Caddy + ACME)
ufw allow 443/tcp   # HTTPS (Caddy)
ufw --force enable

# ── 13. Enable and start services ────────────────────────────────────────────
log "Enabling services..."
for svc in "${SERVICES[@]}"; do
  systemctl enable "prim-$svc"
done
systemctl enable caddy

log ""
log "Setup complete."
log ""
log "NEXT STEPS:"
log "  1. Fill in secrets in $ENV_DIR/*.env (each file lists required vars)"
log "  2. Start services:"
log "       systemctl start prim-wallet prim-store prim-faucet prim-spawn caddy"
log "  3. Check logs:"
log "       journalctl -u prim-wallet -f"
