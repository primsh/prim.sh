---
name: domain
version: 1.0.0
primitive: domain.prim.sh
requires: [wallet]
tools:
  - domain_search_domains
  - domain_quote_domain
  - domain_get_domain_status
  - domain_create_zone
  - domain_list_zones
  - domain_get_zone
  - domain_delete_zone
  - domain_activate_zone
  - domain_verify_zone
  - domain_setup_mail
  - domain_batch_records
  - domain_create_record
  - domain_list_records
  - domain_get_record
  - domain_update_record
  - domain_delete_record
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
1. domain_search_domains
   - query: "myagent"
   - tlds: "com,xyz,io"
   → returns results[] with available and price for each

2. domain_quote_domain
   - domain: "myagent.com"  (pick an available one)
   - years: 1
   → returns {quote_id, total_cost_usd, expires_at}
     IMPORTANT: quote expires in 15 minutes

3. [Register domain via registrar with the quote — see domain.prim.sh docs for register endpoint]
   → returns {domain, zone_id, nameservers, ns_configured, recovery_token}
     STORE recovery_token — needed if zone setup partially fails
```

### 2. Create zone → Add records → Verify → Activate

```
1. domain_create_zone
   - domain: "example.com"
   → returns {zone: {id, name_servers}}
     Configure these nameservers at your registrar before continuing

2. domain_create_record (repeat as needed)
   - zone_id: <id from step 1>
   - type: "A", name: "@", content: "203.0.113.42"
   → returns record with id

3. domain_verify_zone
   - zone_id: <id from step 1>
   → returns {all_propagated, nameservers, records[]}
     Check all_propagated before activating

4. domain_activate_zone
   - zone_id: <id from step 1>
   → triggers Cloudflare NS re-check for faster activation
```

### 3. Mail setup (MX, SPF, DMARC, DKIM)

```
1. domain_setup_mail
   - zone_id: <zone id>
   - mail_server: "mail.example.com"
   - mail_server_ip: "203.0.113.42"
   - dkim_rsa_selector: "mail"  (optional)
   - dkim_rsa_public_key: "MIIBIjAN..."  (optional)
   → creates A, MX, SPF TXT, DMARC TXT, and DKIM TXT records in one call
   → returns records[] with type and action (created/updated) for each

2. domain_verify_zone
   - zone_id: <zone id>
   → confirm all mail records are propagated
```

### 4. Custom email domain (register → mail-setup → email register)

```
1. domain_search_domains / domain_quote_domain / [register]
   → get domain + zone_id + nameservers

2. domain_setup_mail
   - zone_id: <from step 1>
   - mail_server: "mail.prim.sh"
   - mail_server_ip: <prim mail server IP>
   → sets MX, SPF, DMARC records pointing to email.prim.sh

3. email_register_domain (email primitive)
   - domain: <your registered domain>
   → registers domain with Stalwart mail server
   → returns required_records (DKIM keys)

4. domain_batch_records
   - zone_id: <from step 1>
   - create: <DKIM TXT records from step 3>
   → adds DKIM records to your zone

5. domain_verify_zone → confirm propagation
```

### 5. Batch DNS changes

```
1. domain_list_records with zone_id
   → get current record IDs

2. domain_batch_records
   - zone_id: <id>
   - create: [{type: "CNAME", name: "www", content: "example.com"}]
   - update: [{id: "r...", content: "new-ip"}]
   - delete: [{id: "r..."}]
   → all changes in a single x402 payment
```

### 6. Check registration status (post-register polling)

```
1. domain_get_domain_status
   - domain: "myagent.com"
   → returns {all_ready, ns_propagated, zone_active, next_action}
     Poll until all_ready=true (typically 15-60 minutes after registration)
```

## Error handling

- `invalid_request` → Missing required fields or invalid domain name. Check the message.
- `domain_taken` (409) → A zone for this domain already exists. Use `domain_list_zones` to find it.
- `not_found` (404) → Zone, record, or quote not found. Verify the ID is correct.
- `forbidden` (403) → Resource belongs to a different wallet. You can only access zones you own.
- `quote_expired` (410) → Quote is older than 15 minutes. Call `domain_quote_domain` again for a fresh quote.
- `registrar_error` (502) → NameSilo failed to process the registration. Check `domain_get_domain_status` — the domain may still have been registered.
- `cloudflare_error` (502) → Cloudflare API error. Use `domain_get_domain_status` and the recovery_token to retry setup.
- `rate_limited` (429) → Too many `domain_activate_zone` calls. Wait before retrying.

## Gotchas

- **Domain registration is a 2-step flow:** Always `domain_quote_domain` first, then register with the `quote_id`. You cannot register without a valid quote.
- **Quotes expire in 15 minutes:** Get the quote immediately before registering. Do not cache quote IDs.
- **Store the recovery_token:** If zone creation or NS configuration fails during registration, the domain is still purchased. Use the recovery_token with the recover endpoint to retry setup.
- **NS propagation takes time:** After configuring nameservers at your registrar, expect 15–60 minutes before `domain_get_domain_status` shows `ns_propagated=true`. Use `domain_activate_zone` to request an early CF check.
- **proxied=true only works for A/AAAA/CNAME:** Setting `proxied=true` on MX or TXT records will fail at Cloudflare.
- **`domain_setup_mail` is idempotent:** Calling it again updates existing records rather than creating duplicates.
- **batch operations are not atomic:** If one record in a `domain_batch_records` call fails, others may still succeed. Check the returned arrays.

## Related primitives

- **wallet** — Required. Your wallet identity determines which zones you own.
- **email** — Use `domain_setup_mail` to configure DNS for custom email domains with email.prim.sh.
- **spawn** — Register a domain and point A records at spawned VPS instances.
