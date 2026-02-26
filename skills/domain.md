---
name: domain
version: 1.0.0
primitive: domain.prim.sh
requires: [wallet]
tools:
  - domain_search
  - domain_quote
  - domain_register
  - domain_recover
  - domain_status
  - domain_configure_ns
  - domain_zone_create
  - domain_zone_list
  - domain_zone_get
  - domain_zone_delete
  - domain_zone_activate
  - domain_zone_verify
  - domain_zone_mail_setup
  - domain_record_create
  - domain_record_list
  - domain_record_get
  - domain_record_update
  - domain_record_delete
  - domain_record_batch
---

# domain.prim.sh

DNS and domain registration for agents. Register domains via NameSilo, manage Cloudflare DNS zones, and configure records — all with x402 payment (USDC on Base). No account, no GUI, no KYC.

## When to use

Use domain when you need to:
- Register a domain for an agent-owned service
- Manage DNS for a service you deploy (spawn.sh servers, email.sh custom domains)
- Configure custom email domains (MX, SPF, DKIM, DMARC)
- Programmatically create and update DNS records
- Verify DNS propagation before going live

Do NOT use domain for:
- Checking WHOIS information (not supported)
- Domain transfers (not supported)
- Wildcard records via proxied mode (Cloudflare restriction)

## Prerequisites

- Registered wallet (`wallet_register`)
- Wallet funded with USDC on Base (`faucet_usdc` on testnet)
- Wallet on access allowlist (private beta)

## Common workflows

### 1. Search → Quote → Register domain

```
1. domain_search
   - query: "myagent"
   - tlds: "com,xyz,io"
   → returns results[] with available and price for each

2. domain_quote
   - domain: "myagent.com"  (pick an available one)
   - years: 1
   → returns {quote_id, total_cost_usd, expires_at}
     IMPORTANT: quote expires in 15 minutes

3. domain_register
   - quote_id: <id from step 2>
   → pays dynamic amount from quote
   → returns {domain, zone_id, nameservers, ns_configured, recovery_token}
     STORE recovery_token — needed if zone setup partially fails
```

### 2. Create zone → Add records → Verify → Activate

```
1. domain_zone_create
   - domain: "example.com"
   → returns {zone: {id, name_servers}}
     Configure these nameservers at your registrar before continuing

2. domain_record_create (repeat as needed)
   - zone_id: <id from step 1>
   - type: "A", name: "@", content: "203.0.113.42"
   → returns record with id

3. domain_zone_verify
   - zone_id: <id from step 1>
   → returns {all_propagated, nameservers, records[]}
     Check all_propagated before activating

4. domain_zone_activate
   - zone_id: <id from step 1>
   → triggers Cloudflare NS re-check for faster activation
```

### 3. Mail setup (MX, SPF, DMARC, DKIM)

```
1. domain_zone_mail_setup
   - zone_id: <zone id>
   - mail_server: "mail.example.com"
   - mail_server_ip: "203.0.113.42"
   - dkim_rsa_selector: "mail"  (optional)
   - dkim_rsa_public_key: "MIIBIjAN..."  (optional)
   → creates A, MX, SPF TXT, DMARC TXT, and DKIM TXT records in one call
   → returns records[] with type and action (created/updated) for each

2. domain_zone_verify
   - zone_id: <zone id>
   → confirm all mail records are propagated
```

### 4. Custom email domain (register → mail-setup → email register)

```
1. domain_search / domain_quote / domain_register
   → get domain + zone_id + nameservers

2. domain_zone_mail_setup
   - zone_id: <from step 1>
   - mail_server: "mail.prim.sh"
   - mail_server_ip: <prim mail server IP>
   → sets MX, SPF, DMARC records pointing to email.prim.sh

3. email_domain_register (email primitive)
   - domain: <your registered domain>
   → registers domain with Stalwart mail server
   → returns required_records (DKIM keys)

4. domain_record_batch
   - zone_id: <from step 1>
   - create: <DKIM TXT records from step 3>
   → adds DKIM records to your zone

5. domain_zone_verify → confirm propagation
```

### 5. Batch DNS changes

```
1. domain_record_list with zone_id
   → get current record IDs

2. domain_record_batch
   - zone_id: <id>
   - create: [{type: "CNAME", name: "www", content: "example.com"}]
   - update: [{id: "r...", content: "new-ip"}]
   - delete: [{id: "r..."}]
   → all changes in a single x402 payment
```

### 6. Check registration status (post-register polling)

```
1. domain_status
   - domain: "myagent.com"
   → returns {all_ready, ns_propagated, zone_active, next_action}
     Poll until all_ready=true (typically 15-60 minutes after registration)
```

## Error handling

- `invalid_request` → Missing required fields or invalid domain name. Check the message.
- `domain_taken` (400) → A zone for this domain already exists. Use `domain_zone_list` to find it.
- `not_found` (404) → Zone, record, or quote not found. Verify the ID is correct.
- `forbidden` (403) → Resource belongs to a different wallet. You can only access zones you own.
- `quote_expired` (410) → Quote is older than 15 minutes. Call `domain_quote` again for a fresh quote.
- `registrar_error` (502) → NameSilo failed to process the registration. Check `domain_status` — the domain may still have been registered.
- `cloudflare_error` (502) → Cloudflare API error. If this happens during registration, use `domain_recover` with the recovery_token.
- `rate_limited` (429) → Too many `domain_zone_activate` calls. Wait before retrying.

## Gotchas

- **Domain registration is a 2-step flow:** Always `domain_quote` first, then `domain_register` with the `quote_id`. You cannot register without a valid quote.
- **Quotes expire in 15 minutes:** Get the quote immediately before registering. Do not cache quote IDs.
- **Store the recovery_token:** If zone creation or NS configuration fails during registration, the domain is still purchased. Use `domain_recover` with the token to retry the setup.
- **NS propagation takes time:** After configuring nameservers at your registrar, expect 15–60 minutes before `domain_status` shows `ns_propagated=true`. Use `domain_zone_activate` to request an early CF check.
- **proxied=true only works for A/AAAA/CNAME:** Setting `proxied=true` on MX or TXT records will fail at Cloudflare.
- **`domain_zone_mail_setup` is idempotent:** Calling it again updates existing records rather than creating duplicates.
- **batch operations are not atomic:** If one record in a batch fails, others may still succeed. Check the returned arrays.

## Related primitives

- **wallet** — Required. Your wallet identity determines which zones you own.
- **email** — Use `domain_zone_mail_setup` to configure DNS for custom email domains with email.prim.sh.
- **spawn** — Register a domain and point A records at spawned VPS instances.
