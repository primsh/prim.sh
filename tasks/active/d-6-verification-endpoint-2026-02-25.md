# D-6: Verification Endpoint (NS + Record Propagation Checks)

**Status:** Plan
**Depends on:** D-2 (done)
**Blocks:** Nothing (standalone utility endpoint)

## Context

After an agent configures DNS via domain.sh (zone creation, mail-setup, batch records), it needs to know when those changes are live. Cloudflare propagation typically takes seconds but NS changes at registrars can take 24–48 hours. Without a verification endpoint, agents blindly poll with `dig` or wait arbitrary durations.

## Goal

`GET /v1/zones/:zone_id/verify` — queries live DNS (not Cloudflare API) for each record in the zone and reports propagation status.

## Endpoint

```
GET /v1/zones/:zone_id/verify
```

Response shape:
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

Route pricing: `$0.001`.

## Architecture

### Dependency direction

```
index.ts → service.ts (verifyZone) → dns-verify.ts (new) → node:dns/promises
                                    → db.ts (getRecordsByZone, getZoneById)
```

DNS resolution logic lives in a **new file `dns-verify.ts`**, not in `service.ts`. Reasons:
- `service.ts` orchestrates ownership + DB + CF calls — DNS resolution is a different concern
- `dns-verify.ts` is independently testable with mocked resolvers
- Keeps `service.ts` from growing unboundedly

### `dns-verify.ts` exports

Two functions:

1. `verifyNameservers(domain: string, expected: string[]): Promise<NsVerifyResult>`
2. `verifyRecords(records: RecordRow[], authoritativeNsIps: string[]): Promise<RecordVerifyResult[]>`

`service.ts` calls both and assembles the response.

## DNS Resolution Strategy

### Per-request Resolver

Use `new dns.promises.Resolver()` per request. **Not** the global `dns.resolve*()`.

```
import { Resolver } from "node:dns/promises"
```

The global resolver's server list is process-wide — concurrent verify requests would race on `setServers()`. Per-request `Resolver` instances are isolated.

Verified: Bun supports `dns.promises.Resolver` with `setServers()`, `resolve4`, `resolve6`, `resolveNs`, `resolveMx`, `resolveTxt`, `resolveCname`, `resolveSrv`, `resolveCaa`.

### NS verification flow

1. Create system resolver (default servers — recursive resolvers)
2. `resolver.resolveNs(domain)` → get actual NS hostnames
3. Compare to `expected` (from zone row's `nameservers` column, stored as JSON array)
4. Return `{ expected, actual, propagated }` where `propagated = sets are equal (case-insensitive, order-independent)`

### Authoritative NS IP lookup

Before verifying records, resolve the zone's expected NS hostnames to IPs:

1. Read expected NS from zone row (`JSON.parse(row.nameservers)`)
2. For each NS hostname, `systemResolver.resolve4(hostname)` → get IP
3. Collect all IPs into a flat array
4. If no IPs resolve → return all records as `propagated: false, actual: "error:ns_unresolvable"`

### Record verification flow

1. Create authoritative resolver: `new Resolver()` → `setServers(authoritativeNsIps)`
2. For each record in SQLite: call the appropriate resolver method, compare result to `content`
3. Return per-record `{ type, name, expected, actual, propagated }`

### Record type → resolver method mapping

| Record type | Resolver method | Return shape | Compare logic |
|-------------|----------------|--------------|--------------|
| A | `resolve4(name)` | `string[]` | `content` in array |
| AAAA | `resolve6(name)` | `string[]` | `content` in array |
| CNAME | `resolveCname(name)` | `string[]` | `content` in array |
| MX | `resolveMx(name)` | `{ priority, exchange }[]` | `exchange === content` AND `priority === record.priority` |
| TXT | `resolveTxt(name)` | `string[][]` | Join each inner array (`chunks.join('')`), then check if `content` is in the joined set |
| NS | `resolveNs(name)` | `string[]` | `content` in array |
| SRV | `resolveSrv(name)` | `{ name, port, priority, weight }[]` | Match entire content string (SRV records stored as single content string by CF) |
| CAA | `resolveCaa(name)` | `{ critical, issue?, issuewild?, iodef? }[]` | Match tag+value from content (CF stores as `0 issue "letsencrypt.org"`) |

**TXT chunk gotcha:** DNS returns TXT records as arrays of 255-byte chunks per RFC 4408. Join before comparing: `chunks.join('')`. This is the most common source of false "not propagated" bugs.

**Multi-value records:** A, AAAA, MX, TXT, NS can return multiple values. Propagation check is **set membership** — `content` appears anywhere in the returned values. Not an exact-array match.

### Error handling per record

| Condition | `propagated` | `actual` |
|-----------|-------------|----------|
| Resolver returns result matching content | `true` | The matching value |
| Resolver returns result NOT matching content | `false` | First returned value (shows what's there) |
| `ENOTFOUND` / `ENODATA` (record doesn't exist yet) | `false` | `null` |
| `ETIMEOUT` / `ECONNREFUSED` (NS unreachable) | `false` | `"error:timeout"` or `"error:unreachable"` |
| Any other error | `false` | `"error:dns_error"` |

Decision table for the error-code → actual-value mapping:

```
error.code     | actual value
---------------|---------------------------
ENOTFOUND      | null
ENODATA        | null
ETIMEOUT       | "error:timeout"
ECONNREFUSED   | "error:unreachable"
other          | "error:dns_error"
```

### Timeout and concurrency

- **Per-query timeout:** Wrap each resolver call in `Promise.race` with a 5-second deadline. One slow record must not block the entire response.
- **Parallel resolution:** Use `Promise.allSettled` for all records simultaneously. A zone with 20 records resolves in ~5s worst case, not 100s.
- **NS IP lookup:** Also parallel (`Promise.allSettled` across all NS hostnames).

## Files changed

| File | Action | What |
|------|--------|------|
| `packages/domain/src/dns-verify.ts` | **Create** | `verifyNameservers()`, `verifyRecords()`, resolver method dispatch, error mapping, timeout wrapper |
| `packages/domain/src/api.ts` | **Modify** | Add `VerifyResponse`, `NsVerifyResult`, `RecordVerifyResult` types |
| `packages/domain/src/service.ts` | **Modify** | Add `verifyZone()` — ownership check, read zone + records from DB, call dns-verify functions, assemble response |
| `packages/domain/src/index.ts` | **Modify** | Add `GET /v1/zones/:zone_id/verify` route, add route to `DOMAIN_ROUTES` |
| `packages/domain/test/domain.test.ts` | **Modify** | Add verify tests |

## API types (add to api.ts)

```
NsVerifyResult: { expected: string[], actual: string[], propagated: boolean }
RecordVerifyResult: { type: RecordType, name: string, expected: string, actual: string | null, propagated: boolean }
VerifyResponse: { domain: string, nameservers: NsVerifyResult, records: RecordVerifyResult[], all_propagated: boolean }
```

## Testing strategy

DNS resolution must be mocked — tests cannot depend on real DNS. Mock `node:dns/promises` `Resolver` class.

### Mock approach

`vi.mock("node:dns/promises")` — mock the `Resolver` constructor to return an object with controlled method responses. Tests configure per-method return values before calling `verifyZone()`.

### Test assertions

**NS verification:**
- `assert verifyZone result.nameservers.propagated === true` when mocked `resolveNs` returns exact expected NS set
- `assert verifyZone result.nameservers.propagated === false` when mocked `resolveNs` returns different NS
- `assert verifyZone result.nameservers.propagated === true` when NS returned in different order than expected (order-independent)
- `assert verifyZone result.nameservers.actual` is `["error:timeout"]` when `resolveNs` rejects with `ETIMEOUT`

**Record verification:**
- `assert result.records[0].propagated === true` when A record content matches one of the `resolve4` results
- `assert result.records[0].propagated === false` when A record content not in `resolve4` results
- `assert result.records[0].actual === null` when `resolve4` rejects with `ENOTFOUND`
- `assert result.records[0].actual === "error:timeout"` when `resolve4` rejects with `ETIMEOUT`
- `assert result.records[0].actual === "error:unreachable"` when `resolve4` rejects with `ECONNREFUSED`

**TXT chunk joining:**
- `assert result.records[0].propagated === true` when `resolveTxt` returns `[["v=spf1 ", "a:mail.example.com -all"]]` and content is `"v=spf1 a:mail.example.com -all"` (chunks joined)
- `assert result.records[0].propagated === false` when `resolveTxt` returns `[["v=spf1 old -all"]]` and content is `"v=spf1 a:mail.example.com -all"`

**MX matching:**
- `assert result.records[0].propagated === true` when `resolveMx` returns `[{ priority: 10, exchange: "mail.example.com" }]` and record content is `"mail.example.com"` with priority 10
- `assert result.records[0].propagated === false` when MX exchange matches but priority differs

**all_propagated:**
- `assert result.all_propagated === true` when NS and all records are propagated
- `assert result.all_propagated === false` when any single record is not propagated

**Ownership / zone checks:**
- `assert result.ok === false && result.status === 403` when non-owner calls verify
- `assert result.ok === false && result.status === 404` when zone doesn't exist
- Zone with no records → returns empty `records` array, `all_propagated` based on NS only

**NS IP lookup failure:**
- When NS hostnames can't be resolved to IPs, all records should have `actual: "error:ns_unresolvable"`, `propagated: false`

## Inversion-prone logic

**NS comparison is set equality, not array equality.** `["ns1.cf.com", "ns2.cf.com"]` equals `["ns2.cf.com", "ns1.cf.com"]`. Comparison must sort both arrays and use case-insensitive matching. Test both orderings.

**TXT joining is per-record, not per-response.** `resolveTxt` returns `string[][]` — outer array is multiple TXT records, inner array is chunks of one record. Join inner arrays, then match content against the set of joined strings. Not: join everything into one big string.

**Trailing dot normalization.** DNS responses sometimes include trailing dots on hostnames (e.g., `"mail.example.com."`). Strip trailing dots before comparison. Applies to: NS hostnames, CNAME targets, MX exchanges.

## Before closing

- [ ] `GET /v1/zones/:zone_id/verify` returns correct response shape
- [ ] NS verification: order-independent, case-insensitive comparison
- [ ] Per-request `dns.promises.Resolver()` — not global resolver
- [ ] Queries authoritative NS, not recursive resolvers (for record checks)
- [ ] TXT chunks joined before comparison (`chunks.join('')`)
- [ ] MX comparison checks both exchange AND priority
- [ ] Multi-value records use set membership, not exact-array match
- [ ] Error codes mapped correctly: ENOTFOUND→null, ETIMEOUT→"error:timeout", ECONNREFUSED→"error:unreachable"
- [ ] 5-second per-query timeout via `Promise.race`
- [ ] All records resolved in parallel via `Promise.allSettled`
- [ ] `all_propagated` is false if any record OR nameservers not propagated
- [ ] Trailing dots stripped from DNS response hostnames
- [ ] Ownership check (403) and missing zone (404) work
- [ ] Zone with no records returns empty records array
- [ ] Route pricing: $0.001
- [ ] For every boolean condition, verify both True and False paths are covered by tests
