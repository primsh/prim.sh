# D-2 through D-8: dns.sh → domain.sh — Full Domain Lifecycle Primitive

**Status:** Plan (approved scope)
**Depends on:** D-1 (dns.sh zone + record CRUD — done), D-4 (x402 middleware — done)
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
2. Domain availability search with pricing (NameSilo API)
3. Domain registration / purchase (NameSilo API, pay via x402)
4. Auto-configure Cloudflare nameservers post-registration
5. One-call mail DNS setup (MX + SPF + DMARC + DKIM from just a mail server IP)
6. DNS propagation verification endpoint
7. Batch record operations (atomic multi-record changes)

## Task Breakdown

| ID | Task | Depends on | Parallel group |
|----|------|-----------|----------------|
| D-2 | Rename dns→domain, NameSilo client, domain search endpoint | D-1 | — |
| D-3 | Domain registration endpoint | D-2 | B |
| D-5 | Mail-setup convenience endpoint | D-2 | A |
| D-6 | Verification endpoint | D-2 | A |
| D-7 | Auto-configure NS after registration | D-3 | — |
| D-8 | Batch record operations | D-2 | A |

Everything depends on D-2 (rename). After D-2, group A (D-5, D-6, D-8) and group B (D-3) can proceed in parallel. D-7 depends on D-3.

---

## Phase 1 — Rename + NameSilo Client + Search (D-2)

### 1a. Rename

- `mv packages/dns packages/domain`
- `package.json`: `@agentstack/dns` → `@agentstack/domain`
- `pnpm-workspace.yaml` if `packages/dns` is explicitly listed
- Update all cross-package imports (grep for `@agentstack/dns`)
- Health check response: `{ "service": "domain.sh", ... }`
- Env var: `DNS_DB_PATH` → `DOMAIN_DB_PATH` (keep `DNS_DB_PATH` as fallback)
- Existing zone + record CRUD routes stay unchanged at `/v1/zones/...`

### 1b. NameSilo client

Create `packages/domain/src/namesilo.ts` — thin HTTP wrapper around NameSilo's REST API.

**NameSilo API quirks the client must handle:**
- **GET-only API** — all operations are GET requests, params in query string
- **API key in URL** — `key={API_KEY}` query param on every request
- **Base URL:** `https://www.namesilo.com/api/{OPERATION}?version=1&type=json&key={KEY}&...`
- **Rate limit:** 1 req/sec/IP, max 5 concurrent connections
- **Response envelope:** `{ request: {...}, reply: { code: number, detail: string, ... } }`
- **Success codes:** 300 = success, 301 = success but NS invalid (used defaults), 302 = success but contact info issues (used defaults)
- **Credential safety:** API key is in the URL, which means it can leak into error messages, stack traces, and logs. The NameSilo client must: (1) strip `key=` from any URL before including it in error messages or `CloudflareError`-style exception objects, (2) never log the full request URL. Add a `redactUrl(url)` helper that replaces `key=...&` with `key=[REDACTED]&`.

Env vars: `NAMESILO_API_KEY` (required for registrar features, optional — domain.sh works without it for DNS-only mode)

**RegistrarProvider interface** — abstract like spawn.sh's `CloudProvider`. Lives in `packages/domain/src/registrar.ts`. NameSilo implementation in `namesilo.ts`.

```
service.ts → RegistrarProvider (interface) ← namesilo.ts (implementation)
```

The interface needs four methods: `search`, `register`, `setNameservers`, `getNameservers`. Return types are domain.sh's own types, not NameSilo's raw API shapes — the NameSilo client maps between them.

### 1c. Search endpoint

```
GET /v1/domains/search?query=prim&tlds=sh,com,dev
```

Constructs fully-qualified domain names from `query` + `tlds`, calls NameSilo `checkRegisterAvailability` (comma-delimited domains param). NameSilo returns pricing inline — no separate pricing call needed.

Response:
```json
{
  "results": [
    { "domain": "prim.sh", "available": true, "price": { "register": 34.98, "renew": 62.98, "currency": "USD" }, "premium": false },
    { "domain": "prim.com", "available": false },
    { "domain": "prim.dev", "available": false }
  ]
}
```

Route pricing: `$0.001` (cheap — encourage agents to search freely).

**Default TLDs:** If `tlds` is omitted, search `com,net,org,io,dev,sh`.

---

## Phase 2 — Registration (D-3)

### 2a. Quote endpoint

```
POST /v1/domains/quote
```

Request: `{ "domain": "prim.sh", "years": 1 }`

Calls NameSilo `checkRegisterAvailability` for the specific domain to get real-time pricing. Returns a quote with a time-limited `quote_id`.

Response:
```json
{
  "quote_id": "q_a1b2c3d4",
  "domain": "prim.sh",
  "available": true,
  "years": 1,
  "registrar_cost_usd": 34.98,
  "total_cost_usd": 39.98,
  "currency": "USD",
  "expires_at": "2026-02-25T12:30:00Z"
}
```

`total_cost_usd` = registrar cost + prim.sh margin. The `quote_id` is stored in SQLite with a 15-minute TTL. This is the exact amount the agent will pay via x402 on the register call.

Route pricing: `$0.001` (same as search — just a price check).

**Why quote→confirm:** Domain prices vary from $0.99 to $10,000+. A fixed x402 price either overcharges on cheap domains (agent pays $10 for a $0.99 domain) or undercharges on expensive ones (prim.sh eats the loss). The quote step lets the agent see the exact cost before committing real money.

### 2b. Register endpoint

```
POST /v1/domains/register
```

Request: `{ "quote_id": "q_a1b2c3d4" }`

**Dynamic pricing — application-level enforcement (not middleware):**

The register route is listed in `freeRoutes` in x402 middleware config — the middleware does not gate it. Instead, the route handler manually implements the x402 payment protocol:

1. Parse request body → extract `quote_id`
2. Look up quote from SQLite → get `total_cost_usd`
3. If quote expired → return **410** (agent must re-quote)
4. If quote not found → return **404**
5. Read `Payment` / `X-Payment` header from request
6. If no payment header → return **402** with x402-formatted response containing the quote's price (same JSON shape as middleware's 402 — agent's x402 client handles it transparently)
7. If payment header present → verify signature and amount using `@x402/core` verification utilities (`verifyPayment` or `ExactEvmScheme.verify`). Amount must match `total_cost_usd`.
8. If verification fails → return **402** (wrong amount or invalid signature)
9. If verified → proceed with registration

**Why not extend middleware:** `@x402/hono`'s `paymentMiddlewareFromConfig` takes a static `Record<string, RouteConfig>` at construction time. No per-request pricing hook. Adding one would require forking `@x402/hono` or deep-coupling middleware to domain.sh's quote concept. This is one route — application-level enforcement is simpler, more readable, and zero new abstractions.

**Reusable helper:** Extract a `verifyDynamicPayment(c: Context, priceUsd: string): Promise<VerifyResult>` function in domain.sh. If other primitives need dynamic pricing later, promote it to a shared utility.

This endpoint orchestrates three steps (after payment verification):
1. **Register at NameSilo** — `registerDomain` with `private=1`, `auto_renew=0`, no custom NS (safer — avoids code 301 silent fallback). Use NameSilo account's default contact profile.
2. **Create Cloudflare zone** — reuse existing `createZone` from service.ts
3. **Set NS at NameSilo** — `changeNameServers` to Cloudflare's assigned NS (separate call, more reliable than NS-at-registration-time)

Response:
```json
{
  "domain": "prim.sh",
  "registered": true,
  "zone_id": "z_a1b2c3d4",
  "nameservers": ["gene.ns.cloudflare.com", "rudy.ns.cloudflare.com"],
  "order_amount_usd": 39.98,
  "ns_configured": true,
  "recovery_token": null
}
```

**Registration flow decision table:**

| NameSilo register | CF zone create | NS change | Result |
|-------------------|----------------|-----------|--------|
| 300 (success)     | success        | success   | 201, full response |
| 300               | success        | fails     | 201, `ns_configured: false` (agent retries via `/v1/domains/:domain/configure-ns`) |
| 300               | fails          | skipped   | 201, `zone_id: null`, `recovery_token: "rt_..."` (agent calls `/v1/domains/recover`) |
| 261 (unavailable) | skipped        | skipped   | 400, domain not available |
| quote expired     | skipped        | skipped   | 410, quote expired — agent must re-quote |
| other error       | skipped        | skipped   | 502, registrar error |

**Key design choice:** Registration is not atomic across NameSilo + Cloudflare. If NameSilo succeeds but Cloudflare fails, the domain IS purchased — we return partial success with a `recovery_token` rather than lying.

**Auto-renew off by default.** Agent explicitly renews. No surprise charges.

### 2c. Recovery endpoint

```
POST /v1/domains/recover
```

Request: `{ "recovery_token": "rt_a1b2c3d4" }`

For when registration succeeded at NameSilo but Cloudflare zone creation or NS configuration failed. The recovery token maps to the domain + NameSilo order in SQLite. This endpoint:

1. Looks up the domain from the recovery token
2. Creates the Cloudflare zone (if `zone_id` is null)
3. Sets NS at NameSilo to Cloudflare's assigned NS (if not yet done)

**No additional x402 payment** — the agent already paid during registration. Recovery token validates ownership.

Recovery tokens are stored in a `registrations` table with columns: `recovery_token`, `domain`, `namesilo_order_id`, `zone_id` (nullable), `ns_configured` (boolean), `owner_wallet`, `created_at`. This table also serves as a persistent record of all registrations.

### 2d. NS retry endpoint

```
POST /v1/domains/:domain/configure-ns
```

For when zone creation succeeded but NS change at NameSilo failed. Reads the zone's Cloudflare NS from SQLite, calls NameSilo `changeNameServers`. Ownership check: caller wallet must own the zone.

No additional x402 payment — NS configuration is part of the original registration.

---

## Phase 3 — Mail Setup (D-5)

```
POST /v1/zones/:zone_id/mail-setup
```

Request:
```json
{
  "mail_server": "mail.relay.prim.sh",
  "mail_server_ip": "[STALWART_HOST]",
  "dkim": {
    "rsa": { "selector": "rsa", "public_key": "MIIBIjAN..." },
    "ed25519": { "selector": "ed", "public_key": "HAa8Xaz..." }
  }
}
```

Creates up to 6 records via Cloudflare batch API (or individual calls if batch isn't built yet):

| # | Type | Name | Content |
|---|------|------|---------|
| 1 | A | `mail.{domain}` | `{mail_server_ip}` |
| 2 | MX | `{domain}` | `{mail_server}` (priority 10) |
| 3 | TXT | `{domain}` | `v=spf1 a:{mail_server} -all` |
| 4 | TXT | `_dmarc.{domain}` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@{domain}; pct=100` |
| 5 | TXT | `{rsa.selector}._domainkey.{domain}` | `v=DKIM1; k=rsa; p={rsa.public_key}` |
| 6 | TXT | `{ed25519.selector}._domainkey.{domain}` | `v=DKIM1; k=ed25519; p={ed25519.public_key}` |

**Conditional records:**

| `dkim` provided | `mail_server_ip` provided | Records created |
|-----------------|--------------------------|-----------------|
| Yes (both keys) | Yes | All 6 |
| Yes (RSA only)  | Yes | 5 (no Ed25519 DKIM) |
| Yes (Ed25519 only) | Yes | 5 (no RSA DKIM) |
| No              | Yes | 4 (A + MX + SPF + DMARC) |
| No              | No  | 400 error — at minimum need `mail_server_ip` |

**Idempotent — content-aware matching:** Simple type+name matching is too broad for TXT records (a domain can have multiple valid TXT records at the same name — SPF, site verification, etc.). Match rules per record type:

| Record | Match on | Rationale |
|--------|----------|-----------|
| A `mail.{domain}` | type + name | One A record per mail host |
| MX `{domain}` | type + name + priority | One MX at priority 10 |
| TXT SPF | type + name + content starts with `v=spf1` | Won't clobber other TXT at same name |
| TXT DMARC | type + name (`_dmarc.{domain}`) | Unique subdomain, safe |
| TXT DKIM | type + name (`{selector}._domainkey.{domain}`) | Unique subdomain per selector, safe |

For each record: fetch existing via `listDnsRecords` with type+name filter, apply the match rule. If match found → update. If no match → create. This prevents overwriting unrelated TXT records (e.g., Google site verification) that share the same domain name.

Route pricing: `$0.005`.

---

## Phase 4 — Verification (D-6)

```
GET /v1/zones/:zone_id/verify
```

Queries live DNS (not Cloudflare API) to check whether records have propagated. Two things to verify:

1. **Nameservers** — `dig NS {domain}` against root servers, compare to Cloudflare's assigned NS
2. **Records** — for each record in the zone (from SQLite), `dig {type} {name}` against the zone's authoritative NS, compare to expected content

Response:
```json
{
  "domain": "prim.sh",
  "nameservers": {
    "expected": ["gene.ns.cloudflare.com", "rudy.ns.cloudflare.com"],
    "actual": ["gene.ns.cloudflare.com", "rudy.ns.cloudflare.com"],
    "propagated": true
  },
  "records": [
    { "type": "A", "name": "prim.sh", "expected": "[STALWART_HOST]", "actual": "[STALWART_HOST]", "propagated": true },
    { "type": "MX", "name": "prim.sh", "expected": "mail.relay.prim.sh", "actual": null, "propagated": false }
  ],
  "all_propagated": false
}
```

**DNS resolution approach:** Create a **new `dns.Resolver()` instance per request** (not the global `dns.resolve*` functions). Call `resolver.setServers([authoritative_ns_ip])` on the instance. This is critical for concurrency — the global resolver's server list is process-wide, so concurrent verify requests would race on `setServers()`. Per-request `Resolver` instances are isolated.

Query the zone's authoritative NS directly (from Cloudflare's assigned nameservers), not recursive resolvers — this gives accurate propagation status without caching artifacts.

**Resolver IP lookup:** Cloudflare's assigned nameservers are hostnames (e.g., `gene.ns.cloudflare.com`). `Resolver.setServers()` requires IP addresses. Resolve the NS hostnames to IPs first using the system resolver (`dns.resolve4`), then create the per-request resolver with those IPs.

**Record type → resolver method mapping:**

| Record type | `dns.Resolver` method | Return value | Compare to `content` |
|-------------|----------------------|--------------|---------------------|
| A | `resolve4(name)` | `string[]` (IPs) | Direct string match |
| AAAA | `resolve6(name)` | `string[]` (IPs) | Direct string match |
| CNAME | `resolveCname(name)` | `string[]` (targets) | Direct string match |
| MX | `resolveMx(name)` | `{ priority, exchange }[]` | Match `exchange` to content, `priority` to priority field |
| TXT | `resolveTxt(name)` | `string[][]` (chunks) | Join chunks per record (`chunks.join('')`), then match content |
| NS | `resolveNs(name)` | `string[]` (nameservers) | Direct string match |
| SRV | `resolveSrv(name)` | `{ name, port, priority, weight }[]` | Match all fields |
| CAA | `resolveCaa(name)` | `{ critical, isdomain, issue, issuewild, iodef }` | Match tag + value |

**TXT record gotcha:** DNS returns TXT records as arrays of 255-byte chunks (per RFC 4408). A single logical TXT record like an SPF string may be split across multiple chunks. Always join chunks before comparing: `record.join('')`.

**Multi-value records:** A, AAAA, MX, TXT, NS can return multiple values. A record is "propagated" if `content` appears anywhere in the returned array — it's a set membership check, not an exact-array match.

**Error handling per record:**

| Condition | `propagated` value | `actual` value |
|-----------|-------------------|----------------|
| Resolver returns result matching content | `true` | The matching value |
| Resolver returns result NOT matching content | `false` | First returned value (shows what's there instead) |
| `ENOTFOUND` / `ENODATA` (record doesn't exist yet) | `false` | `null` |
| `ETIMEOUT` / `ECONNREFUSED` (NS unreachable) | `false` | `"error:timeout"` or `"error:unreachable"` |

**Timeout:** Set `resolver.setLocalAddress()` is not needed, but set a per-query timeout. Bun's `dns.Resolver` inherits from Node's — use `resolver.resolve4(name, { ttl: false })` and wrap in `Promise.race` with a 5-second timeout. Don't let one slow record block the entire verify response.

**Concurrency within a request:** Resolve all records in parallel (`Promise.allSettled`), not sequentially. A zone with 20 records shouldn't take 20 × 5s worst case.

**Partial verification:** Only checks records stored in domain.sh's SQLite. Records created outside domain.sh won't be verified.

Route pricing: `$0.001`.

---

## Phase 5 — Batch Records (D-8)

```
POST /v1/zones/:zone_id/records/batch
```

Request:
```json
{
  "create": [
    { "type": "A", "name": "www", "content": "198.51.100.4", "ttl": 3600 },
    { "type": "TXT", "name": "@", "content": "v=spf1 a -all", "ttl": 3600 }
  ],
  "update": [
    { "id": "r_x1y2z3", "content": "198.51.100.5" }
  ],
  "delete": [
    { "id": "r_a1b2c3" }
  ]
}
```

**Cloudflare batch API mapping:**

Cloudflare's batch endpoint uses different key names than our API:

| domain.sh key | Cloudflare key | CF required fields |
|---------------|---------------|-------------------|
| `create` | `posts` | `name`, `type`, `content` |
| `update` | `patches` | `id` + changed fields only (partial update) |
| `delete` | `deletes` | `id` only |

Execution order (fixed by Cloudflare): `deletes` → `patches` → `puts` → `posts`.

We use `patches` (not `puts`) for updates because agents send partial updates (just the fields that changed). `puts` would require all fields and reset unspecified ones to defaults.

**Cloudflare batch request format:**
```json
{
  "deletes": [{ "id": "cf-record-id-here" }],
  "patches": [{ "id": "cf-record-id-here", "content": "198.51.100.5" }],
  "posts": [{ "name": "www", "type": "A", "content": "198.51.100.4", "ttl": 3600 }]
}
```

**Limit:** 200 operations per batch on Cloudflare free plan.

**ID translation:** Agent sends domain.sh IDs (`r_x1y2z3`). The batch handler must:
1. Look up each `r_` ID in SQLite → get the corresponding `cloudflare_id`
2. Build the CF batch request using `cloudflare_id` values
3. Map CF response back to domain.sh IDs

For `create` (CF `posts`): response arrays are in the same order as request arrays. Zip by index to get the newly assigned `cloudflare_id` for each created record, then generate a domain.sh `r_` ID and insert into SQLite.

**SQLite consistency strategy:**

| Step | Action | On failure |
|------|--------|-----------|
| 1 | Validate all IDs exist and caller owns the zone | Return 400/403/404 before any side effects |
| 2 | Call Cloudflare batch API | If CF fails → return 502, no SQLite changes (CF is atomic at DB level) |
| 3 | CF succeeds → apply SQLite changes in a transaction | If SQLite transaction fails → log critical error, return 500. State is inconsistent (CF changed, SQLite didn't). This is a bug, not a normal flow. |

**Key insight:** Cloudflare is the source of truth. If step 3 fails (SQLite write error after CF succeeds), the records exist in Cloudflare but not in domain.sh's DB. This is a rare edge case (SQLite write failures are unusual). The verify endpoint (D-6) would not see these records. Acceptable for v1 — a reconciliation job can fix it later if needed.

**Validation before calling Cloudflare:**
- All `update` and `delete` IDs must exist in SQLite and belong to this zone
- All `create` entries must have valid `type`, `name`, `content`
- MX `create` entries must include `priority`
- Total operations (create + update + delete) must not exceed 200

Add `batchDnsRecords` to `cloudflare.ts` wrapping `POST /zones/{zone_id}/dns_records/batch`.

Response:
```json
{
  "created": [{ "id": "r_new1", "type": "A", "name": "www.example.com", "content": "198.51.100.4" }],
  "updated": [{ "id": "r_x1y2z3", "content": "198.51.100.5" }],
  "deleted": [{ "id": "r_a1b2c3" }]
}
```

Route pricing: `$0.005`.

---

## Phase 6 — NS Auto-Configure (D-7)

Not a separate endpoint — this is logic inside the D-3 registration flow. After `registerDomain` succeeds at NameSilo and `createZone` succeeds at Cloudflare, call NameSilo's `changeNameServers` with Cloudflare's assigned NS.

Implemented as part of D-3. Broken out as D-7 in TASKS.md for tracking, but ships with D-3.

---

## Files changed

| File | Action | Phase |
|------|--------|-------|
| `packages/dns/` → `packages/domain/` | **Rename** directory | D-2 |
| `packages/domain/package.json` | **Modify** — rename package, add env vars | D-2 |
| `packages/domain/src/index.ts` | **Modify** — health check name, new route imports | D-2 |
| `packages/domain/src/registrar.ts` | **Create** — RegistrarProvider interface + types | D-2 |
| `packages/domain/src/namesilo.ts` | **Create** — NameSilo API client (implements RegistrarProvider) | D-2 |
| `packages/domain/src/api.ts` | **Modify** — add search, register, mail-setup, verify, batch types | D-2+ |
| `packages/domain/src/service.ts` | **Modify** — add search, register, mail-setup, verify, batch logic | D-2+ |
| `packages/domain/src/cloudflare.ts` | **Modify** — add `batchDnsRecords`, `listDnsRecords` with filters | D-8 |
| `packages/domain/src/db.ts` | **Modify** — add `registrations` + `quotes` tables, batch insert/update/delete helpers | D-3, D-8 |
| `packages/domain/test/dns.test.ts` → `domain.test.ts` | **Rename + extend** | D-2+ |
| `pnpm-workspace.yaml` | **Modify** if dns is explicitly listed | D-2 |
| `site/dns/` → `site/domain/` | **Rename** landing page | D-2 |
| Any file importing `@agentstack/dns` | **Modify** imports | D-2 |

## Design decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Rename dns.sh → domain.sh | Yes | "DNS" is too narrow. Agent sees one primitive for search/register/DNS/verify. |
| Registrar | NameSilo | Zero-friction API access, cheapest wholesale, free WHOIS privacy, .sh TLD support |
| RegistrarProvider interface | Abstract like spawn.sh | Registrar is swappable. Dynadot or Namecheap can be added later. |
| GET-only NameSilo API | Accepted, with URL redaction | Quirky but workable. `redactUrl()` strips API key from errors/logs. |
| Register then change NS (two calls) | Yes | Passing NS at registration time silently falls back to NameSilo defaults if any NS is invalid (code 301). Two-step is reliable. |
| WHOIS privacy | On by default (`private=1`) | Agents don't want their operator's contact info public. Free on NameSilo. |
| Auto-renew | Off by default (`auto_renew=0`) | Agent explicitly renews. No surprise charges. |
| Contact info | Account default profile | Agent shouldn't need to pass contact details. NameSilo account is pre-configured. |
| Registration pricing | Quote→confirm (two-step) | Domain prices range $0.99–$10k+. Fixed pricing either overcharges cheap domains or loses money on expensive ones. Quote gives exact cost upfront. |
| Dynamic pricing enforcement | Application-level, not middleware | x402 middleware is static (`paymentMiddlewareFromConfig` takes fixed route prices). Register route is `freeRoutes`, handler manually implements 402 challenge with quote's price. One route doesn't justify a middleware abstraction. |
| Registration not atomic | Correct, with recovery path | NameSilo + Cloudflare are independent. Return `recovery_token` if CF fails after purchase. Agent calls `/recover` to retry CF setup. |
| Mail-setup idempotent | Content-aware matching per record type | Type+name alone is too broad for TXT records. SPF matches on `v=spf1` prefix, DKIM/DMARC use unique subdomains. Won't clobber unrelated TXT records. |
| Verification resolver | Per-request `dns.Resolver()` instance | Global `dns.resolve*` shares server list process-wide — unsafe under concurrency. Per-request instance isolates `setServers()`. |
| Batch records | All-or-nothing | Matches Cloudflare batch semantics. SQLite changes in transaction. |
| DNS-only mode | Works without NAMESILO_API_KEY | Zone + record CRUD doesn't need registrar. Search/register return 503 if key missing. |

## Env vars

| Var | Required | Default | Used by |
|-----|----------|---------|---------|
| `DOMAIN_DB_PATH` | No | `./domain.db` | All (SQLite) |
| `DNS_DB_PATH` | No | fallback for `DOMAIN_DB_PATH` | Backwards compat |
| `CLOUDFLARE_API_TOKEN` | Yes | — | Zone + record CRUD |
| `CLOUDFLARE_ACCOUNT_ID` | Yes | — | Zone creation |
| `NAMESILO_API_KEY` | No | — | Search + register (503 if missing) |

## Before closing

- [ ] `packages/dns` fully renamed to `packages/domain`, no stale references anywhere
- [ ] Existing D-1 zone + record CRUD tests still pass after rename
- [ ] Health check returns `{ "service": "domain.sh", ... }`
- [ ] Search endpoint returns availability + pricing from NameSilo
- [ ] Search with missing `NAMESILO_API_KEY` returns 503
- [ ] Quote endpoint returns real-time pricing with time-limited `quote_id`
- [ ] Register endpoint requires valid, non-expired `quote_id`
- [ ] Register route is in `freeRoutes` (middleware does not gate it)
- [ ] Register handler returns correct x402-formatted 402 response when no payment header present
- [ ] Register handler verifies payment amount matches quote's `total_cost_usd` (not a static value)
- [ ] Register handler rejects payment with wrong amount (returns 402, not 200)
- [ ] Register: NameSilo purchase → CF zone → NS change, returns zone_id
- [ ] Register: partial failure returns `recovery_token` (not a silent error)
- [ ] Recovery endpoint retries CF zone + NS from recovery token, no additional payment
- [ ] NS retry endpoint (`/configure-ns`) retries NS change for existing zones
- [ ] `auto_renew=0` and `private=1` on every NameSilo registration
- [ ] NameSilo client: `redactUrl()` strips API key from all error messages and logs
- [ ] Mail-setup creates correct records idempotently (content-aware matching, not just type+name)
- [ ] Mail-setup without DKIM → creates 4 records, not 6
- [ ] Mail-setup does NOT overwrite unrelated TXT records at the same name
- [ ] Verify uses per-request `dns.Resolver()` instance (not global resolver)
- [ ] Verify queries authoritative NS, not cached resolvers
- [ ] Verify returns per-record propagation status
- [ ] Batch operations are all-or-nothing (SQLite transaction + CF batch)
- [ ] x402 middleware gates all new endpoints with correct pricing (except register — app-level enforcement via `freeRoutes`)
- [ ] For every boolean condition, verify both True and False paths are covered by tests
