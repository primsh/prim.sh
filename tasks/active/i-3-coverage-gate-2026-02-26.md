# I-3: Coverage gate — add `reportsDirectory` to all vitest configs

**Status**: pending
**Scope**: `packages/*/vitest.config.ts` (11 files), `.gitignore`

## Problem

The gate runner (`scripts/lib/gate-check.ts`, line 96) reads coverage from a hardcoded path:

```
packages/<id>/coverage/coverage-summary.json
```

But vitest defaults `reportsDirectory` to `./coverage` **relative to the project root** (the pnpm workspace root), not relative to the package directory. So `pnpm --filter @primsh/wallet test -- --coverage` writes to `<repo-root>/coverage/`, not `packages/wallet/coverage/`. The gate runner never finds the file and falls through to the warning branch (line 109) instead of enforcing the threshold.

## Fix

Add `reportsDirectory: "./coverage"` to the `coverage` block in each `vitest.config.ts`. When vitest runs from a package directory (which `pnpm --filter` ensures), `./coverage` resolves to `packages/<id>/coverage/` as expected.

## Packages (11)

All share the same coverage block structure. None currently have `reportsDirectory`.

| Package | Extra config notes |
|---|---|
| wallet | has `bun:sqlite` alias |
| store | has `bun:sqlite` alias |
| spawn | has `bun:sqlite` alias |
| search | minimal (no aliases) |
| track | minimal (no aliases) — reference smoke test impl |
| faucet | has `bun:sqlite` alias |
| domain | has `bun:sqlite` alias |
| mem | has `bun:sqlite` alias |
| x402-client | minimal (no aliases) |
| token | has `bun:sqlite` alias, extra `exclude: ["contracts/**"]` on test block |
| keystore | minimal, has `testTimeout: 30000` |

## Change per file

In each `vitest.config.ts`, add one line inside the `coverage: { ... }` block:

```
reportsDirectory: "./coverage",
```

Place it as the first property in the coverage object, before `provider`.

## .gitignore

Add `coverage/` to `.gitignore` so generated coverage output is not committed. Add it under the `# Node / Bun` section.

## Verification

After the change, from repo root:

```bash
pnpm --filter @primsh/track test -- --coverage
ls packages/track/coverage/coverage-summary.json
```

The file should exist and contain a JSON object with `total.lines.pct`. Then run the gate check against any `testing`-status primitive to confirm it reads the threshold instead of warning.

## Before closing

- [ ] All 11 `vitest.config.ts` files have `reportsDirectory: "./coverage"`
- [ ] `coverage/` is in `.gitignore`
- [ ] Run `pnpm --filter @primsh/track test -- --coverage` and confirm `packages/track/coverage/coverage-summary.json` exists
- [ ] Run `pnpm -r test` — no regressions (coverage dir doesn't break normal test runs)
- [ ] Verify no `coverage/` directories are staged in git
