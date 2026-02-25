# B-1: Batch 1 — Parallel agent team execution (W-2 + R-1 + SP-1)

**Status:** Plan
**Depends on:** W-2 plan, R-1 plan, SP-1 plan (all committed)
**Blocks:** W-3, W-4, W-5 (wallet), R-2+ (relay), SP-2+ (spawn)

## Context

Three tasks are ready for implementation with no interdependencies: W-2 (wallet creation), R-1 (Stalwart Docker deploy), SP-1 (spawn.sh spec). Each has a detailed plan doc. This task executes all three in parallel using Claude Code's agent team feature.

## Team

**Name:** `agentstack-batch-1`

| Agent name | Task | Model | Isolation | Why this model |
|------------|------|-------|-----------|----------------|
| `wallet-dev` | W-2 | Sonnet | worktree | Highest complexity: 6 new files, crypto, SQLite, viem. Sonnet handles well against detailed plan. |
| `relay-ops` | R-1 | Haiku | worktree | Lowest complexity: 3 config/doc files, no TypeScript. Docker compose + README. |
| `spawn-spec` | SP-1 | Sonnet | worktree | Medium complexity: spec writing requires judgment about API design, pricing model, state machine. |

**Lead:** Opus (current session). Creates team, assigns tasks, reviews work, merges to main.

## Execution Protocol

### Phase 1 — Launch

1. Create team `agentstack-batch-1`
2. Create task list entries for all three tasks
3. Spawn all three agents simultaneously, each in its own worktree
4. Each agent's prompt includes:
   - The full plan doc content (read from `tasks/active/`)
   - Instruction to implement exactly what the plan says
   - Instruction to run `pnpm -r check` (for W-2) or validation commands before finishing
   - Instruction NOT to modify TASKS.md or files outside their scope

### Phase 2 — Monitor

Agents work autonomously. Lead monitors via idle notifications and messages.

**Expected completion order:**
1. R-1 (relay-ops, Haiku) — fastest, simplest scope
2. SP-1 (spawn-spec, Sonnet) — medium, writing-only
3. W-2 (wallet-dev, Sonnet) — slowest, most code

### Phase 3 — Review + Merge

For each completed agent:

1. Read the worktree diff
2. Review against the plan doc (same criteria as `/ggn_review`)
3. If clean: merge worktree branch into main
4. If issues: send feedback message to agent, agent fixes in same worktree
5. After merge: update TASKS.md status to Done

**Merge order:** Process in completion order. No file conflicts expected:
- R-1 touches `deploy/relay/` only
- SP-1 touches `specs/spawn.md` only
- W-2 touches `packages/wallet/` only

### Phase 4 — Cleanup

1. Shut down all agents (send shutdown_request to each)
2. Delete team
3. Update TASKS.md: W-2, R-1, SP-1, B-1 all marked Done
4. Move plan docs to `tasks/completed/`
5. Commit final state

## Agent Prompts

### wallet-dev (W-2)

> You are implementing W-2 for the AgentStack project. Read the plan doc at `tasks/active/w-2-wallet-creation-2026-02-24.md` — it is your complete specification.
>
> Implement exactly what the plan says. Create the files listed, wire the routes, write the tests. Use viem for key generation, node:crypto for AES-256-GCM, bun:sqlite for the database.
>
> Set `WALLET_MASTER_KEY` env to a test value in your test files. Run `pnpm -r check` before finishing.
>
> Do NOT modify: TASKS.md, any file outside `packages/wallet/`, any file in other packages.
>
> When done, commit with message: `W-2: implement wallet creation (keypair, keystore, SQLite)`

### relay-ops (R-1)

> You are implementing R-1 for the AgentStack project. Read the plan doc at `tasks/active/r-1-stalwart-docker-deploy-2026-02-24.md` — it is your complete specification.
>
> Create the Docker Compose file and deployment README at `deploy/relay/`. This is ops/config work — no TypeScript code.
>
> Validate with `docker compose -f deploy/relay/docker-compose.yml config` if Docker is available. If not, ensure the YAML is syntactically valid.
>
> Do NOT modify: TASKS.md, any file outside `deploy/relay/`.
>
> When done, commit with message: `R-1: Stalwart Docker Compose + deployment docs`

### spawn-spec (SP-1)

> You are implementing SP-1 for the AgentStack project. Read the plan doc at `tasks/active/sp-1-spawn-spec-2026-02-24.md` — it is your complete specification. Also read `specs/wallet.md` and `specs/relay.md` as structural references.
>
> Write `specs/spawn.md` following the structure of the existing specs. Include full JSON request/response examples for every endpoint, the Hetzner API mapping table, pricing model, VM lifecycle state machine, and unknowns.
>
> Do NOT modify: TASKS.md, any file outside `specs/`.
>
> When done, commit with message: `SP-1: spawn.sh spec (Hetzner wrapping, VM lifecycle, pricing)`

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Agent modifies files outside scope | Worktree isolation + explicit instruction. Review diff before merge. |
| TASKS.md merge conflict | Only lead updates TASKS.md. Agents never touch it. |
| pnpm-lock.yaml conflict (W-2 adds deps) | W-2 is the only agent adding npm deps. R-1 and SP-1 don't touch packages. Merge W-2 last if concerned. |
| Agent deviates from plan | Review against plan doc before merge. Send back with specific feedback if needed. |
| Agent gets stuck | Monitor idle notifications. If stuck >5 minutes with no progress, intervene with a message. |
| Tests fail after merge | Run `pnpm -r check` on main after each merge. Fix before merging next. |

## Success Criteria

- [ ] W-2: `POST /v1/wallets` returns real address, keypair encrypted in SQLite, tests pass
- [ ] R-1: `docker-compose.yml` validates, README documents deployment steps
- [ ] SP-1: `specs/spawn.md` covers all endpoints with JSON shapes, follows existing spec structure
- [ ] All three merged to main
- [ ] `pnpm -r check` passes on main after all merges
- [ ] TASKS.md updated: W-2, R-1, SP-1, B-1 all Done

## Before closing

- [ ] All agents shut down
- [ ] Team deleted
- [ ] No orphaned worktrees (`git worktree list`)
- [ ] Plan docs moved to `tasks/completed/`
- [ ] Final commit on main with TASKS.md updates
