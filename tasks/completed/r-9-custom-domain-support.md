# R-9: Build relay.sh wrapper — custom domain support

**Status:** Plan
**Depends on:** R-2 (Stalwart domain/TLS — done), D-1 (dns.sh zone + record CRUD — done)
**Blocks:** Nothing directly; enhances R-3 mailbox creation

## Context

relay.sh currently hardcodes `relay.prim.sh` as the only mail domain. `createMailbox` in `service.ts:88-96` explicitly rejects any domain that isn't `DEFAULT_DOMAIN`. This means every agent's mailbox is `{random}@relay.prim.sh` — fine for disposable burner inboxes, but agents that need to send professional email (customer communication, deal flow, partner outreach) need their own domain.

The infrastructure to support this already exists in pieces:
- **Stalwart** supports multi-domain via domain principals (`POST /api/principal` with `type: "domain"`) and per-domain DKIM (`POST /api/dkim`)
- **dns.sh (D-1)** provides zone + record CRUD on Cloudflare
- **relay.sh** already stores `domain` per mailbox in SQLite and passes it through the stack

R-9 connects these pieces: an agent registers a custom domain with relay.sh, proves DNS ownership via verification, and relay.sh provisions it in Stalwart with DKIM signing. After that, `POST /v1/mailboxes` accepts the verified domain.

## Goals

1. Agent can register a custom domain with relay.sh
2. relay.sh tells the agent exactly which DNS records to create (MX, SPF, DMARC, DKIM)
3. Agent creates those records (manually or via domain.sh) and triggers verification
4. On successful verification, relay.sh provisions the domain in Stalwart (domain principal + DKIM keys)
5. `POST /v1/mailboxes` accepts verified custom domains alongside `relay.prim.sh`

## Agent Workflow

```
1. POST /v1/domains { domain: "acme.com" }
   → relay.sh stores domain, generates required DNS records list
   → Returns domain object with status "pending" + required_records

2. Agent creates DNS records (via domain.sh or their own DNS provider)
   - MX record pointing to mail.relay.prim.sh
   - SPF TXT record authorizing mail.relay.prim.sh
   - DMARC TXT record
   - (DKIM records added automatically after verification)

3. POST /v1/domains/:id/verify
   → relay.sh queries DNS to check MX + SPF + DMARC
   → If all propagated: provision in Stalwart, generate DKIM, set status "active"
   → Returns updated domain with DKIM TXT records to add

4. Agent adds DKIM TXT records to DNS

5. POST /v1/mailboxes { domain: "acme.com" }
   → Now works — domain is verified and provisioned
```

## New API Endpoints

### POST /v1/domains — Register domain

Request:
```json
{ "domain": "acme.com" }
```

Response (201):
```json
{
  "id": "dom_a1b2c3d4",
  "domain": "acme.com",
  "status": "pending",
  "owner_wallet": "0x...",
  "created_at": "2026-02-25T...",
  "required_records": [
    { "type": "MX", "name": "acme.com", "content": "mail.relay.prim.sh", "priority": 10 },
    { "type": "TXT", "name": "acme.com", "content": "v=spf1 include:relay.prim.sh -all" },
    { "type": "TXT", "name": "_dmarc.acme.com", "content": "v=DMARC1; p=quarantine; rua=mailto:dmarc@acme.com; pct=100" }
  ]
}
```

Validation:
- Domain format check (reuse `isValidDomain()` pattern from dns.sh `service.ts:100-109`)
- Reject `relay.prim.sh` and `prim.sh` (reserved)
- Reject duplicates (same domain already registered by any wallet)

### GET /v1/domains — List caller's domains

Response (200):
```json
{
  "domains": [ ... ],
  "total": 2,
  "page": 1,
  "per_page": 25
}
```

### GET /v1/domains/:id — Get domain details

Returns domain with current status and required/verified records.

### POST /v1/domains/:id/verify — Trigger DNS verification

Response on success (200):
```json
{
  "id": "dom_a1b2c3d4",
  "domain": "acme.com",
  "status": "active",
  "verified_at": "2026-02-25T...",
  "dkim_records": [
    { "type": "TXT", "name": "rsa._domainkey.acme.com", "content": "v=DKIM1; k=rsa; p=MIIBIjAN..." },
    { "type": "TXT", "name": "ed._domainkey.acme.com", "content": "v=DKIM1; k=ed25519; p=HAa8Xaz..." }
  ]
}
```

Response on failure (200, not an error — agent should retry):
```json
{
  "id": "dom_a1b2c3d4",
  "domain": "acme.com",
  "status": "pending",
  "verification_results": [
    { "type": "MX", "name": "acme.com", "expected": "mail.relay.prim.sh", "found": "mail.relay.prim.sh", "pass": true },
    { "type": "TXT", "name": "acme.com", "expected": "v=spf1 include:relay.prim.sh -all", "found": null, "pass": false },
    { "type": "TXT", "name": "_dmarc.acme.com", "expected": "v=DMARC1;*", "found": null, "pass": false }
  ]
}
```

### DELETE /v1/domains/:id — Remove custom domain

Deletes Stalwart domain principal, removes DKIM configuration, deletes DB row. Does NOT delete the agent's DNS records (that's their responsibility).

## DNS Verification Requirements

Three records must be present before relay.sh will provision the domain:

| Record | Name | Expected content | Check method |
|--------|------|-----------------|--------------|
| MX | `{domain}` | `mail.relay.prim.sh` (priority 10) | DNS lookup, verify content matches |
| SPF | `{domain}` | TXT containing `include:relay.prim.sh` or `a:mail.relay.prim.sh` | DNS lookup, check SPF mechanism is present |
| DMARC | `_dmarc.{domain}` | TXT starting with `v=DMARC1` | DNS lookup, verify DMARC record exists |

DKIM records are NOT checked during verification because they don't exist yet — relay.sh generates them during Stalwart provisioning and returns the public keys for the agent to add.

### Verification implementation

Use Node.js `dns.promises` module:
- `dns.resolveMx(domain)` for MX records
- `dns.resolveTxt(domain)` for SPF (look for TXT record containing `v=spf1`)
- `dns.resolveTxt('_dmarc.' + domain)` for DMARC

Do NOT use Cloudflare API for verification — the agent's DNS may not be on Cloudflare. Query public DNS.

## Stalwart Provisioning (on successful verification)

Three Stalwart API calls, in order:

1. **Create domain principal**
   ```
   POST /api/principal
   { "type": "domain", "name": "acme.com" }
   ```
   This tells Stalwart to accept mail for `@acme.com`.

2. **Generate DKIM keys** (two calls — RSA + Ed25519)
   ```
   POST /api/dkim
   { "id": null, "algorithm": "RSA", "domain": "acme.com", "selector": null }

   POST /api/dkim
   { "id": null, "algorithm": "Ed25519", "domain": "acme.com", "selector": null }
   ```
   Stalwart generates key pairs and configures signing. The selectors are auto-assigned.

3. **Retrieve DNS records** (to get DKIM public keys)
   ```
   GET /api/dns/records/acme.com
   ```
   Returns the recommended DNS records including DKIM TXT records with public keys. Parse the DKIM entries and return them to the agent.

If any Stalwart call fails, roll back: delete the domain principal if it was created, and keep the domain in "pending" status so the agent can retry.

## DB Schema Addition

New `domains` table in `relay.db`:

```sql
CREATE TABLE domains (
  id             TEXT PRIMARY KEY,        -- "dom_" + 8 hex chars
  domain         TEXT NOT NULL UNIQUE,
  owner_wallet   TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending',  -- pending | active | failed
  mx_verified    INTEGER NOT NULL DEFAULT 0,
  spf_verified   INTEGER NOT NULL DEFAULT 0,
  dmarc_verified INTEGER NOT NULL DEFAULT 0,
  dkim_rsa_record  TEXT,                  -- DKIM RSA TXT record content (after provisioning)
  dkim_ed_record   TEXT,                  -- DKIM Ed25519 TXT record content (after provisioning)
  stalwart_provisioned INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  verified_at    INTEGER,
  updated_at     INTEGER NOT NULL
);

CREATE INDEX idx_domains_owner ON domains(owner_wallet);
CREATE INDEX idx_domains_domain ON domains(domain);
```

## Changes to Existing Mailbox Creation

`service.ts` `createMailbox()` currently rejects any domain != `DEFAULT_DOMAIN` at line 89-96. Replace that guard with:

```
domain_requested | domain_in_domains_table | domain_status | result
-----------------|------------------------|---------------|--------
relay.prim.sh    | n/a (skip lookup)      | n/a           | allow (default domain)
custom           | not found              | n/a           | reject: "Domain not registered"
custom           | found, wrong owner     | n/a           | reject: "Domain not found" (don't leak)
custom           | found, correct owner   | pending       | reject: "Domain not yet verified"
custom           | found, correct owner   | active        | allow
```

This is the only change to the existing mailbox flow. The mailbox `domain` column already stores the domain string, and `address` is already constructed as `{username}@{domain}`.

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `packages/relay/src/db.ts` | **Modify** | Add `domains` table creation, add domain CRUD queries |
| `packages/relay/src/stalwart.ts` | **Modify** | Add `createDomainPrincipal()`, `deleteDomainPrincipal()`, `generateDkim()`, `getDnsRecords()` |
| `packages/relay/src/dns-check.ts` | **Create** | DNS verification module (MX, SPF, DMARC lookups via `dns.promises`) |
| `packages/relay/src/api.ts` | **Modify** | Add domain-related type definitions |
| `packages/relay/src/service.ts` | **Modify** | Add domain service functions, modify `createMailbox()` domain guard |
| `packages/relay/src/index.ts` | **Modify** | Add domain routes |
| `test/domain.test.ts` | **Create** | Domain registration, verification, provisioning tests |

## Dependency Direction

```
index.ts → service.ts → stalwart.ts  (Stalwart admin API)
                       → db.ts       (SQLite persistence)
                       → dns-check.ts (DNS verification via Node dns.promises)
                       → api.ts      (types only)
```

`dns-check.ts` is a new leaf module — no imports from other relay modules. Uses only `node:dns/promises`.

## Service Layer Functions

### registerDomain(domain, callerWallet)
1. Validate domain format
2. Reject reserved domains (`relay.prim.sh`, `prim.sh`)
3. Check for duplicates in DB
4. Insert row with status "pending"
5. Return domain response with `required_records`

### verifyDomain(domainId, callerWallet)
1. Ownership check
2. Reject if already "active"
3. Run DNS checks (MX, SPF, DMARC) via `dns-check.ts`
4. Update individual verification flags in DB
5. If all three pass:
   a. Call Stalwart to create domain principal
   b. Call Stalwart to generate DKIM (RSA + Ed25519)
   c. Call Stalwart `GET /api/dns/records/{domain}` to retrieve DKIM public keys
   d. Store DKIM record content in DB
   e. Set status = "active", verified_at = now
   f. Return domain with `dkim_records`
6. If any fail: return current verification status (agent retries)

### deleteDomain(domainId, callerWallet)
1. Ownership check
2. If stalwart_provisioned: delete Stalwart domain principal
3. Delete domain row from DB
4. Check for orphaned mailboxes on this domain — return warning (don't auto-delete)

### getDomainByDomainName(domain, callerWallet) — internal helper
Used by `createMailbox()` to validate custom domains.

## Stalwart Client Additions (`stalwart.ts`)

Four new functions using the existing `authHeaders()` and `handleResponse()` patterns:

- `createDomainPrincipal(domain: string)` → `POST /api/principal` with `{ type: "domain", name: domain }`
- `deleteDomainPrincipal(domain: string)` → `DELETE /api/principal/{domain}`
- `generateDkim(domain: string, algorithm: "RSA" | "Ed25519")` → `POST /api/dkim` with `{ id: null, algorithm, domain, selector: null }`
- `getDnsRecords(domain: string)` → `GET /api/dns/records/{domain}` — returns array of `{ type, name, content }`

## Environment Variables

No new env vars required. Uses existing `STALWART_API_URL` and `STALWART_API_CREDENTIALS`.

The mail server hostname for MX records (`mail.relay.prim.sh`) is derived from `RELAY_DEFAULT_DOMAIN` — the MX target is always `mail.{DEFAULT_DOMAIN}`.

## Integration with domain.sh (D-5)

When D-5 (mail-setup convenience endpoint) is built, the R-9 workflow can be streamlined. An agent who owns a zone on domain.sh can:

1. `POST /v1/domains` on relay.sh → get `required_records`
2. `POST /zones/{zoneId}/mail-setup` on domain.sh → creates all records in one call
3. `POST /v1/domains/:id/verify` on relay.sh → verify and provision

This is a workflow convenience, not a code dependency. relay.sh never calls domain.sh directly — the agent orchestrates between them.

## Test Assertions

### domain registration
- `registerDomain("acme.com", wallet)` → `{ ok: true, data: { status: "pending", required_records: [...] } }`
- `registerDomain("relay.prim.sh", wallet)` → `{ ok: false, code: "invalid_request" }` (reserved)
- `registerDomain("acme.com", wallet2)` after wallet1 registered → `{ ok: false, code: "domain_taken" }`
- `registerDomain("not-a-domain", wallet)` → `{ ok: false, code: "invalid_request" }`

### domain verification
- All DNS checks pass → Stalwart `createDomainPrincipal` called, `generateDkim` called twice, status → "active"
- MX missing → status stays "pending", `mx_verified: false` in response
- SPF missing → status stays "pending", `spf_verified: false`
- Stalwart provisioning fails → status stays "pending", error returned
- Already active → `{ ok: false, code: "already_verified" }`

### domain ownership
```
domain_exists | wallet_matches | result
--------------|----------------|--------
false          | n/a            | not_found
true           | false          | not_found  (don't leak)
true           | true           | success
```

### mailbox creation with custom domain
- `createMailbox({ domain: "acme.com" }, owner)` where domain is active → success, address = `{user}@acme.com`
- `createMailbox({ domain: "acme.com" }, owner)` where domain is pending → `{ ok: false, code: "domain_not_verified" }`
- `createMailbox({ domain: "acme.com" }, other_wallet)` → `{ ok: false, code: "invalid_request" }` (domain not found for this wallet)

### domain deletion
- Delete domain with no mailboxes → success, Stalwart principal deleted
- Delete domain with active mailboxes → success with `warning: "N active mailboxes on this domain"`

### DNS check module
- Mock `dns.promises.resolveMx` returning correct MX → `{ pass: true }`
- Mock `dns.promises.resolveTxt` returning SPF record containing `include:relay.prim.sh` → `{ pass: true }`
- Mock `dns.promises.resolveMx` throwing ENOTFOUND → `{ pass: false }`

## Before closing

- [ ] Run `pnpm -r check` (lint + typecheck + tests pass)
- [ ] Re-read each AC and locate the line of code that enforces it
- [ ] Verify `createMailbox()` domain guard covers all 5 rows in the decision table
- [ ] Verify both True and False paths for each DNS verification check are tested
- [ ] Verify Stalwart rollback: if DKIM generation fails after domain principal creation, domain principal is deleted
- [ ] Verify ownership checks on all domain endpoints return `not_found` (not `forbidden`) when wallet doesn't match
- [ ] Verify reserved domains cannot be registered
- [ ] Verify `dns-check.ts` uses `dns.promises` (not Cloudflare API) — works for any DNS provider
