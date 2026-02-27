# I-1: Primitives SOT + Codegen (expanded)

**Date:** 2026-02-26 (revised)
**Status:** pending
**Scope:** `packages/*/prim.yaml`, `primitives.yaml`, `scripts/gen-prims.ts`, `site/index.html`, `site/*/index.html`, `site/llms.txt`, `README.md`, `specs/pricing.yaml`, `deploy/*/env.example`, `scripts/pre-deploy.ts`, `package.json`, `.github/workflows/ci.yml`

**Supersedes:** original I-1 (status SOT only). Absorbs BIZ-1 (pricing SOT).

## Problem

Primitive metadata is scattered and drifts constantly:
- Status: TASKS.md, llms.txt, README, site cards — all manual
- Pricing: `specs/pricing.yaml` hand-maintained, duplicated in per-page HTML
- Env vars: `scripts/pre-deploy.ts` hardcoded arrays drift from actual `process.env` calls
- Site cards: `site/index.html` active/phantom state is hand-maintained
- Per-page status badges and pricing tables are hand-maintained HTML

One `prim.yaml` per primitive → run `pnpm gen:prims` → everything updates.

## Source of Truth Structure

### Built primitives: `packages/<id>/prim.yaml`

Co-located with code. Full schema:

```
id          wallet
name        wallet.sh
endpoint    wallet.prim.sh
status      testing
type        crypto
wraps       viem + EIP-3009
description Agent wallets. Generate keys, hold USDC on Base, pay any x402 invoice.
accent      "#A78BFA"
env:
  - PRIM_PAY_TO
  - PRIM_NETWORK
  - PRIM_INTERNAL_KEY
pricing:
  - op: Create wallet
    price: free
  - op: Balance query
    price: $0.001
```

### Unbuilt primitives: root `primitives.yaml`

All 27 primitives listed. Built ones have minimal entries (codegen prefers package yaml). Unbuilt ones have: id, name, type, description, accent, status, wraps.

When a primitive gets built, its root entry stays but package yaml takes precedence (codegen merges, package wins on conflicts).

## Status States

| State | Site card | llms.txt section |
|---|---|---|
| `coming_soon` | disabled (phantom) | Planned |
| `building` | disabled (phantom) | Planned |
| `built` | disabled (phantom) | Built (not deployed) |
| `testing` | active (link) | Live |
| `production` | active (link) | Live |

Current statuses:
- `testing`: wallet, store, spawn, faucet, search, email
- `built`: token, mem, domain
- `coming_soon`: everything else

## Codegen Script: `scripts/gen-prims.ts`

Single script. Reads all yamls, groups primitives by status, regenerates marker-bounded sections in target files.

Marker pattern (same in every target):
```
<!-- BEGIN:PRIM:<SECTION> -->
...generated...
<!-- END:PRIM:<SECTION> -->
```

For non-HTML files (llms.txt, README, pre-deploy.ts):
```
# BEGIN:PRIM:<SECTION>
...generated...
# END:PRIM:<SECTION>
```

### Target: `site/index.html` — cards grid

`<!-- BEGIN:PRIM:CARDS -->` section. Active card:
```html
<div class="product p<n>">
  <div class="product-name">store.sh</div>
  <div class="product-type">storage</div>
  <div class="product-desc">...</div>
  <a href="/store" class="product-link">→ store.sh</a>
</div>
```

Phantom card (status != testing/production):
```html
<div class="product p<n> phantom">
  <div class="product-name">vault.sh</div>
  <div class="product-type">secrets</div>
  <div class="product-desc">...</div>
  <span class="phantom-label">phantom</span>
</div>
```

`p<n>` color class comes from `accent` field mapped to existing CSS classes.

### Target: `site/<id>/index.html` — per-page sections

Two markers per page:

`<!-- BEGIN:PRIM:STATUS -->` — status badge:
```html
<span class="badge status-testing">● Live (testnet)</span>
```

`<!-- BEGIN:PRIM:PRICING -->` — pricing table rows only (not the `<table>` wrapper):
```html
<tr><td>Create wallet</td><td>free</td><td></td></tr>
<tr><td>Balance query</td><td>$0.001</td><td>Per call</td></tr>
```

Pages without a `prim.yaml` (coming_soon) are skipped — no markers to inject.

### Target: `site/llms.txt`

Three sections bounded by markers. Groups: Live (`testing`+`production`), Built, Planned.

### Target: `README.md`

Primitive table: `| Primitive | Status | Wraps | Endpoint |`

### Target: `specs/pricing.yaml`

Full machine-readable pricing across all primitives. Regenerated entirely. Used by llms.txt skill content and future billing tools.

### Target: `scripts/pre-deploy.ts`

Replace hardcoded env arrays:
```ts
// BEGIN:PRIM:ENV
const REQUIRED_ENV: Record<string, string[]> = {
  wallet: ["PRIM_PAY_TO", "PRIM_NETWORK", "PRIM_INTERNAL_KEY"],
  store: [...],
  ...
};
// END:PRIM:ENV
```

Script imports this record instead of hardcoding.

### Target: `deploy/<id>/.env.example`

Generated per built primitive. Lists all required env vars with placeholder values and comments. Created if missing, regenerated if exists (env section only — other comments preserved via markers).

## CLI Flags

`--check`: diff against disk, exit 1 if any file would change. Used by CI.
`--only <target>`: regenerate one target only (e.g. `--only site/index.html`).

## Phases

1. Write `packages/*/prim.yaml` for all 9 built primitives (wallet, store, spawn, faucet, search, email, token, mem, domain). Include env + pricing.
2. Write root `primitives.yaml` for remaining 18 unbuilt primitives (status, description, accent only).
3. Write `scripts/gen-prims.ts` — parse yamls, implement all targets.
4. Add markers to all target files. Verify gen output matches current content before committing.
5. Add `gen:prims` + `gen:check` npm scripts. Add CI step.

## Design Decisions

- **Package yaml wins over root yaml** on field conflicts — code is authoritative for its own primitive.
- **Pricing table wrapper stays hand-written** — only `<tr>` rows are generated. Avoids clobbering column headers or custom notes.
- **`deploy/<id>/.env.example` is fully generated** — no hand-written content in these files.
- **`pre-deploy.ts` env arrays generated, not imported** — avoids making pre-deploy.ts depend on yaml parsing at runtime; arrays are inlined at codegen time.
- **Site pages for coming_soon primitives not touched** — they exist as stubs; no markers added until the primitive is built.
- **Accent → CSS class mapping** kept in codegen script as a lookup table (accent hex → `p<n>` class name).

## Success Criteria

- `pnpm gen:check` passes on clean state
- Changing `mem` status from `built` → `testing` in `packages/mem/prim.yaml` and running `pnpm gen:prims`:
  - `site/index.html` card becomes active with link
  - `site/llms.txt` moves mem from Built to Live section
  - `README.md` table reflects new status
- `pnpm gen:check` fails if any prim.yaml is edited without running gen
- CI blocks PRs where yamls and generated files are out of sync

## Before Closing

- [ ] `pnpm gen:check` passes
- [ ] All 9 built primitives have `prim.yaml` with env + pricing populated
- [ ] All 18 unbuilt primitives in root `primitives.yaml`
- [ ] email.sh appears in Live section of llms.txt (not Built)
- [ ] mem, token, domain appear in Built section (not Live)
- [ ] `site/index.html` cards match current live state exactly before any status changes
- [ ] Marker boundaries don't clobber non-generated content in any file
- [ ] CI step present in `ci.yml`
- [ ] `specs/pricing.yaml` generated and matches existing hand-written prices
