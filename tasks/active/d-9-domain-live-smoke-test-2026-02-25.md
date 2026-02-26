# D-9: domain.sh Live Smoke Test

**Goal:** Validate domain.sh against real Cloudflare (and optionally NameSilo) APIs. Same pattern as SP-8 (spawn) and SE-2 (search): provider-direct calls, skip gracefully when env vars are missing, afterAll cleanup.

**File:** `packages/domain/test/smoke-live.test.ts`

## Env Vars

| Var | Required | Purpose |
|-----|----------|---------|
| `CLOUDFLARE_API_TOKEN` | Yes (skip suite if missing) | CF API Bearer token |
| `CLOUDFLARE_ACCOUNT_ID` | Yes | CF account for zone creation |
| `NAMESILO_API_KEY` | No (skip registration tests) | NameSilo registrar API |

Guard: `const HAS_CF = !!process.env.CLOUDFLARE_API_TOKEN && !!process.env.CLOUDFLARE_ACCOUNT_ID`

Registration tests get a second guard: `const HAS_REGISTRAR = !!process.env.NAMESILO_API_KEY`

## Test Domain

Use a throwaway domain that won't collide with real infrastructure. Pattern: `smoke-<random8hex>.test` for zone creation (CF accepts any domain string in "full" setup mode — zone will sit in `pending` status since we don't own the TLD, which is fine for CRUD testing). For registration tests, the user's instructions say "if test registrar available" — NameSilo sandbox mode or a cheap `.xyz` domain could work, but **registration tests should be opt-in and clearly flagged as costing real money** if no sandbox exists.

Decision: Use `smoke-<hex>.example` for Cloudflare zone CRUD (free, no real domain needed). Skip `register()` unless a `SMOKE_REGISTER_DOMAIN` env var is explicitly set (prevents accidental domain purchases).

## Test Structure

Sequential numbered tests. Shared state passes IDs forward. `afterAll` cleans up zone (and all records cascade).

### Phase 1: Cloudflare Zone + Record CRUD (always runs with CF creds)

```
0. preflight — requireEnv, import cloudflare.ts functions
1. createZone — create zone for smoke-<hex>.example, assert CfZone fields (id, name, status, name_servers)
2. listDnsRecords — list records on new zone, expect empty array (or CF default records)
3. createDnsRecord — A record (smoke-a.smoke-<hex>.example → 93.184.216.34), assert CfDnsRecord fields
4. createDnsRecord — MX record (priority 10), assert priority field
5. listDnsRecords — expect 2+ records, find our A record by name
6. getDnsRecord — fetch the A record by id, assert content matches
7. updateDnsRecord — change A record content to 198.51.100.1, assert updated content
8. batchDnsRecords — batch create TXT + delete MX, assert batch result (posts.length=1, deletes.length=1)
9. deleteZone — delete zone, assert no error
```

### Phase 2: Service-layer integration (uses service.ts with in-memory SQLite)

```
10. createZone (service) — call service.createZone(), assert ServiceResult ok + ZoneResponse shape
11. createRecord (service) — A record via service, assert RecordResponse shape
12. mailSetup (service) — call mailSetup(), assert records created (MX, SPF TXT, DMARC TXT)
13. verifyZone (service) — call verifyZone(), assert VerifyResponse shape (nameservers.propagated may be false for .example — that's fine, just check the shape)
14. batchRecords (service) — batch create AAAA + delete the A from test 11, assert BatchRecordsResponse
15. deleteZone (service) — cascade delete, assert ok
```

### Phase 3: Domain search (NameSilo — optional)

```
16. searchDomains — search "github" on [com, net, xyz], assert results array, github.com unavailable, check price fields on available results
```

### Phase 4: Domain registration (NameSilo — opt-in, costs money)

Skip unless `SMOKE_REGISTER_DOMAIN` is set. This is intentionally separate because `register()` purchases a real domain.

```
17. quoteDomain — quote for SMOKE_REGISTER_DOMAIN, assert QuoteResponse (quote_id, total_cost_usd, expires_at)
18. registerDomain — register using quote_id, assert RegisterResponse (domain, registered=true, zone_id or recovery_token)
```

No cleanup for registration — domains can't be un-registered.

## Shared State

```
let cfZoneId: string | null = null;        // Phase 1 zone
let cfRecordAId: string | null = null;     // Phase 1 A record
let cfRecordMxId: string | null = null;    // Phase 1 MX record
let serviceZoneId: string | null = null;   // Phase 2 zone (service layer)
let serviceRecordAId: string | null = null; // Phase 2 A record
```

## Cleanup (afterAll)

```
if (cfZoneId) → deleteZone(cfZoneId)          // CF API direct
if (serviceZoneId) → service.deleteZone(...)   // service layer (cascades CF + SQLite)
```

Null out IDs after explicit delete tests (tests 9, 15) to prevent double-delete in afterAll — same pattern as SP-8.

## package.json Change

Add `test:smoke` script to `packages/domain/package.json`:

```json
"test:smoke": "vitest --run --testPathPattern smoke-live"
```

This matches the pattern in spawn and search packages.

## Run Command

```bash
CLOUDFLARE_API_TOKEN=xxx CLOUDFLARE_ACCOUNT_ID=yyy pnpm -C packages/domain test:smoke
```

With optional registrar search:
```bash
CLOUDFLARE_API_TOKEN=xxx CLOUDFLARE_ACCOUNT_ID=yyy NAMESILO_API_KEY=zzz pnpm -C packages/domain test:smoke
```

## Timeout

60 seconds. CF API calls are fast (sub-second each). NameSilo search may take 2-3s. No polling needed (unlike spawn's droplet provisioning).

## Assertions Summary

| Test | Key assertions |
|------|---------------|
| createZone | `id` truthy, `name` matches domain, `status` is string |
| createDnsRecord (A) | `id` truthy, `type === "A"`, `content === "93.184.216.34"` |
| createDnsRecord (MX) | `priority === 10`, `type === "MX"` |
| listDnsRecords | `length >= 2`, find by name succeeds |
| getDnsRecord | `content === "93.184.216.34"`, `id === cfRecordAId` |
| updateDnsRecord | `content === "198.51.100.1"` |
| batchDnsRecords | `posts.length === 1` (TXT created), `deletes.length === 1` (MX deleted) |
| service.createZone | `ok === true`, `data.id` starts with `z_`, `data.domain` matches |
| service.mailSetup | `ok === true`, `data.records.length >= 3` (MX + SPF + DMARC minimum) |
| service.verifyZone | `ok === true`, `data.nameservers` has `expected` array, `data.records` is array |
| searchDomains | `results.length === 3`, `github.com` result has `available === false` |

## Design Decisions

1. **Two-layer testing**: Phase 1 hits Cloudflare directly (tests `cloudflare.ts` wrapper), Phase 2 goes through `service.ts` (tests service logic + CF integration + SQLite together). This catches bugs in both layers.

2. **`.example` domain**: RFC 2606 reserves `.example` — CF will create the zone in `pending` status (no NS delegation possible), but all record CRUD works. Avoids needing a real domain.

3. **Registration is opt-in**: `SMOKE_REGISTER_DOMAIN` must be explicitly set. No accidental $10 domain purchases.

4. **In-memory SQLite for Phase 2**: Set `DOMAIN_DB_PATH=:memory:` before importing service module. Tests 10-15 get a fresh DB.

5. **No DNS verification assertions on propagation**: `.example` zones will never propagate. Assert the response shape, not `propagated === true`.

## Before Closing

- [ ] Run `pnpm -C packages/domain check` (lint + typecheck + test pass)
- [ ] Run smoke test with real CF creds, verify all Phase 1+2 tests pass
- [ ] If `NAMESILO_API_KEY` available, verify Phase 3 passes
- [ ] Verify afterAll cleanup deletes the CF zone (check CF dashboard or API)
- [ ] Verify no zone/record leak on test failure (afterAll runs even on error)
