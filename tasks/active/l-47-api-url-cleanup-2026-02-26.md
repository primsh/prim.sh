# L-47: Clean up API URL redundancy

**Status**: pending
**Depends on**: L-22 (mainnet switchover)
**Date**: 2026-02-26

## Context

Every endpoint on the CF Worker (`workers/platform/`) is routed as `api.prim.sh/api/*` — the `/api` prefix is redundant since the subdomain already signals "this is the API." The correct shape is `api.prim.sh/*`.

This is a breaking change. Any agent or script that has cached `api.prim.sh/api/access/request` will 404. Since L-22 (mainnet switchover) already forces agents to re-register on the new chain, we bundle this URL change into the same coordinated cut — one migration, not two.

## Current routes (CF Worker)

All defined in `workers/platform/src/index.ts`:

| Current path                          | New path                       |
|---------------------------------------|--------------------------------|
| `POST /api/access/request`            | `POST /access/request`         |
| `GET  /api/access/requests`           | `GET  /access/requests`        |
| `POST /api/access/requests/:id/approve` | `POST /access/requests/:id/approve` |
| `POST /api/access/requests/:id/deny`  | `POST /access/requests/:id/deny` |
| `POST /api/invites`                   | `POST /invites`                |
| `POST /api/invites/redeem`            | `POST /invites/redeem`         |
| `POST /api/feedback`                  | `POST /feedback`               |

## Blast radius

### Phase 1: CF Worker routes (source of truth)

**File**: `workers/platform/src/index.ts`

Strip `/api` prefix from all 7 route definitions. Hono routes go from `app.post("/api/access/request", ...)` to `app.post("/access/request", ...)`.

Optionally add temporary 301 redirects for the old `/api/*` paths so cached agents get a clear signal. Decision: if L-22 is already a hard cut, redirects may not be worth the complexity.

### Phase 2: Docs, skills, and site (14 files)

Every file that contains a hardcoded `api.prim.sh/api/` URL needs updating to `api.prim.sh/`.

| File | Occurrences | What to change |
|------|-------------|----------------|
| `site/access/index.html` | 3 | curl examples + `fetch()` call in JS |
| `site/llms.txt` | 1 | access request URL |
| `docs/getting-started.md` | 1 | curl example |
| `skills/getting-started.md` | 1 | URL reference |
| `skills/store.md` | 1 | access request URL in prerequisites |
| `skills/token.md` | 1 | access request URL in prerequisites |
| `skills/email.md` | 1 | access request URL in prerequisites |
| `skills/multi-prim.md` | 1 | access request URL |
| `CONTRIBUTING.md` | 1 | feedback endpoint URL |
| `packages/keystore/src/skill-content.ts` | 3 | embedded skill content strings |

### Phase 3: Scripts

| File | What to change |
|------|----------------|
| `scripts/smoke-access.ts` | Line 177: `${API_URL}/api/access/requests/...` → `${API_URL}/access/requests/...` |

### Phase 4: Task docs (informational, low priority)

These are plan docs that reference the old URL shape. Not blocking, but should be updated for accuracy:

- `tasks/active/l-35-access-request-e2e-test-2026-02-25.md` (3 occurrences)

### Not affected

- `specs/openapi/*.yaml` — no `/api/` references found
- `wrangler.toml` — no route definitions (uses default `*.workers.dev` pattern; custom domain is configured in CF dashboard)
- `TASKS.md` — only references L-47 itself; update the description row after completion

## Deployment sequence

1. **Deploy CF Worker** with new routes (and optional 301 stubs for old paths)
2. **Deploy site** (updated HTML, llms.txt)
3. **Run `scripts/smoke-access.ts`** against live to verify the new paths work end-to-end
4. **Coordinate with L-22**: this should land in the same deploy window as mainnet switchover. If L-22 hasn't started yet, this can merge first and sit on `main` until deploy day.

## Design decision: redirects

Two options:

1. **Hard cut** — old `/api/*` paths return 404 immediately. Simpler. Acceptable because L-22 already forces a migration event.
2. **301 redirects for 30 days** — add a catch-all `app.all("/api/*", (c) => c.redirect(c.req.path.replace("/api", ""), 301))` route. More graceful but adds dead code to remove later.

Recommend option 1 (hard cut) since this coordinates with L-22.

## Before closing

- [ ] Run `wrangler deploy` and verify all 7 routes respond on new paths
- [ ] Run `scripts/smoke-access.ts` against live — all steps pass
- [ ] Grep codebase for `api.prim.sh/api/` — zero results (excluding TASKS.md description and this plan doc)
- [ ] Verify `site/access/index.html` JS `fetch()` call uses new URL (this is a runtime path, not just display text)
- [ ] Confirm `packages/keystore/src/skill-content.ts` strings match — these are served to agents at runtime
