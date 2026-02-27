#!/usr/bin/env bash
# setup.sh — Idempotent first-run setup for prim.sh Core 4 on Ubuntu 24.04
# Run as root on a fresh DigitalOcean droplet.
# Usage: bash setup.sh

set -euo pipefail

REPO_URL="https://github.com/useprim/prim.sh"
REPO_DIR="/opt/prim"
PRIM_USER="prim"
ENV_DIR="/etc/prim"
# BEGIN:PRIM:SERVICES
SERVICES=(wallet faucet spawn store email search infer)
# END:PRIM:SERVICES

log() { echo "[setup] $*"; }

# ── 1. System packages ────────────────────────────────────────────────────────
log "Updating apt..."
apt-get update -qq
apt-get install -y -qq curl git ufw fail2ban unattended-upgrades

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
  TEMPLATE="$REPO_DIR/deploy/prim/generated/$svc.env.template"
  ENV_FILE="$ENV_DIR/$svc.env"
  if [[ ! -f "$ENV_FILE" ]]; then
    if [[ -f "$TEMPLATE" ]]; then
      log "Creating $ENV_FILE from template — FILL IN SECRETS BEFORE STARTING SERVICE"
      cp "$TEMPLATE" "$ENV_FILE"
      chmod 640 "$ENV_FILE"
      chown root:"$PRIM_USER" "$ENV_FILE"
      log "  -> $ENV_FILE created."
    else
      log "WARNING: no template found for $svc at $TEMPLATE — creating empty $ENV_FILE"
      touch "$ENV_FILE"
      chmod 640 "$ENV_FILE"
      chown root:"$PRIM_USER" "$ENV_FILE"
    fi
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
ufw allow 25/tcp    # SMTP  (Stalwart inbound mail)
ufw allow 465/tcp   # SMTPS (Stalwart submission SSL)
ufw allow 587/tcp   # SMTP+STARTTLS (Stalwart submission)
ufw allow 993/tcp   # IMAPS (Stalwart mail retrieval)
ufw --force enable

# ── 13. SSH hardening: key-only auth ─────────────────────────────────────────
log "Hardening SSH..."
SSHD_CONF="/etc/ssh/sshd_config"
# Disable password auth; keep PAM for other pam modules (e.g. account/session)
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' "$SSHD_CONF"
sed -i 's/^#*ChallengeResponseAuthentication.*/ChallengeResponseAuthentication no/' "$SSHD_CONF"
sed -i 's/^#*KbdInteractiveAuthentication.*/KbdInteractiveAuthentication no/' "$SSHD_CONF"
# Drop in a sshd_config.d override as belt-and-suspenders
mkdir -p /etc/ssh/sshd_config.d
cat >/etc/ssh/sshd_config.d/99-prim-hardening.conf <<'EOF'
PasswordAuthentication no
ChallengeResponseAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
systemctl restart ssh 2>/dev/null || systemctl restart sshd 2>/dev/null || true

# ── 14. fail2ban: protect SSH from brute-force ───────────────────────────────
log "Configuring fail2ban..."
cat >/etc/fail2ban/jail.d/prim-ssh.conf <<'EOF'
[sshd]
enabled  = true
port     = ssh
maxretry = 5
findtime = 300
bantime  = 3600
EOF
systemctl enable fail2ban
systemctl restart fail2ban

# ── 15. Unattended security upgrades ─────────────────────────────────────────
log "Configuring unattended-upgrades..."
cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
cat >/etc/apt/apt.conf.d/51prim-unattended-upgrades <<'EOF'
Unattended-Upgrade::Allowed-Origins {
  "${distro_id}:${distro_codename}-security";
  "${distro_id}ESMApps:${distro_codename}-apps-security";
  "${distro_id}ESM:${distro_codename}-infra-security";
};
Unattended-Upgrade::AutoFixInterruptedDpkg "true";
Unattended-Upgrade::MinimalSteps "true";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
EOF
systemctl enable unattended-upgrades
systemctl restart unattended-upgrades

# ── 16. Enable and start services ────────────────────────────────────────────
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
log "       systemctl start prim-wallet prim-store prim-faucet prim-spawn prim-search prim-email caddy"
log "  3. Check logs:"
log "       journalctl -u prim-wallet -f"
