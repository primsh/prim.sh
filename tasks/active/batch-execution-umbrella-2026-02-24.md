# Batch Execution Umbrella — Agent team rollout for AgentStack

**Status:** Plan
**Scope:** All open tasks across wallet.sh, relay.sh, and spawn.sh
**Executor:** Claude Code agent teams (Opus lead, Sonnet/Haiku implementers)

## Context

AgentStack has 23 open implementation tasks across three primitives (wallet, relay, spawn). The dependency graph creates natural waves — groups of tasks with no interdependencies that can run in parallel. Each wave is a Claude Code agent team: agents spawn in worktrees, implement against plan docs, get reviewed, and merge to main. The next wave launches only after the previous wave's merges are clean.

## Dependency Graph

```
Wave 1:  W-2 ──────┐    R-1 ───┐    SP-1 ──┐
                    │           │            │
Wave 2:  W-3        │    R-2*   │    SP-2    │
         W-4 ──┐    │           │    SP-3    │
         W-5   │    │           │    SP-4    │
               │    │           │    SP-5    │
Wave 3:  W-6   │    │    R-3 ──┐│            │
         W-7   │    │    R-7   ││            │
         W-8   │    │    R-9   ││            │
         W-9   │    │          ││            │
               │    │          ││            │
Wave 4:        │    │    R-4 ──┤│            │
               │    │    R-8   ││            │
               │    │    R-10  ││            │
               │    │          ││            │
Wave 5:        │    │    R-5   ││            │
               │    │    R-6   ││            │

* R-2 is manual ops (DNS/TLS on live VPS), not agent work
```

## Wave Definitions

### Wave 1 — Foundation (3 agents)

**Gate:** All plan docs committed (done).
**Team name:** `agentstack-wave-1`

| Agent | Task | Model | Scope | Complexity |
|-------|------|-------|-------|------------|
| `wallet-dev` | W-2: wallet creation | Sonnet | `packages/wallet/` | High — 6 files, crypto, SQLite, viem |
| `relay-ops` | R-1: Stalwart Docker | Haiku | `deploy/relay/` | Low — 3 config/doc files |
| `spawn-spec` | SP-1: spawn.sh spec | Sonnet | `specs/` | Medium — spec writing |

**Exit criteria:** All merged, `pnpm -r check` passes.
**Unblocks:** Wave 2.

### Wave 2 — Wallet core + relay config (3-4 agents)

**Gate:** W-2 merged. R-1 merged. SP-1 merged.
**Team name:** `agentstack-wave-2`

| Agent | Task | Model | Scope | Complexity |
|-------|------|-------|-------|------------|
| `wallet-balance` | W-3: balance queries (Base USDC via RPC) | Sonnet | `packages/wallet/` | Medium — viem readContract, RPC |
| `wallet-send` | W-4: send (USDC transfer on Base) | Sonnet | `packages/wallet/` | High — on-chain tx, EIP-3009 |
| `wallet-x402` | W-5: x402 client (`@x402/fetch` wrapper) | Sonnet | `packages/wallet/` | Medium — wrap existing SDK |
| `spawn-build` | SP-2: VM provisioning via Hetzner API | Sonnet | `packages/spawn/` | Medium — HTTP client, Hetzner API |

**R-2 (Stalwart DNS/TLS config)** runs in parallel but is a **human task** — manual DNS records, ACME setup on the live VPS. Not agent work. Must complete before wave 3's relay tasks can start.

**File conflict risk:** W-3, W-4, W-5 all touch `packages/wallet/`. They modify different files (balance module vs send module vs x402 client module) but share `index.ts` for route wiring. Mitigation: each agent only wires its own routes. Lead reviews for conflicts before merging. Merge order: W-3 → W-5 → W-4 (send depends on balance check working).

**Exit criteria:** All merged, `pnpm -r check` passes, R-2 done (manual).
**Unblocks:** Wave 3.

### Wave 3 — Wallet policies + relay wrapper + spawn lifecycle (up to 8 agents)

**Gate:** W-4 merged. R-2 done (manual). SP-2 merged.
**Team name:** `agentstack-wave-3`

| Agent | Task | Model | Scope | Complexity |
|-------|------|-------|-------|------------|
| `wallet-funding` | W-6: funding request flow | Sonnet | `packages/wallet/` | High — multi-step, notifications |
| `wallet-policy` | W-7: budget/spending policy engine | Sonnet | `packages/wallet/` | Medium — policy rules, daily resets |
| `wallet-journal` | W-8: execution journal + idempotency | Sonnet | `packages/wallet/` | Medium — port from Railgunner |
| `wallet-breaker` | W-9: circuit breaker | Haiku | `packages/wallet/` | Low — simple state machine, port from Railgunner |
| `relay-mailbox` | R-3: mailbox creation (Stalwart REST) | Sonnet | `packages/relay/` | Medium — Stalwart admin API |
| `relay-webhook` | R-7: incoming mail webhooks (MTA Hooks) | Sonnet | `packages/relay/` | Medium — webhook receiver |
| `relay-domain` | R-9: custom domain support | Sonnet | `packages/relay/` | Medium — DNS record generation |
| `spawn-lifecycle` | SP-3 + SP-4: VM lifecycle + SSH keys | Sonnet | `packages/spawn/` | Medium — Hetzner API CRUD |

**This is the largest wave.** Can split into 3a (wallet) and 3b (relay + spawn) if 8 simultaneous agents is too many. Wallet tasks are independent of relay/spawn and could run as a sub-wave.

**File conflict risk (wallet):** W-6, W-7, W-8, W-9 all add modules to `packages/wallet/`. Each creates its own new files. `index.ts` route wiring is the shared touch point. Same mitigation as wave 2.

**Exit criteria:** All merged, `pnpm -r check` passes.
**Unblocks:** Wave 4.

### Wave 4 — Relay core (3 agents)

**Gate:** R-3 merged.
**Team name:** `agentstack-wave-4`

| Agent | Task | Model | Scope | Complexity |
|-------|------|-------|-------|------------|
| `relay-oauth` | R-4: OAuth token cache for JMAP auth | Sonnet | `packages/relay/` | Medium — token lifecycle |
| `relay-ttl` | R-8: mailbox TTL/expiry manager | Haiku | `packages/relay/` | Low — cron-like cleanup |
| `relay-x402` | R-10: x402 middleware integration | Haiku | `packages/relay/` | Low — wire existing middleware |
| `spawn-x402` | SP-5: x402 middleware integration | Haiku | `packages/spawn/` | Low — wire existing middleware |

**Exit criteria:** All merged, `pnpm -r check` passes.
**Unblocks:** Wave 5.

### Wave 5 — Relay messaging (2 agents)

**Gate:** R-4 merged.
**Team name:** `agentstack-wave-5`

| Agent | Task | Model | Scope | Complexity |
|-------|------|-------|-------|------------|
| `relay-read` | R-5: read messages (JMAP Email/query + Email/get) | Sonnet | `packages/relay/` | Medium — JMAP protocol |
| `relay-send` | R-6: send messages (JMAP EmailSubmission/set) | Sonnet | `packages/relay/` | Medium — JMAP protocol |

**Exit criteria:** All merged, `pnpm -r check` passes. All 23 tasks done.

## Planning Pipeline

Each wave's tasks need plan docs before agents can execute. Planning happens during the current wave's execution:

| While executing... | Plan for... |
|-------------------|-------------|
| Wave 1 | Wave 2 tasks (W-3, W-4, W-5, SP-2) |
| Wave 2 | Wave 3 tasks (W-6–W-9, R-3, R-7, R-9, SP-3/SP-4) |
| Wave 3 | Wave 4 tasks (R-4, R-8, R-10, SP-5) |
| Wave 4 | Wave 5 tasks (R-5, R-6) |

The lead (Opus) writes plans while agents implement. Plans are committed to `tasks/active/` and linked in TASKS.md before the next wave launches.

## Per-Wave Protocol

Every wave follows the same protocol:

1. **Pre-flight:** Verify all plan docs exist for this wave's tasks. Verify previous wave's exit criteria are met. `pnpm -r check` passes on main.
2. **Launch:** Create team. Spawn agents in worktrees with plan doc prompts. Each agent is scoped to specific directories.
3. **Monitor:** Agents work autonomously. Lead writes next wave's plans in parallel.
4. **Review:** As agents complete, review diffs against plan docs. Fix or send back.
5. **Merge:** Merge clean worktrees to main in dependency-safe order. Run `pnpm -r check` after each merge.
6. **Cleanup:** Shut down agents, delete team, update TASKS.md, move plan docs to `tasks/completed/`.

## Model Selection Guide

| Task type | Model | Rationale |
|-----------|-------|-----------|
| New module with crypto/chain interaction | Sonnet | Needs to understand viem, EIP-3009, chain concepts |
| New module wrapping external HTTP API | Sonnet | Needs judgment about error handling, retries, auth |
| Spec/doc writing | Sonnet | Needs design judgment, follows existing patterns |
| Wiring existing middleware (x402, routes) | Haiku | Mechanical, plan doc is fully prescriptive |
| Port from Railgunner (circuit breaker) | Haiku | Pattern is documented, translation is mechanical |
| Docker/ops config | Haiku | Config files, no complex logic |

## Risk Mitigation (all waves)

| Risk | Mitigation |
|------|-----------|
| File conflicts within a wave | Agents get exclusive directory scopes. Shared files (index.ts) wired one agent at a time via merge order. |
| TASKS.md conflicts | Only lead updates TASKS.md. Agents never touch it. |
| pnpm-lock.yaml conflicts | Only one agent per wave adds new npm deps. Others don't touch packages. Merge dep-adding agent last. |
| Agent deviates from plan | Review diff against plan doc before merge. Reject and send back if needed. |
| Agent stuck | If no progress after 5 min idle, intervene with a message or take over. |
| Tests fail after merge | Run `pnpm -r check` after each merge. Fix before merging next agent's work. |
| Wave too large (wave 3) | Split into sub-waves: 3a (wallet: W-6–W-9) then 3b (relay+spawn: R-3, R-7, R-9, SP-3/SP-4). |
| R-2 blocks relay chain | R-2 is manual. If not done by wave 3, relay tasks (R-3, R-7, R-9) defer to wave 4. Wallet and spawn proceed unblocked. |

## Summary

| Wave | Tasks | Agents | Models | Key output |
|------|-------|--------|--------|------------|
| 1 | W-2, R-1, SP-1 | 3 | 2 Sonnet, 1 Haiku | Wallet creation, Stalwart running, spawn spec |
| 2 | W-3, W-4, W-5, SP-2 | 4 | 4 Sonnet | Wallet fully functional (create, balance, send, x402 client) |
| 3 | W-6–W-9, R-3, R-7, R-9, SP-3/SP-4 | 7-8 | 6 Sonnet, 1-2 Haiku | Wallet policies, relay mailboxes, spawn lifecycle |
| 4 | R-4, R-8, R-10, SP-5 | 4 | 2 Sonnet, 2 Haiku | Relay OAuth, TTL, x402 gates |
| 5 | R-5, R-6 | 2 | 2 Sonnet | Relay read/send messages |
| **Total** | **23 tasks** | **20-21 agent runs** | | **Three primitives fully implemented** |

## Before closing (entire umbrella)

- [ ] All 23 tasks marked Done in TASKS.md
- [ ] `pnpm -r check` passes on main
- [ ] No orphaned worktrees (`git worktree list` shows only main)
- [ ] All plan docs moved to `tasks/completed/`
- [ ] wallet.sh: all 15 endpoints return real responses (not 501)
- [ ] relay.sh: mailbox creation, read, send, webhooks all functional against Stalwart
- [ ] spawn.sh: VM create, lifecycle, SSH keys all functional against Hetzner API
