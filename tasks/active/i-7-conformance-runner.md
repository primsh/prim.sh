# I-7: Conformance Runner

**Status:** pending
**Goal:** Automated verification that every deployed prim passes the 5-check smoke test contract and all generated files are up-to-date. Catches drift before it ships.
**Depends on:** I-6 (all prims migrated to createPrimApp)
**Scope:** `scripts/conformance.ts` (new), `package.json`, `.github/workflows/ci.yml`

## Problem

Smoke test completeness is uneven. search has only Check 1. faucet uses non-standard test naming. Some prims have metrics middleware, some don't. There's no automated way to verify all prims conform to the shared contract. Problems are discovered manually or via production bugs.

## Design

### What conformance checks

For each package with a `prim.yaml` where `status` is `deployed` or `live`:

**Structural checks** (static analysis, no test execution):
1. `test/smoke.test.ts` exists
2. smoke.test.ts contains all 5 check patterns:
   - Check 1: `app` or `default` export assertion
   - Check 2: `GET /` → `service:` + `status: "ok"` assertion
   - Check 3: `createAgentStackMiddleware` spy assertion (skip for faucet — `freeService`)
   - Check 4: At least one paid route happy-path assertion (200 response)
   - Check 5: At least one invalid-input assertion (400 response)
3. `prim.yaml` has required fields: `id`, `name`, `port`, `routes_map`, `pricing`, `env`
4. `src/index.ts` uses `createPrimApp()` (after I-6 migration)

**Generated file freshness** (runs `pnpm gen:check`):
5. All generated files match their sources (llms.txt, site cards, env templates, etc.)

### Runner script

`scripts/conformance.ts` — reads all `packages/*/prim.yaml`, filters to deployed prims, runs checks, reports pass/fail per prim per check. Exit 0 if all pass, exit 1 with details on failures.

### CI integration

Add `pnpm test:conformance` step after `pnpm test` in CI workflow. Blocks PRs that introduce non-conformant prims.

### npm scripts

- `pnpm test:conformance` — run the conformance checks
- Existing `pnpm gen:check` — already handles generated file staleness (incorporated by reference)

## Files to Create/Modify

| File | Action |
|------|--------|
| `scripts/conformance.ts` | Create — conformance runner |
| `package.json` | Modify — add `test:conformance` script |
| `.github/workflows/ci.yml` | Modify — add conformance step |

## Key Decisions

- **Static analysis, not test execution.** The conformance runner checks that the right patterns exist in test files. It does NOT run the tests (that's `pnpm test`). This keeps it fast and non-flaky.
- **Regex-based pattern matching** for check detection. Look for string patterns like `"service"`, `"status"`, `createAgentStackMiddleware`, `.json(`, `400` in the test file. Not AST parsing — too heavy for this purpose.
- **Faucet exception** is encoded in prim.yaml via a flag (e.g. `free_service: true`). The conformance runner skips Check 3 for free services.

## Testing Strategy

- Run conformance against current codebase — expect it to flag known gaps (search missing checks 2-5, etc.)
- After fixing all gaps (or marking them as known exceptions), conformance should pass clean

## Before Closing

- [ ] `pnpm test:conformance` passes for all deployed prims
- [ ] CI workflow includes conformance step
- [ ] Non-conformant prims are either fixed or have documented exceptions
- [ ] Runner output is clear: lists each prim, each check, pass/fail with reason
