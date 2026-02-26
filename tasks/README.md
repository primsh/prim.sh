# Task System

## Hierarchy

| Level | Marker | Parallelism | Description |
|-------|--------|-------------|-------------|
| **Section** | `##` | None implied | Topical grouping. Two tasks in different sections CAN conflict. |
| **Wave** | `###` | Annotated (PARA/SRL) | Group of phases. Optional. |
| **Phase** | `####` | Annotated (PARA/SRL) | Group of tasks. Optional. |
| **Task** | Table row | `Depends` column | Smallest unit of work. |

**IDs**: Every wave, phase, and task has a unique ID.
- Waves: `<SECTION>-W<n>` (e.g., `HRD-W1`, `PRIMS-W2`)
- Phases: `<WAVE>-P<X>` (e.g., `HRD-W1-PA`, `HRD-W1-PB`)
- Tasks: section prefix + number (e.g., `HRD-3`, `L-27`)

**Lanes** are implicit, not a heading level. When a wave or phase is annotated **PARA**, each child is in a separate lane — meaning they MUST NOT touch the same files. When annotated **SRL**, children share a lane and execute sequentially.

**Key rules:**
- Lanes are a consequence of PARA annotations, not explicit headings.
- PARA children cannot conflict (same files, same working copy) — if they do, they belong in the same SRL grouping.
- The `Depends` column on tasks is the ground truth for serial ordering.
- Sections are NOT parallelism boundaries. Multiple waves can exist in one section.

## Sections

| Abbrev | Header | Scope |
|--------|--------|-------|
| HRD | Hardening | Code quality, security, reliability |
| PRIMS | Primitives | Feature work on specific services |
| INFRA | Infrastructure | CI, tooling, observability, cross-cutting |
| COMM | Community & Brand | Docs, Discord, brand, marketing |
| BKLG | Backlog | Future primitives, deferred ideas |

## Table Format

All sections use:

```markdown
| ID | Task | Owner | Depends | Status | Release |
|----|------|-------|---------|--------|---------|
```

- **ID**: Prefix + number. Existing IDs are frozen (never renamed).
- **Task**: One-line summary, ~120 chars max. Longer specs go in plan docs.
- **Owner**: `Garric`, `Claude`, `Garric + Claude`, or blank.
- **Depends**: Comma-separated task IDs. `--` if none. Only list pending deps.
- **Status**: `pending`, `in-progress`, `done`, `backlog`.
- **Release**: Semver tag (e.g., `v1.0.0`) if the task blocks a release, `--` otherwise.

## ID Prefixes

| Prefix | Scope |
|--------|-------|
| L | Launch blockers |
| HRD | Hardening |
| W | wallet.sh |
| E | email.sh |
| SP | spawn.sh |
| ST | store.sh |
| TK | token.sh |
| D | domain.sh |
| SE | search.sh |
| TR | track.sh |
| M | mem.sh |
| FC | faucet.sh |
| OPS | Operations / infra |
| OBS | Observability |
| BIZ | Business tooling |
| SEC | Security |
| I | Internal tooling / codegen |
| SITE | Marketing site |
| COM | Community |
| X4 | x402 middleware |

## Completion Workflow

1. Update status to `done` in TASKS.md
2. Append row to `tasks/completed/log.md`
3. Remove row from TASKS.md
4. If plan doc exists: `git mv tasks/active/<plan>.md tasks/completed/`

TASKS.md only contains pending/in-progress/backlog work. It does not grow forever.

## Plan Doc Convention

Plan docs live in `tasks/active/` while in progress and `tasks/completed/` when done.

Filename: `<task-id>-<slug>-<date>.md` (e.g., `h-2-allowlist-singleton-2026-02-27.md`)

A task needs a plan doc if any of:
- Touches more than one file
- Introduces a new export, type, or module
- Modifies a function signature
- Involves a design decision

## Plan Docs Index

- P-1: `tasks/completed/p-1-llms-txt-catalog-2026-02-24.md`
- P-4: `tasks/active/p-4-x402-hono-middleware-2026-02-24.md`
- W-1: `tasks/completed/w-1-wallet-api-surface-2026-02-24.md`
- W-2: `tasks/completed/w-2-wallet-creation-2026-02-24.md`
- R-1: `tasks/completed/r-1-stalwart-docker-deploy-2026-02-24.md`
- SP-1: `tasks/completed/sp-1-spawn-spec-2026-02-24.md`
- B-1: `tasks/completed/b-1-batch-1-team-execution-2026-02-24.md`
- W-3: `tasks/completed/w-3-balance-queries-2026-02-24.md`
- W-4: `tasks/completed/w-4-send-usdc-2026-02-24.md`
- W-5: `tasks/completed/w-5-x402-client-2026-02-24.md`
- SP-2: `tasks/completed/sp-2-vm-provisioning-2026-02-24.md`
- W-6: `tasks/completed/w-6-funding-request-2026-02-24.md`
- W-7: `tasks/completed/w-7-policy-engine-2026-02-24.md`
- W-8: `tasks/completed/w-8-execution-journal-2026-02-24.md`
- W-9: `tasks/completed/w-9-circuit-breaker-2026-02-24.md`
- SP-3/SP-4: `tasks/completed/sp-3-sp-4-lifecycle-ssh-2026-02-24.md`
- D-1: `tasks/completed/d-1-dns-zone-record-crud-2026-02-24.md`
- SP-6: `tasks/completed/sp-6-provider-abstraction-2026-02-24.md`
- R-2: `tasks/completed/r-2-stalwart-domain-tls-2026-02-24.md`
- R-3: `tasks/completed/r-3-mailbox-creation-stalwart-rest.md`
- R-4: `tasks/completed/r-4-jmap-auth-session-bootstrap.md`
- D-2: `tasks/completed/d-2-domain-sh-rename-search-2026-02-25.md`
- D-3: `tasks/active/d-3-domain-registration-2026-02-25.md`
- D-6: `tasks/active/d-6-verification-endpoint-2026-02-25.md`
- D-7: `tasks/active/d-7-auto-configure-ns-2026-02-25.md`
- ST-1: `tasks/completed/st-1-bucket-crud-cloudflare-r2.md`
- R-5: `tasks/completed/r-5-read-messages-jmap-2026-02-25.md`
- ST-4: `tasks/completed/st-4-x402-middleware-store.md`
- R-6: `tasks/completed/r-6-send-messages-jmap-2026-02-25.md`
- R-7: `tasks/completed/r-7-incoming-webhooks-mta-hooks.md`
- R-9: `tasks/completed/r-9-custom-domain-support.md`
- R-8: `tasks/completed/r-8-mailbox-ttl-expiry.md`
- R-10: `tasks/completed/r-10-x402-middleware-email.md`
- ST-3: `tasks/completed/st-3-storage-quota-usage.md`
- TK-1/TK-2: implemented directly (no plan doc)
- TK-4: `tasks/active/tk-4-factory-contract-testnet.md`
- W-10/XC-1/FC-1: ADR at `specs/adr-wallet-custody.md`
- ST-5: `tasks/completed/st-5-testnet-integration-testing.md`
- R-11: `tasks/completed/r-11-local-smoke-test.md`
- R-14: plan provided in prompt (no plan doc)
- KS-1: `~/.claude/plans/fancy-hugging-breeze.md`
- Umbrella: `tasks/active/batch-execution-umbrella-2026-02-24.md`
- ST-6: `tasks/active/st-6-prim-store-cli-2026-02-25.md`
- SE-1: `tasks/completed/se-1-search-sh-plan-2026-02-25.md`
- SE-2: `tasks/completed/se-2-search-live-smoke-test-2026-02-25.md`
- D-9: `tasks/active/d-9-domain-live-smoke-test-2026-02-25.md`
- TK-6: `tasks/active/tk-6-mint-ownership-bug-2026-02-25.md`
- M-1: `tasks/completed/m-1-mem-sh-vector-cache-2026-02-25.md`
- M-2: `tasks/active/m-2-mem-live-smoke-test-2026-02-25.md`
- E-8: `tasks/active/e-8-email-domain-migration-2026-02-25.md`
- L-31: `tasks/active/l-31-deploy-access-invite-flow-2026-02-26.md`
- L-33: `tasks/active/l-33-fix-scrypt-openssl-crash-2026-02-26.md`
- L-36: `tasks/active/l-36-launch-readiness-smoke-test-2026-02-26.md`
- X4-2: `tasks/active/x4-2-x402-client-retry-2026-02-25.md`
- L-35: `tasks/active/l-35-access-request-e2e-test-2026-02-25.md`
- Wave 5.5: `tasks/active/wave-5.5-agent-interface-layer-2026-02-26.md`
- I-1: `tasks/active/i-1-primitives-sot-codegen-2026-02-26.md`
- SITE-1: `tasks/active/site-1-ssr-2026-02-26.md`
- V1 Launch: `tasks/active/v1-launch-plan-2026-02-25.md`
- L-66: `tasks/active/l-66-package-as-plugins-2026-02-26.md`
- L-72: `tasks/active/l-72-agent-interface-wave-2-2026-02-26.md`
- OBS-1: `tasks/active/obs-1-metrics-report-2026-02-26.md`
- SP-7: `tasks/active/sp-7-docker-provider-2026-02-26.md`
- PRIM-2: `tasks/active/prim-2-token-utility-2026-02-26.md`
