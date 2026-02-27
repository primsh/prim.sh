# I-4: Parallelize CI — split into concurrent jobs, add concurrency + caching

**Status**: pending
**Scope**: `.github/workflows/ci.yml`

## Problem

CI runs 6 checks sequentially in one job: install → audit → build x402 → gen-check → lint → typecheck → test. Wall-clock time is the sum of all steps (~3-4 min). Pushing to the same PR/branch queues additional runs instead of cancelling stale ones. Bun install cache is not used (only pnpm store is cached).

## Design

Rewrite `ci.yml` from one sequential job into a dependency graph:

```
setup  ──────────────────────────── audit (independent, non-blocking)
  │
  ├── lint
  ├── typecheck
  ├── test
  └── gen-check
```

### Job: `setup`

- Checkout, setup bun + node + pnpm
- Cache pnpm store (existing) + bun install cache (`~/.bun/install/cache`)
- `pnpm install --frozen-lockfile`
- `pnpm --filter @primsh/x402-middleware build`
- Upload workspace as artifact: entire repo dir minus `.git` (includes `node_modules` + `packages/x402-middleware/dist`)

### Jobs: `lint`, `typecheck`, `test`, `gen-check` (PARA)

Each job:
1. Download artifact from `setup`
2. Setup bun + node (needed for runtime, not install)
3. Run single command:
   - lint: `pnpm -r lint`
   - typecheck: `pnpm -r typecheck`
   - test: `pnpm -r test`
   - gen-check: `pnpm gen:check`

All four `needs: [setup]`, run in parallel.

### Job: `audit`

- Independent (no `needs`). Own checkout + install.
- `pnpm audit --audit-level=high`
- `continue-on-error: true` — advisory failures don't block merge.

### Concurrency

Top-level block cancels stale runs on the same branch/PR:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

### Bun cache

Add alongside existing pnpm cache in `setup`:

```yaml
- uses: actions/cache@v4
  with:
    path: ~/.bun/install/cache
    key: ${{ runner.os }}-bun-${{ hashFiles('**/bun.lock') }}
    restore-keys: |
      ${{ runner.os }}-bun-
```

## Artifact strategy

Use `actions/upload-artifact@v4` / `actions/download-artifact@v4`. Upload the full workspace after install + build so downstream jobs skip both steps entirely. Artifact retention: 1 day (only needed within the workflow run).

Trade-off: artifact upload/download (~10-15s) vs running `pnpm install` 4 more times (~30-40s each). Clear win.

## Files modified

- `.github/workflows/ci.yml` — full rewrite (1 job → 6 jobs)

## Verification

1. Push to a branch, open PR → CI shows 6 jobs in the Actions tab
2. Lint, typecheck, test, gen-check run in parallel after setup completes
3. Audit runs independently with green check even if it has warnings
4. Push again to same branch → stale run is cancelled
5. All jobs pass

## Before closing

- [ ] `pnpm -r check` passes locally before pushing
- [ ] CI shows parallel job execution (not sequential)
- [ ] Audit job has `continue-on-error: true`
- [ ] Concurrency cancels stale runs on same PR
- [ ] Bun cache key uses `bun.lock` (not `pnpm-lock.yaml`)
- [ ] Artifact retention is set to 1 day
