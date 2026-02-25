# Stalwart Mail Server Docker Deployment

This directory contains the Docker Compose configuration for deploying Stalwart Mail Server.

## Prerequisites

- Docker and Docker Compose installed
- (For VPS deployment) Hetzner Cloud account and a provisioned VPS

## Quick Start

### Local Development

```bash
# Start Stalwart
docker compose up -d

# View logs and admin password
docker logs stalwart

# Stop Stalwart
docker compose down
```

### VPS Deployment (Hetzner)

1. **Provision a Hetzner VPS:**
   - Cloud console: https://console.hetzner.cloud/
   - Server type: CX23 (2 vCPU, 4 GB RAM, 40 GB disk, ~€3/mo)
   - OS: Ubuntu 24.04 LTS
   - Location: `nbg1` (Nuremberg, EU) or `ash` (Ashburn, US)
   - SSH key: Use your personal key for access

2. **SSH into the VPS:**
   ```bash
   ssh root@<VPS_IP>
   ```

3. **Install Docker + Docker Compose:**
   ```bash
   apt update && apt upgrade -y
   apt install -y docker.io docker-compose-plugin
   usermod -aG docker root
   ```

4. **Clone the repository (or copy deploy/relay/):**
   ```bash
   git clone https://github.com/your-org/agentstack.git
   cd agentstack/deploy/relay
   ```

   Or, if copying files manually:
   ```bash
   mkdir -p deploy/relay
   scp docker-compose.yml root@<VPS_IP>:/root/deploy/relay/
   scp .env.example root@<VPS_IP>:/root/deploy/relay/
   ```

5. **Start Stalwart:**
   ```bash
   cd deploy/relay
   docker compose up -d
   ```

6. **Verify startup:**
   ```bash
   docker logs stalwart | head -20
   ```
   Look for:
   - "Server started successfully"
   - Admin credentials (username/password)

7. **Record admin credentials:**
   The logs will display the initial admin username and password. Save these securely.

8. **Verify ports are listening:**
   ```bash
   nc -zv localhost 25    # SMTP inbound
   nc -zv localhost 8080  # Admin UI HTTP
   nc -zv localhost 465   # SMTP submission SSL
   nc -zv localhost 587   # SMTP submission STARTTLS
   nc -zv localhost 993   # IMAPS
   nc -zv localhost 443   # HTTPS (JMAP, autoconfig)
   ```

9. **Access the admin UI:**
   - URL: `http://<VPS_IP>:8080/login`
   - Log in with credentials from step 6

## Ports

| Port | Protocol | Purpose | Access |
|------|----------|---------|--------|
| 25 | SMTP | Inbound mail (internet → Stalwart) | Public (port forwarded) |
| 465 | SMTPS | Submission SSL (relay.sh → Stalwart) | Public (port forwarded) |
| 587 | SMTP+STARTTLS | Submission backup | Public (port forwarded) |
| 993 | IMAPS | Mail retrieval (debugging) | Public (port forwarded) |
| 8080 | HTTP | Admin UI | Lock down to VPN/localhost in R-2 |
| 443 | HTTPS | JMAP, autoconfig, ACME | Public (configured in R-2) |

**Ports NOT exposed:** 143 (unencrypted IMAP), 110/995 (POP3), 4190 (ManageSieve)

## Persistence

All Stalwart data (config, mail, RocksDB) is stored in `./stalwart-data/`. This directory is mounted as a Docker volume and persists across container restarts.

### Backup

```bash
docker compose down
tar -czf stalwart-backup-$(date +%Y%m%d).tar.gz stalwart-data/
docker compose up -d
```

### Restore

```bash
docker compose down
tar -xzf stalwart-backup-YYYYMMDD.tar.gz
docker compose up -d
```

## Container Management

```bash
# View logs
docker logs stalwart

# Follow logs (real-time)
docker logs -f stalwart

# Restart container
docker compose restart

# Stop container
docker compose down

# Remove all data (WARNING: irreversible)
docker compose down -v
```

## Environment Variables

Copy `.env.example` to `.env` and set:

```bash
cp .env.example .env
nano .env
```

- `VPS_IP`: Public IP of the VPS (used for firewall rules in R-2)
- `MAIL_DOMAIN`: Domain for relay.sh (configured in R-2)

## Next Steps

See **R-2** for:
- DNS configuration (MX records, SPF, DKIM)
- TLS/HTTPS setup (Caddy reverse proxy, ACME certs)
- Domain configuration in Stalwart admin UI
- Firewall rules (restrict port 8080, etc.)

## Troubleshooting

**Container fails to start:**
```bash
docker logs stalwart
# Check for permission issues on ./stalwart-data/
```

**Admin UI not loading:**
```bash
curl -s http://localhost:8080/login | head -20
```

**SMTP port not responding:**
```bash
nc -zv localhost 25
# If blocked, check firewall rules
```

**Stalwart database corruption:**
```bash
docker compose down
rm -rf stalwart-data/
docker compose up -d
# Stalwart will reinitialize RocksDB
```

## References

- Stalwart Mail Server: https://stalwart.eu/
- Docker image: https://hub.docker.com/r/stalwartlabs/stalwart
- JMAP RFC 8620: https://tools.ietf.org/html/rfc8620
