# E-8: Migrate mail domain from relay.prim.sh → email.prim.sh

## Context

R-14 renamed the package from `@agentstack/relay` to `@agentstack/email`, but the live Stalwart mail server still operates on `relay.prim.sh`. Mail comes from `*@relay.prim.sh`, DNS records point to `relay.prim.sh`, DKIM signs for `relay.prim.sh`. This creates a naming inconsistency: the package, landing page, and docs all say "email" but the actual mail domain says "relay."

The domain has near-zero sending reputation (~4 emails total). There's nothing to preserve. Better to migrate now than build reputation on the wrong name.

## Goals

- All new mailboxes are `*@email.prim.sh`
- DKIM, SPF, DMARC, PTR all pass for `email.prim.sh`
- `relay.prim.sh` DNS records stay alive (no breakage for any in-flight mail)
- Google Postmaster Tools registered for `email.prim.sh`
- No code changes needed — the code already defaults to `email.prim.sh`

## Key Insight: Code Is Already Migrated

The R-14 rename already updated the code defaults:

| File | Constant | Default value |
|------|----------|---------------|
| `service.ts:71` | `DEFAULT_DOMAIN` | `"email.prim.sh"` |
| `service.ts:749` | `MAIL_HOST` | `"mail.email.prim.sh"` |
| `jmap.ts:28` | `getJmapBaseUrl()` | `"https://mail.email.prim.sh"` |
| `dns-check.ts:14` | `MAIL_HOST` | `"mail.email.prim.sh"` |

All are overridable via env vars (`EMAIL_DEFAULT_DOMAIN`, `STALWART_JMAP_URL`). The smoke test sets these explicitly, so tests will continue to work regardless.

**This means**: the migration is purely infrastructure (DNS + Stalwart + PTR). No code changes.

## Phase 1: DNS Records on Cloudflare

Zone ID: `a16698041d45830e33b6f82b6f524e30`

Create 8 records (mirrors the relay.prim.sh set):

| Type | Name | Content | TTL |
|------|------|---------|-----|
| A | `email.prim.sh` | `142.93.203.3` | 300 |
| A | `mail.email.prim.sh` | `142.93.203.3` | 300 |
| MX | `email.prim.sh` | `mail.email.prim.sh` (priority 10) | 300 |
| TXT (SPF) | `email.prim.sh` | `v=spf1 a:mail.email.prim.sh -all` | 300 |
| TXT (DMARC) | `_dmarc.email.prim.sh` | `v=DMARC1; p=none; rua=mailto:dmarc@email.prim.sh; pct=100` | 300 |
| TXT (DKIM RSA) | `rsa._domainkey.email.prim.sh` | *(get from Stalwart after Phase 2)* | 300 |
| TXT (DKIM Ed25519) | `ed._domainkey.email.prim.sh` | *(get from Stalwart after Phase 2)* | 300 |

DMARC starts at `p=none` (same as current relay.prim.sh — no reputation yet).

**Do NOT delete relay.prim.sh records.** Leave them alive indefinitely.

## Phase 2: Stalwart Configuration

All via SSH tunnel (`ssh -L 8080:localhost:8080 root@142.93.203.3`) + admin API.

### 2a. Create domain principal

```
POST /api/principal
{"type":"domain","name":"email.prim.sh","description":"Prim.sh email domain"}
```

### 2b. Generate DKIM keys

```
POST /api/dkim
```

Request body specifies domain `email.prim.sh`, selectors `rsa` (RSA-2048) and `ed` (Ed25519). Same dual-signing pattern as R-2.

After key generation, `GET /api/dns/records/email.prim.sh` returns the recommended DKIM TXT records. Copy the public key values into the Phase 1 DKIM DNS records.

### 2c. Update Stalwart hostname

Stalwart's server hostname (`server.hostname`) is currently `mail.relay.prim.sh`. Update to `mail.email.prim.sh`:

```
POST /api/settings
[{"type":"insert","prefix":null,"values":[["server.hostname","mail.email.prim.sh"]],"assert_empty":false}]
```

Then reload: `GET /api/reload`

### 2d. ACME TLS

Stalwart uses Let's Encrypt ACME (tls-alpn-01). After the A record for `mail.email.prim.sh` resolves to `142.93.203.3` and the hostname is updated, Stalwart will auto-request a new TLS cert on next inbound TLS connection. Verify with:

```bash
openssl s_client -connect 142.93.203.3:443 -servername mail.email.prim.sh < /dev/null 2>/dev/null | openssl x509 -noout -subject -dates
```

Expected: `CN=mail.email.prim.sh`

## Phase 3: PTR Record

Update DigitalOcean droplet name from `mail.relay.prim.sh` → `mail.email.prim.sh` via DO API:

```
POST /v2/droplets/554331661/actions
{"type":"rename","name":"mail.email.prim.sh"}
```

DO API token in `scripts/.env.testnet` as `DO_API_TOKEN`.

Verify: `dig +short -x 142.93.203.3` → `mail.email.prim.sh.`

## Phase 4: Google Postmaster Tools

Register `email.prim.sh` at postmaster.google.com. Get verification token, add as TXT record on Cloudflare:

| Type | Name | Content | TTL |
|------|------|---------|-----|
| TXT | `email.prim.sh` | `google-site-verification=<token>` | 3600 |

**This requires human action** — Garric must log into Google Postmaster Tools, add the domain, and provide the token. Claude adds the DNS record.

## Phase 5: Update deploy/.env

In `deploy/email/.env`, update:

```
MAIL_DOMAIN=email.prim.sh
```

This is documentation only — the code doesn't read `MAIL_DOMAIN`. The actual env vars that matter (`EMAIL_DEFAULT_DOMAIN`, `STALWART_JMAP_URL`) default to `email.prim.sh` already.

## Phase 6: Verification

### Forward-confirmed reverse DNS chain
```
mail.email.prim.sh → 142.93.203.3 → mail.email.prim.sh  ✓
```

### DNS records resolve
```bash
dig +short A email.prim.sh           # 142.93.203.3
dig +short A mail.email.prim.sh      # 142.93.203.3
dig +short MX email.prim.sh          # 10 mail.email.prim.sh.
dig +short TXT email.prim.sh         # SPF + Google verification
dig +short TXT _dmarc.email.prim.sh  # DMARC
dig +short TXT rsa._domainkey.email.prim.sh   # DKIM RSA
dig +short TXT ed._domainkey.email.prim.sh    # DKIM Ed25519
dig +short -x 142.93.203.3           # mail.email.prim.sh.
```

### Send test email
Create a mailbox with custom username on `email.prim.sh`, send to `garricn@icloud.com` and `gnahapet@gmail.com`. Verify:
- `mailed-by: email.prim.sh`
- `signed-by: email.prim.sh`
- Lands in inbox (or at least spam, not blocked)

### TLS cert
```bash
openssl s_client -connect 142.93.203.3:443 -servername mail.email.prim.sh
```
Verify cert CN matches `mail.email.prim.sh`.

## What NOT to do

- Do NOT delete `relay.prim.sh` DNS records
- Do NOT delete the `relay.prim.sh` domain principal in Stalwart
- Do NOT change any code in `packages/email/` — defaults are already correct
- Do NOT update `RESERVED_DOMAINS` — `relay.prim.sh` is not in the list and doesn't need to be (agents can't register custom domains matching the old default without a custom domain setup)

## Execution order

Phases must run in this order due to dependencies:

1. **Phase 1 (DNS)** — A records must exist before ACME can issue cert
2. **Phase 2a-2b (Stalwart domain + DKIM)** — DKIM keys needed for DNS TXT records
3. **Phase 1 again (DKIM DNS)** — Add DKIM TXT records from Phase 2b output
4. **Phase 2c (hostname update)** — After DNS propagates
5. **Phase 2d (TLS verification)** — After hostname update + DNS
6. **Phase 3 (PTR)** — Independent, can run anytime after Phase 1
7. **Phase 4 (Postmaster Tools)** — After DNS is live, requires human
8. **Phase 5 (.env)** — Anytime
9. **Phase 6 (verification)** — After everything else

## Before closing

- [ ] All 7 DNS records resolve correctly (A x2, MX, SPF, DMARC, DKIM x2)
- [ ] PTR resolves to `mail.email.prim.sh`
- [ ] TLS cert CN is `mail.email.prim.sh`
- [ ] Test email from `*@email.prim.sh` shows `mailed-by: email.prim.sh` and `signed-by: email.prim.sh`
- [ ] Google Postmaster Tools shows `email.prim.sh` as verified
- [ ] `relay.prim.sh` DNS records still exist and resolve
- [ ] No code changes were made
