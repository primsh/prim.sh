# R-2: Configure Stalwart — domain, DKIM, SPF, DMARC, ACME TLS

**Status:** Plan
**Spec:** `specs/relay.md`
**Depends on:** R-1 (Stalwart Docker deploy — done)
**Blocks:** R-3 (mailbox creation), R-7 (webhooks), R-9 (custom domains)

## Context

R-1 deployed Stalwart as a Docker container on a Hetzner CX23 VPS with all ports exposed and the admin UI accessible at `:8080`. R-2 configures the domain, email authentication (DKIM/SPF/DMARC), TLS via ACME, and locks down the admin port. After R-2, the server can receive email at `*@relay.sh` and the relay.sh wrapper (R-3+) can manage it programmatically.

This is an ops task — no application code, just DNS records, Stalwart config, and infrastructure hardening.

## Goals

1. Stalwart configured with `relay.sh` as the primary mail domain
2. DKIM signing on all outbound mail (RSA-2048 + Ed25519)
3. SPF, DMARC, and MX DNS records published
4. TLS via Let's Encrypt ACME (auto-renewing)
5. Admin API (port 8080) locked down to localhost only
6. Stalwart admin API key generated and stored for relay.sh wrapper use

## Prerequisites

- `relay.sh` domain registered and DNS hosted (need to confirm DNS provider — likely Cloudflare)
- VPS IP address known (from R-1 deployment)
- SSH access to the VPS

## Phase 1 — DNS records (at DNS provider)

### A records

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | `relay.sh` | `<VPS_IP>` | 300 |
| A | `mail.relay.sh` | `<VPS_IP>` | 300 |
| A | `api.relay.sh` | `<VPS_IP>` | 300 |

### MX record

| Type | Name | Value | Priority | TTL |
|------|------|-------|----------|-----|
| MX | `relay.sh` | `mail.relay.sh` | 10 | 300 |

### SPF record

| Type | Name | Value |
|------|------|-------|
| TXT | `relay.sh` | `v=spf1 a:mail.relay.sh -all` |

`-all` (hard fail) since only our server should send mail for this domain.

### DMARC record

| Type | Name | Value |
|------|------|-------|
| TXT | `_dmarc.relay.sh` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@relay.sh; pct=100` |

Start with `p=quarantine`. Move to `p=reject` after confirming DKIM/SPF alignment is solid.

### DKIM records

Generated in Phase 3 (need the public keys from Stalwart first). Come back and add:

| Type | Name | Value |
|------|------|-------|
| TXT | `rsa._domainkey.relay.sh` | `v=DKIM1; k=rsa; p=<RSA_PUBLIC_KEY>` |
| TXT | `ed._domainkey.relay.sh` | `v=DKIM1; k=ed25519; p=<ED25519_PUBLIC_KEY>` |

### MTA-STS (optional, defer)

Not needed for Phase 1 (receive-only). Add when outbound sending is enabled.

## Phase 2 — ACME TLS configuration

Configure Stalwart's built-in ACME support via the admin UI or REST API.

**Settings to configure** (under `acme.letsencrypt`):

| Key | Value |
|-----|-------|
| `directory` | `https://acme-v02.api.letsencrypt.org/directory` |
| `challenge` | `tls-alpn-01` |
| `contact` | `mailto:admin@relay.sh` |
| `domains` | `mail.relay.sh`, `relay.sh` |
| `renew-before` | `30d` |

**Steps:**
1. SSH into VPS
2. Access admin UI at `http://localhost:8080` (SSH tunnel: `ssh -L 8080:localhost:8080 root@<VPS_IP>`)
3. Navigate to Settings > Server > TLS > ACME Providers
4. Add Let's Encrypt as provider with the settings above
5. Ensure `mail.relay.sh` is listed in Subject Names
6. Save and verify certificate issuance (check logs: `docker logs stalwart | grep -i acme`)

**Testing:** Start with Let's Encrypt staging URL first (`https://acme-staging-v02.api.letsencrypt.org/directory`), verify it works, then switch to production.

**Port requirement:** `tls-alpn-01` challenge uses port 443 (already exposed in docker-compose).

## Phase 3 — DKIM key generation

Generate two DKIM key pairs (RSA + Ed25519) for `relay.sh`.

**On the VPS:**

```bash
# RSA-2048
openssl genrsa -out /tmp/dkim_rsa.key 2048
openssl rsa -in /tmp/dkim_rsa.key -pubout -out /tmp/dkim_rsa.pub

# Ed25519
openssl genpkey -algorithm ed25519 -out /tmp/dkim_ed.key
openssl pkey -in /tmp/dkim_ed.key -pubout -out /tmp/dkim_ed.pub
```

**Configure in Stalwart** (admin UI > Settings > DKIM, or via REST API):

Signature `rsa`:
- `private-key`: contents of `dkim_rsa.key`
- `domain`: `relay.sh`
- `selector`: `rsa`
- `algorithm`: `rsa-sha-256`
- `canonicalization`: `relaxed/relaxed`
- `headers`: `From, To, Subject, Date, Message-ID, MIME-Version, Content-Type`

Signature `ed`:
- `private-key`: contents of `dkim_ed.key`
- `domain`: `relay.sh`
- `selector`: `ed`
- `algorithm`: `ed25519-sha256`
- `canonicalization`: `relaxed/relaxed`
- `headers`: (same as above)

**Signing rule:** `auth.dkim.sign` → apply both signatures to all outbound mail from `relay.sh`.

**Then:** Extract base64 public keys and add DKIM TXT records from Phase 1.

## Phase 4 — Domain principal in Stalwart

Create `relay.sh` as a domain in Stalwart's directory:

1. Admin UI > Management > Directory > Domains
2. Add `relay.sh`
3. Stalwart auto-generates recommended DNS records — cross-check against Phase 1

Alternatively via REST API:
```
POST /api/principal
Authorization: Bearer <ADMIN_TOKEN>
{
  "type": "domain",
  "name": "relay.sh"
}
```

Verify via `GET /api/dns/records/relay.sh` — Stalwart returns the DNS records it expects.

## Phase 5 — Admin API lockdown

**Restrict port 8080 to localhost only.** Modify `docker-compose.yml`:

```yaml
ports:
  - "25:25"
  - "465:465"
  - "587:587"
  - "993:993"
  - "127.0.0.1:8080:8080"   # Admin — localhost only
  - "443:443"
```

Access via SSH tunnel only: `ssh -L 8080:localhost:8080 root@<VPS_IP>`

**Generate admin API key** for relay.sh wrapper:
1. Admin UI > Settings > Authentication > API Keys
2. Create key with management permissions
3. Store in `.env` on VPS as `STALWART_API_KEY`
4. This key will be used by relay.sh wrapper (R-3+) for programmatic account management

**UFW firewall rules** (if not already configured):

```bash
ufw allow 25/tcp    # SMTP inbound
ufw allow 465/tcp   # SMTPS
ufw allow 587/tcp   # SMTP+STARTTLS
ufw allow 993/tcp   # IMAPS
ufw allow 443/tcp   # HTTPS (JMAP + ACME)
ufw allow 22/tcp    # SSH
ufw deny 8080/tcp   # Admin — blocked from internet (localhost bind handles this, belt+suspenders)
ufw enable
```

## Phase 6 — Verification

### DNS propagation

```bash
# MX
dig MX relay.sh +short
# Expected: 10 mail.relay.sh.

# SPF
dig TXT relay.sh +short
# Expected: "v=spf1 a:mail.relay.sh -all"

# DMARC
dig TXT _dmarc.relay.sh +short
# Expected: "v=DMARC1; p=quarantine; ..."

# DKIM
dig TXT rsa._domainkey.relay.sh +short
# Expected: "v=DKIM1; k=rsa; p=..."

dig TXT ed._domainkey.relay.sh +short
# Expected: "v=DKIM1; k=ed25519; p=..."

# A records
dig A mail.relay.sh +short
# Expected: <VPS_IP>
```

### TLS

```bash
# Verify cert
openssl s_client -connect mail.relay.sh:443 -servername mail.relay.sh < /dev/null 2>/dev/null | openssl x509 -noout -dates -subject
# Expected: Let's Encrypt cert for mail.relay.sh, not expired

# SMTP STARTTLS
openssl s_client -connect mail.relay.sh:587 -starttls smtp < /dev/null 2>/dev/null | head -5
```

### Inbound email test

```bash
# Send test email from external account (gmail, etc.) to test@relay.sh
# Check Stalwart logs for delivery:
docker logs stalwart | grep -i "test@relay.sh"
```

### DKIM signing test (when outbound enabled)

Send outbound email, check headers for `DKIM-Signature` with both `rsa` and `ed` selectors.

### Admin lockdown

```bash
# From internet — should fail
curl -s http://<VPS_IP>:8080/login
# Expected: connection refused

# Via SSH tunnel — should work
ssh -L 8080:localhost:8080 root@<VPS_IP>
curl -s http://localhost:8080/login
# Expected: Stalwart login page
```

## Files changed

| File | Action |
|------|--------|
| `deploy/relay/docker-compose.yml` | **Modify** — bind port 8080 to 127.0.0.1 |
| `deploy/relay/.env.example` | **Modify** — add STALWART_API_KEY placeholder |
| `deploy/relay/README.md` | **Modify** — add R-2 completion notes, DNS records, verification steps |

## Design decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| ACME challenge | `tls-alpn-01` | Port 443 already exposed, no web server conflict, works with Stalwart natively |
| DKIM algorithms | RSA-2048 + Ed25519 dual | RSA for compatibility (Gmail/Outlook), Ed25519 for modern receivers |
| DMARC policy | `quarantine` initially | Conservative start; move to `reject` after monitoring alignment reports |
| SPF policy | `-all` (hard fail) | Only our server sends for relay.sh — strict is correct |
| Admin lockdown | Localhost bind + UFW | Defense in depth — binding alone is sufficient, firewall is belt+suspenders |
| No reverse proxy yet | Direct Stalwart on 443 | Stalwart handles TLS natively via ACME. Caddy/nginx reverse proxy deferred until relay.sh API is deployed (R-3+) |

## Before closing

- [ ] `dig MX relay.sh` returns `mail.relay.sh`
- [ ] `dig TXT relay.sh` returns SPF record
- [ ] `dig TXT _dmarc.relay.sh` returns DMARC record
- [ ] `dig TXT rsa._domainkey.relay.sh` returns DKIM RSA public key
- [ ] `dig TXT ed._domainkey.relay.sh` returns DKIM Ed25519 public key
- [ ] TLS cert issued by Let's Encrypt (not self-signed) on port 443
- [ ] SMTP STARTTLS works on port 587
- [ ] Port 8080 unreachable from internet
- [ ] Port 8080 reachable via SSH tunnel
- [ ] Admin API key generated and stored in `.env`
- [ ] Test inbound email delivered successfully
- [ ] Stalwart domain principal shows `relay.sh` with correct DNS records
