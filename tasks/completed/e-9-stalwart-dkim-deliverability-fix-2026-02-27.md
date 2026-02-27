# E-9: Stalwart DKIM & Deliverability Fix

**Date:** 2026-02-27
**Status:** Completed (PTR propagating, iCloud reputation pending)

## Problem

Outbound email from `ggn@prim.sh` (and all `@prim.sh` accounts) was being rejected by iCloud with `554 [HM08]`. Root cause was a cascade of stale config left over from the original `relay.sh` domain setup (task R-2) and the domain migration to `email.prim.sh` (task E-8).

### Symptoms

- iCloud rejection: `554 [HM08] Message rejected due to local policy`
- Stalwart logs: `DKIM signer not found: id = "rsa-relay.sh"` and `id = "ed25519-relay.sh"` at delivery time
- Stalwart logs: `ARC sealer not found: id = "rsa-relay.sh"` at submission time
- Messages delivered to iCloud without DKIM signatures

### Root Causes

1. **`report.domain = relay.sh`** — This setting in Stalwart's RocksDB drove the built-in default expression for `auth.dkim.sign` and `auth.arc.seal`. The default constructs signer IDs as `rsa-<domain>` and `ed25519-<domain>`. With `report.domain = relay.sh`, it tried `rsa-relay.sh` and `ed25519-relay.sh`, which were never created (the actual signers are `rsa-prim.sh`, `ed25519-prim.sh`, etc.).

2. **TLS cert missing `mail.prim.sh`** — The server hostname was renamed to `mail.prim.sh` but the Let's Encrypt cert only covered `mail.email.prim.sh`, `email.prim.sh`, `mail.relay.prim.sh`, `relay.prim.sh`. Outbound TLS presented a cert that didn't match the EHLO hostname.

3. **No PTR record** — `157.230.187.207` had no reverse DNS. Most providers (including iCloud) expect PTR matching the EHLO hostname.

4. **SPF referenced old hostname** — `v=spf1 a:mail.email.prim.sh -all` still used the old mail hostname.

### Why `auth.dkim.sign` DB overrides didn't work

Multiple attempts to explicitly set `auth.dkim.sign` via `POST /api/settings` with various formats all failed silently. The built-in Stalwart default is an if/else conditional expression baked into the binary; the `report.domain` setting feeds into it. Changing `report.domain` was the correct lever.

## Fixes Applied

### 1. `report.domain`: `relay.sh` → `prim.sh`

```
POST /api/settings
[{"type":"insert","prefix":null,"values":[["report.domain","prim.sh"]],"assert_empty":false}]
```

This fixed the DKIM signer lookup immediately — `dkim.signer-not-found` errors stopped.

### 2. TLS cert: added `mail.prim.sh`

Added `acme.letsencrypt.domains.4 = mail.prim.sh` via settings API, deleted cached cert to force renewal. New cert issued 2026-02-27, expires 2026-05-28, covering:
- `mail.relay.prim.sh`, `relay.prim.sh`
- `mail.email.prim.sh`, `email.prim.sh`
- `mail.prim.sh` ← new

Note: bare `prim.sh` could not be added (behind Cloudflare proxy, HTTP-01 challenge fails).

### 3. PTR record

Renamed DigitalOcean droplet `prim-core` → `mail.prim.sh` via `doctl`:
```
doctl compute droplet-action rename 554499076 --droplet-name "mail.prim.sh" --wait
```
DO sets PTR = droplet name. Propagation takes 10–30 min.

### 4. SPF: `mail.email.prim.sh` → `mail.prim.sh`

Updated via Cloudflare API (zone `a16698041d45830e33b6f82b6f524e30`):
```
v=spf1 a:mail.prim.sh -all
```

## Current State of DNS/Auth

```
SPF:    v=spf1 a:mail.prim.sh -all
DKIM:   rsa._domainkey.prim.sh    (RSA, selector "rsa")
        ed._domainkey.prim.sh     (ED25519, selector "ed")
DMARC:  v=DMARC1; p=none; rua=mailto:dmarc@prim.sh; pct=100
PTR:    157.230.187.207 → mail.prim.sh (propagating)
```

## Remaining / Follow-up

- **iCloud `[HM08]`** — Apple's reputation system; new domain/IP starts cold. Expect 3–7 days for natural clearance. Can also submit via Apple's postmaster feedback loop once sending history builds.
- **Verify DKIM signing** — Port25 verifier email sent to `check-auth2@verifier.port25.com` from `ggn@prim.sh`. Check ggn inbox for the reply to confirm DKIM pass.
- **Email warm-up** — Once iCloud clears, ramp volume gradually starting with Gmail, then iCloud.
- **DMARC policy** — Currently `p=none`. Tighten to `p=quarantine` once DKIM/SPF alignment is confirmed stable.

## Stalwart Config Reference

- Server: `157.230.187.207`, Docker container `stalwart`, data at `/root/stalwart-data`
- Admin: `admin` / see `~/Developer/prim/deploy/email/.env`
- Config DB: RocksDB at `/root/stalwart-data/data/`
- Key settings prefix: `report.*`, `signature.*`, `acme.letsencrypt.*`
- DKIM signers: `rsa-prim.sh`, `ed25519-prim.sh` (for `@prim.sh`); `rsa-email.prim.sh`, `ed25519-email.prim.sh` (for email product)
