# HRD-W6: OSS Code Quality Audit

**Wave**: HRD-W6 | **Section**: Hardening
**Goal**: Fix the two systemic quality gaps found in the OSS readiness audit: missing inline documentation and widespread code duplication. These were missed in the initial audit (HRD-W1/W5) which focused on repo hygiene, secrets, and CI.

## Context

The codebase has strong structural qualities (consistent package layout, strict TS, CI enforcement, 5-check smoke tests). But two dimensions are materially below open-source standard:

1. **Inline documentation**: ~20% of exported symbols have JSDoc. api.ts files are well-documented (field-level descriptions on interfaces). service.ts files — where all business logic lives — have essentially zero JSDoc. No @throws, no @example, 3 total @param tags in the entire monorepo.

2. **Code duplication**: 850+ lines of copy-pasted code across packages. The bun-sqlite mock alone is 682 lines duplicated across 10 packages. The x402 middleware mock in tests is copied identically in 6+ packages. JSON body parsing + caller validation is repeated in every index.ts.

### Overlap with existing work

| Existing | Status | Overlap |
|----------|--------|---------|
| HRD-W5 (open-source-scrub) | Worktree, 4 commits ahead of main, not merged | None. W5 covers content scrub, CHANGELOG, ci-setup docs. No code quality work. |
| HRD-W1 (OSS readiness) | Merged | None. W1 covered smoke tests, pagination, rate limiting, SECURITY.md. |
| I-43 (root file clutter) | Pending on main | None. File moves, not code quality. |
| COM-14 (semver decision) | Pending, owner: Garric | None. Version bump decision. |
| HRD-W5 CHANGELOG.md | In scrub worktree | No conflict — this wave doesn't touch CHANGELOG. |

**Recommendation**: Merge HRD-W5 first (it's complete), then this wave builds on clean main.

---

## Phase A: Deduplication Infrastructure (SRL)

Creates shared packages that Phase B and C consume. Serial because B depends on A's exports.

### HRD-49: Extract shared bun-sqlite mock to x402-middleware

**Owner**: Claude | **Depends**: — | **Effort**: Medium

10 packages have near-identical `src/__mocks__/bun-sqlite.ts` (682 lines total). wallet's version has extra `RunResult` fields; feedback's has a generic `PreparedStatement<TRow>`. All others are identical.

**What to do**:
- Create `packages/x402-middleware/src/testing/bun-sqlite-mock.ts` (not a separate package — keep it in the shared package under a `testing` subpath export)
- Add `"./testing"` export to x402-middleware's package.json
- Export: `Database`, `PreparedStatement`, `RunResult` interface (superset of all variants)
- Delete all 10 `src/__mocks__/bun-sqlite.ts` files
- Update each package's `vitest.config.ts` alias to point to `@primsh/x402-middleware/testing`

**Variants to reconcile**:

| Package | Difference from common |
|---------|----------------------|
| wallet | `RunResult` with `changes` + `lastInsertRowid` |
| feedback | Generic `PreparedStatement<TRow>` |
| store, token, domain, spawn, mem, email, faucet, gate | Identical (93 lines each) |

The shared version must be the superset (wallet's RunResult + feedback's generic).

### HRD-50: Extract shared test utilities for smoke tests

**Owner**: Claude | **Depends**: HRD-49 | **Effort**: Medium

The x402 middleware mock block is copied identically in 6+ smoke tests (22 lines each). The 5-check smoke test boilerplate is 40-50 lines per package.

**What to do**:
- Create `packages/x402-middleware/src/testing/smoke-helpers.ts`
- Export `mockX402Middleware(options?)` — configurable vi.mock that sets walletAddress, mocks `createAgentStackMiddleware` as passthrough spy, mocks `createWalletAllowlistChecker`
- Export `mockBunSqlite()` — calls vi.mock with the shared mock from HRD-49
- Update 6+ smoke tests to use the shared mock
- Do NOT extract the 5-check test structure itself (each package's assertions are different enough to stay inline)

### HRD-51: Extract ServiceResult type + error helpers to x402-middleware

**Owner**: Claude | **Depends**: — | **Effort**: Low

6+ packages define the same `ServiceResult<T>` discriminated union. 3 packages define identical `internalAuth()` functions.

**What to do**:
- Add `ServiceResult<T>` to `packages/x402-middleware/src/types.ts` (superset: includes `retryAfter?`)
- Add `createInternalAuthGuard(key?: string)` to `packages/x402-middleware/src/errors.ts`
- Replace per-package definitions with imports from `@primsh/x402-middleware`
- Keep per-service error code types (e.g., `"r2_error"`, `"not_mintable"`) local — they're domain-specific

### HRD-52: Extract JSON body parsing + caller validation helpers

**Owner**: Claude | **Depends**: HRD-51 | **Effort**: Medium

Every index.ts has identical try/catch JSON parsing (~8 lines, repeated 35+ times across all route handlers) and identical `const caller = c.get("walletAddress")` checks (~4 lines, 35+ times).

**What to do**:
- Add to `packages/x402-middleware/src/helpers.ts`:
  - `parseJsonBody<T>(c, logger, endpoint)` → `{ ok: true; body: T } | { ok: false; response: Response }`
  - `requireCaller(c)` → `{ ok: true; caller: string } | { ok: false; response: Response }`
  - `requireFields(body, ...fields)` → validation helper
- Update all index.ts route handlers to use these helpers
- This is the highest-touch change (affects every primitive), so it goes after the lower-risk extractions

### HRD-53: Update gen-cli.ts to emit shared handleError import

**Owner**: Claude | **Depends**: — | **Effort**: Low

8 generated `*-commands.ts` files in keystore have identical `handleError()` (14 lines each).

**What to do**:
- Create `packages/keystore/src/cli-utils.ts` with shared `handleError()`
- Update `scripts/gen-cli.ts` template to `import { handleError } from "./cli-utils.ts"` instead of emitting the function inline
- Regenerate CLI commands: `pnpm gen:cli`

---

## Phase B: Inline Documentation — Shared Layer (SRL)

Document the foundation package first. Contributors read x402-middleware to understand the system.

### HRD-54: Add JSDoc to x402-middleware public API

**Owner**: Claude | **Depends**: HRD-51 (types may have moved) | **Effort**: Medium

x402-middleware has ~40 exported symbols, ~16 documented (40%). The undocumented symbols are the ones contributors need most.

**Files to document**:

| File | Exported symbols | Current docs | Needed |
|------|-----------------|--------------|--------|
| `errors.ts` | `forbidden()`, `notFound()`, `invalidRequest()`, `serviceError()` | 0 JSDoc | @param, @returns |
| `types.ts` | `AgentStackConfig`, `PrimAppConfig`, `ServiceResult` | Bare fields | Field-level descriptions |
| `logger.ts` | `createLogger()` | 0 JSDoc | @param, @returns, @example |
| `pagination.ts` | `paginate()`, `PaginatedResponse` | 0 JSDoc | @param, @returns, @example |
| `middleware.ts` | Already has JSDoc | Partial | Add @throws, @example |
| `create-prim-app.ts` | Already has JSDoc | Good | Add @example |
| `rate-limit.ts` | `RateLimiter` | Partial | Add @example |
| `network-config.ts` | `getNetworkConfig()` | Has @param | Add @returns |

**Standard for all JSDoc**:
- One-line summary
- @param for every parameter
- @returns describing the return shape
- @throws if it can throw (only for try/catch code paths)
- @example for public-facing functions that contributors will call

### HRD-55: Add JSDoc to wallet.sh service layer

**Owner**: Claude | **Depends**: — | **Effort**: High

wallet.sh is the keystone primitive. service.ts has 18 exported functions with zero JSDoc. This is the reference implementation for all other primitives.

**Functions to document** (wallet/src/service.ts):
- `registerWallet()` — most complex, involves signature verification
- `getWallet()`, `listWallets()`
- `createFundRequest()`, `approveFundRequest()`
- `getPolicy()`, `upsertPolicy()`
- `sendUsdc()`, `getBalance()`
- `logExecution()`, `getExecutionHistory()`
- `checkCircuitBreaker()`
- All others

**Standard**: @param, @returns (with `ServiceResult` variant descriptions), error conditions in prose (not @throws since these return error results, not throw).

### HRD-56: Add JSDoc to remaining service layers (batch)

**Owner**: Claude | **Depends**: HRD-55 (use wallet as template) | **Effort**: High

Apply wallet.sh's documentation pattern to all other service.ts files:

| Package | Exported functions | Priority |
|---------|-------------------|----------|
| store | 13 (createBucket, putObject, getObject, etc.) | High — heavily used |
| domain | 10+ (createZone, addRecord, registerDomain, etc.) | Medium |
| search | 4 (searchWeb, searchNews, extractUrls, searchImages) | Medium |
| token | 8 (deployToken, mint, getDeployment, etc.) | Medium |
| gate | 1 (redeemInvite — already has JSDoc) | Done |
| email | 6+ (createMailbox, listMessages, etc.) | Medium |
| spawn | 5+ (createServer, listServers, etc.) | Medium |
| track | 3 (trackPackage, getCarriers, etc.) | Low |
| mem | 4 (store, query, delete, listNamespaces) | Low |
| faucet | 2 (dripUsdc, dripEth) | Low |
| feedback | 2 (submitFeedback, listFeedback) | Low |

### HRD-57: Add SPDX license headers to all source files

**Owner**: Claude | **Depends**: — | **Effort**: Low (scriptable)

Zero .ts files have license headers. Apache 2.0 recommends per-file headers.

**What to do**:
- Add `// SPDX-License-Identifier: Apache-2.0` as line 1 of every `*.ts` file under `packages/` and `scripts/`
- Script it: find + sed, one commit
- Update Biome config if needed to allow the comment before imports
- Exclude generated files (files between `BEGIN:GENERATED` / `END:GENERATED` markers)
- Exclude test files (debatable — include for completeness)

---

## Phase C: Scaffold Cleanup (PARA with Phase A)

Can run in parallel with Phase A — touches different files (imagine package only).

### HRD-58: Remove or gate imagine.sh scaffold

**Owner**: Garric (decision) + Claude (execution) | **Depends**: — | **Effort**: Low

imagine.sh has 14 TODOs — it's a hollow code-gen scaffold. Every other package is implemented. Options:

1. **Set `status: hold` in prim.yaml** and add `allow_todo: true` to its gate config so gen:check doesn't flag it. Keep the package but signal it's not ready.
2. **Remove entirely** — `rm -rf packages/imagine`, remove from pnpm-workspace.yaml. Add back when implementing.
3. **Keep as-is** — accept the TODOs as visible to contributors. Risk: looks unfinished.

**Recommendation**: Option 1 (hold + allow_todo). Removing a package from the monorepo and re-adding it later creates unnecessary churn.

---

## Phase D: Semver Bump (SRL, after all other phases)

### COM-14: Decide initial semver and bump all packages

**Owner**: Garric | **Depends**: HRD-W5 merge, HRD-W6 completion | **Effort**: Low

Already exists as a pending task. Included here for sequencing — don't stamp a version until code quality work is done.

---

## Owner Summary

| Task | Owner | Can Claude do it? |
|------|-------|-------------------|
| HRD-49 (bun-sqlite mock) | Claude | Yes — mechanical extraction |
| HRD-50 (smoke test helpers) | Claude | Yes — mechanical extraction |
| HRD-51 (ServiceResult + errors) | Claude | Yes — mechanical extraction |
| HRD-52 (JSON body parsing) | Claude | Yes — high-touch but mechanical |
| HRD-53 (gen-cli handleError) | Claude | Yes — generator template change |
| HRD-54 (x402-middleware JSDoc) | Claude | Yes — read code, write docs |
| HRD-55 (wallet JSDoc) | Claude | Yes — read code, write docs |
| HRD-56 (remaining JSDoc) | Claude | Yes — batch, use wallet as template |
| HRD-57 (SPDX headers) | Claude | Yes — scriptable |
| HRD-58 (imagine.sh) | Garric (decision) + Claude | Garric picks option, Claude executes |
| COM-14 (semver) | Garric | No — product/versioning decision |
| **HRD-W5 merge** | Garric | No — PR review + merge is owner decision |

**Bottom line**: Claude can execute 10/12 tasks autonomously given API access. Garric makes 2 decisions (imagine.sh disposition, semver) and merges HRD-W5.

---

## Before closing

- [ ] Run `pnpm -r check` — lint/typecheck/tests pass
- [ ] Run `pnpm gen:check` — generated files up to date
- [ ] Verify no regressions in existing smoke tests (dedup changes are high-risk for breakage)
- [ ] Spot-check 3 JSDoc additions for accuracy (don't just describe the code — describe the contract)
- [ ] Confirm SPDX headers don't break Biome's `organizeImports` rule
- [ ] All extracted helpers have their own unit tests in x402-middleware
