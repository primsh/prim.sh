# R-1: Deploy Stalwart Mail Server (Docker on Hetzner VPS)

**Status:** Plan
**Spec:** `specs/relay.md`
**Depends on:** — (independent)
**Blocks:** R-2 (DNS/TLS config), R-3+ (all relay.sh wrapper tasks)

## Context

relay.sh wraps Stalwart Mail Server. Before any relay.sh code can be written, Stalwart needs to be running on a VPS. This task sets up the Docker deployment and verifies Stalwart boots and is reachable.

This is a deployment/ops task, not a code task. The deliverable is a `docker-compose.yml`, deployment docs, and a running Stalwart instance. No relay.sh TypeScript code is written here.

## Goals

1. Stalwart runs in Docker on a Hetzner VPS
2. docker-compose.yml is committed and reproducible
3. Admin UI is accessible (port 8080, will be locked down in R-2)
4. SMTP port 25 is listening (inbound mail, even though we don't configure domains until R-2)
5. JMAP endpoint is reachable (will get TLS in R-2)
6. Data volume is mounted for persistence across container restarts

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Docker image | `stalwartlabs/stalwart:latest` | Official image from Stalwart Labs |
| Backend | RocksDB (default) | Zero-config embedded DB. No Postgres needed for single-instance relay.sh. |
| VPS | Hetzner CX23 (2 vCPU, 4 GB RAM, 40 GB disk) | Cheapest option (~€3/mo). Stalwart is Rust — very efficient. Overkill for initial load. |
| Location | `nbg1` (Nuremberg) or `ash` (Ashburn) | EU for GDPR simplicity, or US for latency to US agents. Pick based on preference. |
| Volume | Single bind mount: `./stalwart-data:/opt/stalwart` | All Stalwart state (config, mail, RocksDB) in one directory. Easy backup. |
| Reverse proxy | Caddy (later, in R-2) | Auto-TLS. Not needed for R-1 — just get Stalwart running. |

## Phase 1 — Docker Compose file

### File: `deploy/relay/docker-compose.yml`

Create the deployment directory structure:

```
deploy/
└── relay/
    ├── docker-compose.yml
    ├── .env.example
    └── README.md
```

**docker-compose.yml contents:**

Service `stalwart`:
- Image: `stalwartlabs/stalwart:latest`
- Container name: `stalwart`
- Restart: `unless-stopped`
- `tty: true` + `stdin_open: true` (required by Stalwart Docker image)
- Ports: `25:25`, `465:465`, `587:587`, `993:993`, `8080:8080`, `443:443`
- Volume: `./stalwart-data:/opt/stalwart`

Expose only what's needed:
- Port 25: SMTP inbound (internet → Stalwart)
- Port 465: SMTPS submission (relay.sh → Stalwart for sending)
- Port 587: SMTP submission STARTTLS (backup)
- Port 993: IMAPS (not used by relay.sh but useful for debugging)
- Port 8080: HTTP admin UI (lock down to localhost/VPN after setup)
- Port 443: HTTPS (JMAP, autoconfig, ACME)

Do NOT expose: 143 (unencrypted IMAP), 110/995 (POP3), 4190 (ManageSieve).

**.env.example contents:**

```
# Hetzner VPS IP (for firewall rules in R-2)
VPS_IP=
# Domain for relay.sh (configured in R-2)
MAIL_DOMAIN=relay.sh
```

## Phase 2 — Deployment README

### File: `deploy/relay/README.md`

Document the deployment steps:

1. Provision a Hetzner VPS (CX23, Ubuntu 24.04, with SSH key)
2. SSH in, install Docker + Docker Compose
3. Clone the repo (or scp the `deploy/relay/` directory)
4. `docker compose up -d`
5. `docker logs stalwart` — note the generated admin password
6. Access `http://<VPS_IP>:8080/login` — verify admin UI loads
7. Verify ports: `nc -zv <VPS_IP> 25` (SMTP), `nc -zv <VPS_IP> 8080` (HTTP)

Include a "Next steps" section pointing to R-2 (DNS, TLS, domain config).

## Phase 3 — Deploy and verify

This is a manual step. The implementer should:

1. Provision the VPS (or document how to, if no Hetzner access)
2. Run `docker compose up -d`
3. Verify Stalwart boots: `docker logs stalwart | head -20`
4. Verify admin UI: `curl -s http://localhost:8080/login | head -5`
5. Verify SMTP: `nc -zv localhost 25`
6. Record the admin password from logs

If no Hetzner access is available, the task is complete when the docker-compose.yml is committed and tested locally (Docker Desktop). Add a note in README that VPS provisioning requires manual setup.

## Files changed (summary)

| File | Action |
|------|--------|
| `deploy/relay/docker-compose.yml` | **New** — Stalwart Docker Compose |
| `deploy/relay/.env.example` | **New** — environment template |
| `deploy/relay/README.md` | **New** — deployment instructions |

## Before closing

- [ ] `docker compose config` validates the compose file (no syntax errors)
- [ ] `docker compose up -d` starts Stalwart without errors
- [ ] `docker logs stalwart` shows successful boot + admin credentials
- [ ] Port 25 is listening (`nc -zv localhost 25`)
- [ ] Port 8080 serves the admin UI
- [ ] `stalwart-data/` directory is created with Stalwart config/data
- [ ] Container survives `docker compose restart`
- [ ] README documents all steps including admin password retrieval
