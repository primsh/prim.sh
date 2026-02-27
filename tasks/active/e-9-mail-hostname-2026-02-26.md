# E-9: Rename mail hostname from mail.email.prim.sh to mail.prim.sh

## Context

Stalwart's `server.hostname` is currently `mail.email.prim.sh` (set during E-8 migration from `relay.prim.sh`). The extra subdomain level is unnecessary — `mail.prim.sh` is cleaner for SMTP banners, reverse DNS, MX records, and TLS certs. The main prim VPS is `<VPS_IP>`; Stalwart runs there as a Docker container alongside all other primitives.

E-8 migrated from a separate DigitalOcean droplet (`142.93.203.3`) to the main VPS. DNS A records for `mail.email.prim.sh` may still point at the old IP — this task consolidates everything under `mail.prim.sh → <VPS_IP>`.

## Goals

- `mail.prim.sh` resolves to `<VPS_IP>`
- Stalwart `server.hostname` is `mail.prim.sh`
- SMTP banner shows `mail.prim.sh`
- MX for `email.prim.sh` points to `mail.prim.sh`
- TLS cert issued for `mail.prim.sh`
- Code defaults updated from `mail.email.prim.sh` to `mail.prim.sh`
- `mail.email.prim.sh` DNS kept alive (backward compat)

## Scope

This touches both infrastructure (DNS, Stalwart config, Caddy, .env) and code (default hostname strings in `packages/email/`).

## Phase 1: DNS

Add/update in Cloudflare (zone for `prim.sh`):

| Action | Type | Name | Content | TTL | Proxy |
|--------|------|------|---------|-----|-------|
| Add | A | `mail.prim.sh` | `<VPS_IP>` | 300 | DNS only (gray cloud) |
| Update | MX | `email.prim.sh` | `mail.prim.sh` (priority 10) | 300 | — |
| Update | TXT (SPF) | `email.prim.sh` | `v=spf1 a:mail.prim.sh -all` | 300 | — |

Do NOT delete `mail.email.prim.sh` A record — leave it as an alias for backward compatibility.

Wait for DNS propagation before proceeding (`dig +short A mail.prim.sh` should return `<VPS_IP>`).

## Phase 2: Stalwart config

Via SSH tunnel (`ssh -L 8080:localhost:8080 root@<VPS_IP>`) + admin API:

1. Update `server.hostname` to `mail.prim.sh` via `POST /api/settings`
2. Reload config via `GET /api/reload`
3. Stalwart's ACME (tls-alpn-01) will auto-request a new Let's Encrypt cert for `mail.prim.sh` on next inbound TLS connection

Note: DKIM keys do NOT change. DKIM signs for the mail domain (`email.prim.sh`), not the server hostname. The existing RSA and Ed25519 DKIM records stay as-is.

## Phase 3: Caddy config

Update Caddy reverse proxy block in `deploy/prim/Caddyfile`:

- Change `mail.email.prim.sh` block to `mail.prim.sh`
- Keep same reverse proxy target (`localhost:8080`)
- Optionally add `mail.email.prim.sh` as a second site address in the same block for backward compat

Also update `packages/email/prim.yaml` `extra_caddy` section — change `mail.email.prim.sh` to `mail.prim.sh`.

Reload Caddy on VPS: `systemctl reload caddy`

## Phase 4: Code changes

All files use env-var overrides with `mail.email.prim.sh` as the hardcoded default. Update defaults to `mail.prim.sh`:

| File | What to change |
|------|----------------|
| `packages/email/src/service.ts:749` | `MAIL_HOST` default: `"mail.email.prim.sh"` → `"mail.prim.sh"` |
| `packages/email/src/service.ts:750` | `RESERVED_DOMAINS`: add `"mail.prim.sh"`, keep `"mail.email.prim.sh"` |
| `packages/email/src/dns-check.ts:14` | `MAIL_HOST` default: `"mail.email.prim.sh"` → `"mail.prim.sh"` |
| `packages/email/src/jmap.ts:28` | `getJmapBaseUrl()` default: `"https://mail.email.prim.sh"` → `"https://mail.prim.sh"` |
| `packages/email/prim.yaml:22` | `extra_caddy` block: `mail.email.prim.sh` → `mail.prim.sh` |
| `packages/keystore/src/skill-content.ts:1102` | `mail_server` reference: `"mail.email.prim.sh"` → `"mail.prim.sh"` |

Test files (`service.test.ts`, `context.test.ts`, `domain.test.ts`) hardcode `mail.email.prim.sh` in mock data — update all occurrences to `mail.prim.sh`.

## Phase 5: Deploy config

| File | Change |
|------|--------|
| `deploy/email/.env` | No `MAIL_HOST` var currently — just verify `MAIL_DOMAIN=email.prim.sh` is unchanged (it stays the same, only the server hostname changes) |
| `deploy/email/.env.example` | Add comment noting mail hostname is `mail.prim.sh` |
| `.env.email` | Update IMAP/SMTP/JMAP references from `mail.email.prim.sh` to `mail.prim.sh` |
| `deploy/prim/generated/email.env.template` | No change needed unless it references the mail hostname |

## Phase 6: Restart + verify

On VPS (`root@<VPS_IP>`):

1. Deploy updated Caddyfile, reload Caddy
2. Restart Stalwart container: `cd /root/deploy/email && docker compose restart`
3. Verify SMTP banner: `nc -C mail.prim.sh 25` — expect `220 mail.prim.sh ESMTP Stalwart`
4. Verify TLS cert: `openssl s_client -connect <VPS_IP>:465 -servername mail.prim.sh < /dev/null 2>/dev/null | openssl x509 -noout -subject` — expect `CN=mail.prim.sh`
5. Verify MX: `dig +short MX email.prim.sh` — expect `10 mail.prim.sh.`
6. Verify SPF: `dig +short TXT email.prim.sh` — should include `a:mail.prim.sh`
7. Send test email from `*@email.prim.sh` to external address, check headers for `mail.prim.sh` in Received chain

## What NOT to do

- Do NOT delete `mail.email.prim.sh` DNS A record — keep for backward compat
- Do NOT change DKIM records — they sign for `email.prim.sh` domain, not the hostname
- Do NOT change `email.prim.sh` A record — it points to the VPS for the email.sh API service
- Do NOT change `MAIL_DOMAIN` / `EMAIL_DEFAULT_DOMAIN` — the mail domain stays `email.prim.sh`

## Execution order

1. Phase 1 (DNS) — A record must exist before ACME can issue cert
2. Phase 2 (Stalwart hostname) — after DNS propagates
3. Phase 3 (Caddy) — can run in parallel with Phase 2
4. Phase 4 (code) — independent, can run anytime
5. Phase 5 (deploy config) — independent, can run anytime
6. Phase 6 (restart + verify) — after all above

## Before closing

- [ ] `dig +short A mail.prim.sh` returns `<VPS_IP>`
- [ ] `dig +short MX email.prim.sh` returns `10 mail.prim.sh.`
- [ ] SMTP banner shows `mail.prim.sh` (`nc -C mail.prim.sh 25`)
- [ ] TLS cert CN is `mail.prim.sh`
- [ ] `mail.email.prim.sh` still resolves (backward compat)
- [ ] `pnpm -r test` passes (all test file references updated)
- [ ] SPF TXT record includes `a:mail.prim.sh`
- [ ] DKIM records unchanged and still valid
