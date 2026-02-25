# D-2 through D-7: dns.sh → domain.sh — Full Domain Lifecycle Primitive

**Status:** Plan
**Depends on:** D-1 (dns.sh zone + record CRUD — done)
**Blocks:** R-2 completion (mail domain setup), all future primitives needing domains

## Context

During R-2 (Stalwart mail setup), we hit every pain point an agent would face acquiring and configuring a domain:

1. **Domain search** — unreliable `whois` checks, no batch availability, no pricing
2. **Domain purchase** — GUI-only checkout flow, upsell gauntlet, contact forms
3. **Nameserver config** — GUI-only at registrar, API locked behind spend thresholds
4. **Mail DNS setup** — 8 records to manually create and coordinate between Stalwart + Cloudflare
5. **Propagation waiting** — blind polling with `dig`, no status API

An agent should be able to go from "I need email" to "email is working" in two API calls. domain.sh makes that possible.

## Goals

1. Rename `packages/dns` → `packages/domain`, rebrand dns.sh → domain.sh
2. Domain availability search with pricing (wrap registrar API)
3. Domain registration / purchase (wrap registrar API, pay via x402)
4. Auto-configure Cloudflare nameservers post-registration
5. One-call mail DNS setup (MX + SPF + DMARC + DKIM from just a mail server IP)
6. DNS propagation verification endpoint

## Task Breakdown

| ID | Task | Depends on |
|----|------|-----------|
| D-2 | Rename dns.sh → domain.sh, add domain search endpoint | D-1 |
| D-3 | Domain registration endpoint | D-2 |
| D-5 | Mail-setup convenience endpoint | D-1 |
| D-6 | Verification endpoint | D-1 |
| D-7 | Auto-configure NS after registration | D-3 |

D-5 and D-6 are independent of the registrar work (D-2/D-3/D-7) and can proceed in parallel.

## Phase 1 — Rename + Search (D-2)

### Rename

- `mv packages/dns packages/domain`
- Update `package.json`: `@agentstack/dns` → `@agentstack/domain`
- Update `pnpm-workspace.yaml` if needed
- Update all imports in existing code
- Existing zone + record CRUD routes stay unchanged

### Search endpoint

```
GET /domains/search?query=prim&tlds=sh,com,dev
```

Response:
```json
{
  "results": [
    { "domain": "prim.sh", "available": true, "price": { "register": 34.98, "renew": 62.98, "currency": "USD" } },
    { "domain": "prim.com", "available": false },
    { "domain": "prim.dev", "available": false }
  ]
}
```

**Registrar backend:** Namecheap API is ideal (search + register + NS config in one API) but requires $50+ spend for API access. Alternatives:

| Registrar | Search API | Register API | NS API | Min spend for API |
|-----------|-----------|-------------|--------|-------------------|
| Namecheap | `domains.check` | `domains.create` | `domains.dns.setCustom` | $50 |
| Dynadot | `search` | `register` | `set_ns` | None (API key on signup) |
| NameSilo | `checkRegisterAvailability` | `registerDomain` | `changeNameServers` | None |

**Recommendation:** NameSilo or Dynadot for zero-friction API access. Wrap behind a `RegistrarProvider` interface (like spawn.sh's `CloudProvider`) so the registrar is swappable.

### RegistrarProvider interface

```typescript
interface RegistrarProvider {
  search(query: string, tlds: string[]): Promise<DomainSearchResult[]>
  register(domain: string, years: number, contact: ContactInfo): Promise<DomainRegistration>
  setNameservers(domain: string, nameservers: string[]): Promise<void>
  getNameservers(domain: string): Promise<string[]>
}
```

**Dependency direction:** `service.ts` → `RegistrarProvider` (interface) ← `dynadot.ts` / `namesilo.ts` (implementations). Same pattern as spawn.sh providers.

## Phase 2 — Registration (D-3)

```
POST /domains/register
{
  "domain": "prim.sh",
  "years": 1,
  "contact": { ... }  // optional, use account defaults
}
```

Response:
```json
{
  "domain": "prim.sh",
  "registered": true,
  "expires": "2027-02-25",
  "nameservers": ["gene.ns.cloudflare.com", "rudy.ns.cloudflare.com"]
}
```

This endpoint:
1. Calls registrar API to purchase domain
2. Creates Cloudflare zone via existing zone CRUD
3. Sets nameservers at registrar to Cloudflare's assigned NS (D-7)
4. Returns the Cloudflare zone ID for subsequent record operations

**Payment:** The registration cost is paid by the agent via x402 (prim.sh marks up the registrar cost). The registrar account is funded by prim.sh's operator account — agent never interacts with the registrar.

## Phase 3 — Mail Setup (D-5)

```
POST /zones/{zoneId}/mail-setup
{
  "mail_server_ip": "[STALWART_HOST]",
  "domain": "relay.prim.sh",
  "dkim": {
    "rsa_public_key": "MIIBIjAN...",
    "ed25519_public_key": "HAa8Xaz..."
  }
}
```

Creates all 6 records in one call:
- `A mail.{domain}` → mail_server_ip
- `MX {domain}` → `mail.{domain}` (priority 10)
- `TXT {domain}` → `v=spf1 a:mail.{domain} -all`
- `TXT _dmarc.{domain}` → `v=DMARC1; p=quarantine; rua=mailto:dmarc@{domain}; pct=100`
- `TXT rsa._domainkey.{domain}` → DKIM RSA record
- `TXT ed._domainkey.{domain}` → DKIM Ed25519 record

If `dkim` is omitted, skip DKIM records (caller can add later after generating keys on mail server).

**Idempotent:** If records already exist, update them. Don't fail on duplicates.

## Phase 4 — Verification (D-6)

```
GET /zones/{zoneId}/verify
```

Response:
```json
{
  "nameservers": { "expected": ["gene.ns.cloudflare.com", "rudy.ns.cloudflare.com"], "actual": ["gene.ns.cloudflare.com", "rudy.ns.cloudflare.com"], "propagated": true },
  "records": [
    { "type": "A", "name": "prim.sh", "expected": "[STALWART_HOST]", "actual": "[STALWART_HOST]", "propagated": true },
    { "type": "MX", "name": "relay.prim.sh", "expected": "mail.relay.prim.sh", "actual": null, "propagated": false },
    ...
  ],
  "all_propagated": false
}
```

Queries authoritative DNS (not cached resolvers) and compares against Cloudflare zone records. Agent can poll this until `all_propagated: true`.

## Files changed

| File | Action |
|------|--------|
| `packages/dns/` → `packages/domain/` | **Rename** directory |
| `packages/domain/package.json` | **Modify** — rename package |
| `packages/domain/src/registrar.ts` | **Create** — RegistrarProvider interface |
| `packages/domain/src/dynadot.ts` or `namesilo.ts` | **Create** — registrar implementation |
| `packages/domain/src/api.ts` | **Modify** — add search, register, mail-setup, verify routes |
| `packages/domain/src/service.ts` | **Modify** — add search, register, mail-setup, verify logic |
| `packages/domain/src/cloudflare.ts` | **Modify** — minor (already has zone + record CRUD) |
| `pnpm-workspace.yaml` | **Modify** if dns is explicitly listed |

## Design decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Rename dns.sh → domain.sh | Yes | Agent sees one primitive for all domain operations. "DNS" is too narrow for search/register/verify. |
| Registrar provider interface | Abstract like spawn.sh | Registrar is swappable. Start with cheapest no-friction-API option. |
| Registration auto-configures NS | Yes | Agent shouldn't need a separate call. Buy → ready-for-records in one step. |
| Mail-setup is zone-level, not domain-level | Zone ID scoped | Consistent with existing record CRUD. Works for subdomains too (relay.prim.sh). |
| DKIM optional in mail-setup | Yes | Caller may not have keys yet (need to generate on mail server first). |

## Before closing

- [ ] `packages/dns` fully renamed to `packages/domain`, no stale references
- [ ] Existing D-1 zone + record CRUD tests still pass after rename
- [ ] Search endpoint returns accurate availability + pricing
- [ ] Register endpoint creates domain + Cloudflare zone + sets NS in one call
- [ ] Mail-setup creates all 6 records idempotently
- [ ] Verify endpoint queries authoritative NS, not cached resolvers
- [ ] x402 middleware gates all new endpoints
