# HRD-23: Final Repo Scrub

## Context

HRD-20 scrubbed VPS IP from `docs/ops/runbook.md` and `docs/ops/secrets-audit.md`, but:
- Residual IPs remain in `scripts/sync-vps.sh:14` and `tests/load/THRESHOLDS.md:3,97-98`
- The ops docs themselves are purely internal (port mappings, paths, restart procedures) with no value for OSS contributors even with IPs removed
- 20 generated deploy configs are tracked in git (`deploy/prim/generated/`)
- Internal-only scripts are tracked: `expenses.ts`, `report.ts`, `sync-vps.sh`
- Untracked original assets sitting in working tree

## Goal

Clean the public tree so `git clone` yields only files useful to contributors and self-hosters.

## Phase 1: Delete internal-only files

Remove from git tracking:

| File | Reason |
|------|--------|
| `docs/ops/runbook.md` | VPS admin runbook — port mappings, systemd paths, restart procedures. Purely operational. |
| `docs/ops/secrets-audit.md` | Internal rotation checklist with VPS file paths and service-account names. |
| `scripts/sync-vps.sh` | Hardcoded `VPS="root@157.230.187.207"` on line 14. Rsyncs repo to VPS + restarts services. |
| `scripts/expenses.ts` | Internal margin tracking (provider costs vs x402 revenue). Requires DO/CF API tokens. |
| `scripts/report.ts` | Internal health/revenue dashboard. Same env requirements. |

Command: `git rm` each file, single commit.

**Keep `scripts/smoke-access.ts`** — useful for self-hosters testing the access flow. But scrub the hard-coded domains on lines 33-35 (`https://wallet.prim.sh`, etc.) → read from `PRIM_BASE_URL` env var with `https://<id>.prim.sh` as default.

**Keep `scripts/deploy-prim.ts`** — generates systemd units + Caddy configs from `prim.yaml`, useful for self-hosting. But scrub hardcoded paths on lines 88-89:
- `/opt/prim` → configurable via `PRIM_ROOT` env var, default `/opt/prim`
- `/home/prim/.bun/bin/bun` → configurable via `BUN_PATH` env var, default result of `which bun`
- `/etc/prim/` → derive from `PRIM_ROOT` or separate `PRIM_ETC` var

## Phase 2: Scrub residual VPS IPs

| File | Lines | Action |
|------|-------|--------|
| `tests/load/THRESHOLDS.md` | 3 | Replace `157.230.187.207` with `<your-vps-ip>` in baseline hardware description |
| `tests/load/THRESHOLDS.md` | 97-98 | Replace `157.230.187.207` with `<your-vps-ip>` in runbook SSH example |

## Phase 3: .gitignore additions

Append to `.gitignore`:

```
# Generated deploy configs (deterministic from prim.yaml)
deploy/prim/generated/

# Vitest timestamp artifacts
**/*.timestamp-*.mjs

# Original image assets (pre-optimization)
site/assets/*_orig.*
```

Then `git rm --cached deploy/prim/generated/` to untrack the 20 existing files.

## Phase 4: Delete untracked originals

```
rm site/assets/favicon_orig.jpg site/assets/hero_orig.jpg
```

These are pre-optimization source images (499 KB + 793 KB). The optimized versions (`favicon.jpg`, `hero.jpg`) are already tracked.

## Files modified

| File | Change |
|------|--------|
| `docs/ops/runbook.md` | DELETE |
| `docs/ops/secrets-audit.md` | DELETE |
| `scripts/sync-vps.sh` | DELETE |
| `scripts/expenses.ts` | DELETE |
| `scripts/report.ts` | DELETE |
| `scripts/smoke-access.ts` | Parameterize domains (lines 33-35) |
| `scripts/deploy-prim.ts` | Parameterize paths (lines 88-89) |
| `tests/load/THRESHOLDS.md` | Replace 2 IP references with placeholder |
| `.gitignore` | Add 3 patterns |
| `deploy/prim/generated/*` | Untrack (20 files) |
| `site/assets/*_orig.*` | Delete from working tree |

## Before closing

- [ ] `git grep '157.230.187.207'` returns 0 results
- [ ] `git ls-files deploy/prim/generated/` returns 0 results
- [ ] `scripts/smoke-access.ts` reads domain from env var, not hardcoded
- [ ] `scripts/deploy-prim.ts` paths are configurable
- [ ] `pnpm -r check` passes (lint + typecheck + test)
