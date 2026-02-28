# E-4: Domain Warmup Plan for prim.sh

## Context

prim.sh runs Stalwart Mail Server on DigitalOcean (157.230.187.207). DNS auth was recently fixed (E-9): SPF pass, DKIM pass (RSA + Ed25519), DMARC `p=none`, PTR set. But the domain has near-zero sender reputation — iCloud rejects with HM08, and iprev was failing on Port25 verifier.

Himalaya accounts: `ggn@prim.sh`, `hello@prim.sh`, `asher@prim.sh` (all via `mail.email.prim.sh`).

**Goal**: Build sender reputation so prim.sh mail lands in inbox at Gmail, iCloud, and Outlook.

## Phase 0: Pre-flight (one-time, manual) — COMPLETED 2026-02-26

### Results

| Check | Status | Notes |
|-------|--------|-------|
| PTR (`dig -x 157.230.187.207`) | ✅ pass | Resolves to `mail.prim.sh` from Google, Cloudflare, Quad9 |
| SPF | ✅ pass | `v=spf1 a:mail.prim.sh -all` |
| DKIM RSA | ✅ pass | `rsa._domainkey.prim.sh` |
| DKIM Ed25519 | ⚠️ permerror | Port25 doesn't support Ed25519 — Gmail/iCloud do. Harmless. |
| iprev (Port25) | ✅ pass | Was FAIL on earlier test (pre-PTR propagation), now passes |
| DMARC | ✅ configured | `p=none` (intentional for warmup phase) |
| Himalaya host | ✅ ok | `mail.email.prim.sh` resolves to same IP as `mail.prim.sh` (157.230.187.207) |
| Date header | ✅ fixed | New sends include proper Date header (epoch-zero was old sends) |
| Gmail delivery | ⏳ pending | Test sent to gnahapet@gmail.com — awaiting user confirmation inbox vs spam |
| iCloud delivery | ❌ HM08 | Still rejected (`554 5.7.1 [HM08]`). Reputation issue, not auth. Will clear with warmup. |

### DNS Records (verified)

```
PTR:    157.230.187.207 → mail.prim.sh
MX:     prim.sh → mail.email.prim.sh (priority 10)
SPF:    v=spf1 a:mail.prim.sh -all
DMARC:  v=DMARC1; p=none; rua=mailto:dmarc@prim.sh; pct=100
DKIM:   rsa._domainkey.prim.sh (RSA-2048)
        ed._domainkey.prim.sh (Ed25519)
```

### Implication for warmup

Auth is fully clean. iCloud HM08 is purely a reputation block — the IP/domain has no positive sending history. Warmup must start with Gmail (more forgiving), then attempt iCloud after building volume.

## Phase 1: Seed & Self-Warmup (Week 1–2, 5–10 emails/day)

**Implementation**: Crontab shell script (`email-warmup.sh`) using himalaya.

- Rotate senders: `ggn@prim.sh`, `asher@prim.sh`
- Recipients: Garric's Gmail, iCloud (once HM08 clears), cross-sends between prim.sh accounts
- Schedule: `0 9,14 * * *` (9 AM and 2 PM PT) — 3–5 emails per run
- Content: short, natural text from a template bank (10–15 pre-written messages, rotated daily)
- **User action required**: open every email, reply to ~30%, rescue from spam if caught

## Phase 2: Ramp (Week 3–4, 20–50 emails/day)

Same crontab script, increased volume. Add seed addresses:
- Outlook/Hotmail
- Yahoo
- Any real contacts willing to receive and engage

## Phase 3: Monitoring (weekly, OpenClaw cron)

**Implementation**: OpenClaw cron job — Asher runs weekly deliverability check.

- Schedule: `0 8 * * 1` (Monday 8 AM PT)
- Scan ggn/asher/hello inboxes for bounces via `himalaya envelope list`
- Parse DMARC aggregate reports at `dmarc@prim.sh`
- Send fresh Port25 auth check
- Count bounce rate, flag if >2%
- Deliver summary to Telegram

## Phase 4: Graduate (Week 5–6)

If bounce rate <1% and Gmail + iCloud both delivering to inbox:
- Upgrade DMARC to `p=quarantine` (task E-7)
- Increase to production volume
- Disable warmup cron jobs

## Dependencies

- E-5 (Gmail verification) and E-6 (iCloud verification) gate E-7 (DMARC upgrade)
- Phase 0 must complete before any sends

## Before closing

- [ ] Run `dig -x 157.230.187.207` and confirm PTR resolves
- [ ] Port25 verifier shows SPF pass, DKIM pass, iprev pass
- [ ] No epoch-zero timestamps on new test sends
- [ ] Gmail test email lands in inbox (not spam)
- [ ] iCloud test email lands in inbox (HM08 cleared)
