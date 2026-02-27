# I-38: Hyperscaling Superagent Flywheel Factory

**Status**: planning
**Created**: 2026-02-27

## Vision

Prim ships prim.

The **hyperscaling superagent flywheel factory** is the endgame architecture where agents autonomously create, implement, test, and ship new primitives — and the primitives they ship include the tools to ship more primitives. Every primitive shipped makes the next one faster. Every provider added makes the next provider cheaper. The factory is not a developer tool; it is a primitive itself, accessible via x402, and the agents are the customers.

The loop:

```
agent has idea
  → create.sh (walks agent through full impl, returns file manifest)
  → pr.sh (opens PR from manifest)
  → CI quality gates (lint, typecheck, test, gen-check, conformance)
  → auto-merge on green
  → deploy.sh auto-ships to VPS
  → agent's new primitive is live

agent needs new provider
  → providers.sh (same flow — scaffold, implement, test, PR)
  → dekeys.sh provisions API key for the provider
  → CI gates → merge → live

agent needs API key for a provider
  → dekeys.sh (delegated key provisioning)
  → returns scoped, rotatable credential
  → no human signup, no KYC, no GUI
```

Each revolution of the loop is faster than the last because:
1. More providers exist → more templates to copy from
2. More smoke tests exist → better conformance coverage
3. More primitives exist → more composability for agents
4. CI learns from failures → fewer false positives

The human's role shifts from **implementer** to **curator** — reviewing PRs, approving key provisioning, and setting policy. Code is written by agents, validated by CI, deployed by automation.

---

## Inventory: Built / Not Built / Build Now / Build Later / Out of Scope

### Already built (leverage, don't rebuild)

| Component | What it does |
|---|---|
| `create.sh` HTTP endpoint | `POST /v1/scaffold` returns complete file manifest. Pure, no side effects. Live today. |
| `scaffoldPure()` library | Zero-IO scaffold function. Generates 9-11 files from prim.yaml. |
| `create-prim` CLI | Non-interactive mode works. Reads prim.yaml, scaffolds package. |
| `create-provider` CLI | Generates provider interface + vendor stub files. |
| `pnpm gen` pipeline | 10 generators (MCP, CLI, OpenAI, SDK, docs, tests, logos, etc.). Idempotent, offline-capable. |
| 5-check smoke test contract | Unit-level quality gate enforced for all 18 packages. |
| CI pipeline (`ci.yml`) | 5 parallel jobs: lint, typecheck, test, gen-check, audit + secret-scan. |
| Deploy pipeline (`deploy.yml`) | rsync → systemd restart → smoke verify. VPS + Cloudflare Pages. |
| Gate runner deterministic (`gate-runner.ts`) | 8 groups, 68 HTTP tests, x402 payment, shape matching. `--ci` mode with soft/hard fail gating. |
| Gate runner canary (`--canary`) | LLM agent reads llms.txt, gets wallet, exercises service end-to-end via infer.sh. |
| `gen:gate` codegen | Auto-generates test entries from prim.yaml routes_map. 42→68 tests. Idempotent. |

### Build now (Factory V1 — the critical path)

| Component | Phase | Why now |
|---|---|---|
| Provider template library + `gen-providers.ts` | 1 | Makes scaffolded code functional, not stubs. Validates the core thesis. |
| Upgrade `create.sh` to generate working implementations | 2 | Agents get test-passing code without human edits. |
| `pr.sh` primitive | 3 | Closes the loop: agent → code → PR → CI. No pr.sh = no flywheel. |
| Gate CI workflow (`gate.yml`, I-32) | 4 | Gate runner exists but doesn't run in CI. Straightforward GHA wrapper. |
| Auto-merge for `agent-pr` label | 4 | Green CI = ship. No human in the merge loop. |

### Build later (after Factory V1 proves out)

| Component | Phase | Why later |
|---|---|---|
| `providers.sh` primitive | 5 | Useful but not required — agents can use create-provider CLI via code.sh until then. |
| CI flood control (dedup, rate limit, stale cleanup) | 6 | Premature until agent PR volume is real. Start with manual monitoring. |
| Auto-register systemd units in `deploy.sh` | 7 | Nice-to-have. Manual `systemctl enable` is fine at <30 services. |
| DNS automation (domain.sh integration) | 7 | One `POST` to domain.sh per new prim. Can be manual for now. |
| Secrets provisioning command | 7 | Bridges to dekeys.sh. Manual SSH is tolerable at current scale. |
| Gate runner `--spawn` mode | — | Clean-room VPS testing. Layers 1-3 cover the critical path. |
| Zod schema generation from prim.yaml | 2+ | Eliminates hand-written validation. Can be added incrementally. |

### Out of scope (not building)

| Component | Why not |
|---|---|
| AI code review in the merge loop | Merge decision is deterministic (CI green → merge). LLM is in the canary (post-deploy usability), not pre-merge. |
| Multi-repo support for pr.sh | pr.sh targets the prim repo only. No generic GitHub automation platform. |
| Agent orchestration / task assignment | The factory doesn't decide what to build. Agents decide. The factory executes. |
| Custom runtimes per primitive | All prims run on Bun. Container isolation is spawn.sh's job, not the factory's. |
| Horizontal VPS scaling | Single VPS handles current load. When we hit the ceiling, spawn.sh provisions more nodes. Not a factory concern. |

---

## Architecture

### The Flywheel (data flow)

```
                    ┌─────────────────────────┐
                    │      AGENT (caller)      │
                    └────┬───────────┬─────────┘
                         │           │
                    x402 │      x402 │
                         ▼           ▼
                  ┌──────────┐ ┌──────────┐
                  │create.sh │ │provdrs.sh│
                  └────┬─────┘ └────┬─────┘
                       │            │
                       ▼            ▼
                 ┌───────────────────────┐
                 │   file manifest (JSON) │
                 └───────────┬───────────┘
                             │
                        x402 │
                             ▼
                      ┌──────────┐
                      │  pr.sh   │
                      └────┬─────┘
                           │
                    git push + gh pr create
                           │
                           ▼
              ┌────────────────────────────┐
              │     GitHub Actions CI       │
              │  lint → type → test → gen  │
              │  conformance → gate-check  │
              └──────────┬─────────────────┘
                         │
                    green? ──→ auto-merge
                         │
                         ▼
              ┌────────────────────────────┐
              │     deploy.yml (GHA)        │
              │  rsync → systemd → verify  │
              └────────────────────────────┘
                         │
                         ▼
                 ┌───────────────┐
                 │  PRIMITIVE IS  │
                 │     LIVE       │
                 └───────────────┘
```

### Key design decisions

1. **create.sh returns file manifests, not commits.** The separation between "generate code" and "commit code" is intentional. create.sh is pure; pr.sh handles git. This lets agents inspect, modify, or compose manifests before committing.

2. **pr.sh is the git boundary.** Only pr.sh touches git. This means CI flood control lives in one place. pr.sh can rate-limit, deduplicate, and validate before pushing.

3. **Four-layer quality gates, not just CI.** The gate runner (I-30) already implements a progression that maps directly to the prim lifecycle:

   ```
   Layer 1: Unit smoke tests (5-check, mocked)          → building gate
   Layer 2: Gate runner deterministic (68 HTTP tests)    → testing gate
   Layer 3: Agent canary (LLM via infer.sh, --canary)   → live gate
   Layer 4: Clean-room VPS (--spawn, not built)          → live gate (ultimate)
   ```

   | Layer | What it proves | Who runs it | When |
   |---|---|---|---|
   | Unit smoke tests | Code compiles, routes wired, middleware registered | CI on every PR | Always |
   | Gate runner `--ci` | API contract: correct status codes, response shapes, x402 payment flow | CI on main push (gate.yml, I-32) | building→testing |
   | Agent canary `--canary` | Agent usability: can an LLM read llms.txt and actually use the service? | Schedule or manual trigger | testing→live |
   | VPS isolation `--spawn` | Full isolation: fresh VPS, wallet, fund, test, teardown | Manual or release gate | testing→live |

   A prim moves `testing→live` only when layers 1-3 pass. Layer 4 is opt-in until `--spawn` is built.

   CI is the **correctness** bar. Humans review for **policy** (is this primitive appropriate?) not correctness (does the code work?). Auto-merge on green is the default; policy review is opt-in via labels or CODEOWNERS.

4. **Provider implementations are generated from known API specs.** Most provider APIs have published OpenAPI specs or well-documented REST endpoints. A provider template library maps API patterns to implementation patterns. The agent doesn't write HTTP client code — the factory does.

5. **dekeys.sh closes the key loop.** Without API keys, providers are useless. dekeys.sh provisions scoped, rotatable credentials so agents can self-serve. This is the hardest piece and the biggest unlock.

---

## Phases

### Phase 1: Pre-Build All Known Providers (I-39)

**Goal**: Convert the 20+ phantom primitives from "idea" to "testable code" by generating provider implementations from known API specs.

**Approach**:
- Catalog all phantom prims and their target providers (Twilio, Hetzner, Stripe, SendGrid, Cloudflare, etc.)
- For each provider, find the published OpenAPI spec or REST API docs
- Build a provider template library with patterns: REST-JSON wrapper, SDK wrapper, CLI wrapper
- Write `scripts/gen-providers.ts` that reads prim.yaml + provider API spec → generates complete `service.ts` + `<vendor>.ts`
- Run `pnpm gen` to cascade downstream (MCP, CLI, OpenAI, SDK, docs)
- Result: every phantom prim has a passing 5-check smoke test with real (mocked) provider calls

**Provider API knowledge base** (known APIs we can pre-build today):

| Prim | Provider | API Type | Spec Available |
|---|---|---|---|
| ring.sh | Twilio | REST | OpenAPI ✓ |
| pipe.sh | NATS / RabbitMQ | SDK | Docs ✓ |
| vault.sh | HashiCorp Vault | REST | OpenAPI ✓ |
| cron.sh | Internal (Bun cron) | Native | N/A |
| code.sh | E2B / Modal | REST | OpenAPI ✓ |
| browse.sh | Browserbase / Playwright | REST+WS | Docs ✓ |
| watch.sh | Better Uptime / Checkly | REST | OpenAPI ✓ |
| trace.sh | Sentry / Axiom | REST | OpenAPI ✓ |
| auth.sh | Clerk / Auth0 | REST | OpenAPI ✓ |
| id.sh | Persona / Onfido | REST | OpenAPI ✓ |
| pins.sh | Google Maps / Mapbox | REST | OpenAPI ✓ |
| mart.sh | Stripe / Shopify | REST | OpenAPI ✓ |
| ship.sh | ShipEngine / EasyPost | REST | OpenAPI ✓ |
| hands.sh | TaskRabbit / Mechanical Turk | REST | Docs ✓ |
| pay.sh | Stripe / Square | REST | OpenAPI ✓ |
| corp.sh | Stripe Atlas / FirstBase | REST | Docs partial |
| hive.sh | Discord / Slack | REST+WS | OpenAPI ✓ |
| ads.sh | Meta / Google Ads | REST | Docs ✓ |
| seek.sh | Perplexity / Exa | REST | Docs ✓ |
| docs.sh | Mintlify / ReadMe | REST | Docs ✓ |

**Not all of these will be built in Phase 1.** The goal is the template library + tooling, validated against 3-5 real provider implementations. The rest follow mechanically.

### Phase 2: Upgrade create.sh to End-to-End (I-40)

**Goal**: `POST /v1/create` accepts a natural language idea or structured spec, returns a complete, test-passing file manifest — not stubs.

**What changes**:
- create.sh currently returns skeleton stubs for `service.ts` and provider files
- Upgrade `scaffoldPure()` to generate **functional** service implementations using the provider template library from Phase 1
- Add `POST /v1/create` route that accepts `{ idea: string }` or `{ spec: PrimYaml }`:
  - If `idea`: use LLM (via infer.sh) to produce a `PrimYaml` spec, then scaffold
  - If `spec`: scaffold directly
- Add `POST /v1/validate` route that takes a file manifest and runs the 5-check smoke tests in-memory (Bun test runner)
- Result: agent gets back a manifest that passes smoke tests without modification

**Zod schema generation**:
- Currently `api.ts` contains bare TypeScript interfaces — no runtime validation
- Generate Zod schemas from `prim.yaml` route specs (request/response types, field constraints)
- Emit `src/schemas.ts` alongside `src/api.ts`
- Route handlers call `schema.parse(body)` — validation is free, not hand-written

### Phase 3: Build pr.sh (I-41)

**Goal**: A primitive that takes a file manifest + metadata and opens a GitHub PR.

**Routes**:
- `POST /v1/pr` — accepts `{ repo, branch, files: FileManifest[], title, body }`, returns `{ pr_url, pr_number }`
- `POST /v1/pr/:id/status` — returns CI status for a PR
- `POST /v1/pr/:id/merge` — merges a PR if CI is green

**Implementation**:
- Wraps GitHub API (or `gh` CLI via spawn.sh for isolation)
- Creates branch, commits files, pushes, opens PR
- Polls CI status via GitHub Checks API
- Auto-merge via `gh pr merge --auto --squash`

**Security model**:
- pr.sh has a GitHub App token scoped to the prim repo
- Agent cannot specify arbitrary repos (allowlist in config)
- Branch naming convention: `agent/<prim-id>-<timestamp>`
- Force-push protection: pr.sh never force-pushes

### Phase 4: CI Quality Gates + Auto-Merge (I-42)

**Goal**: Wire the existing gate runner into CI as the merge gate. Green PRs auto-merge. Red PRs get feedback. Builds on I-32 (gate.yml, not yet built).

**The full CI pipeline for an agent PR**:

```
PR opened (by pr.sh, labeled `agent-pr`)
  │
  ├── ci.yml (existing, runs on every PR)
  │   ├── lint (biome)
  │   ├── typecheck
  │   ├── test (unit smoke tests — layer 1)
  │   ├── gen-check (generated files fresh)
  │   └── audit + secret-scan
  │
  ├── gate.yml (I-32, new — runs on PRs touching packages/)
  │   ├── Detect changed prims (git diff --name-only packages/*/prim.yaml)
  │   ├── gate-runner.ts --ci --group <changed-prims>
  │   │   ├── testing prims: soft-fail (warn, don't block)
  │   │   └── live prims: hard-fail (block merge)
  │   └── Post results as PR comment (test summary table)
  │
  └── auto-merge (new job)
      ├── needs: [ci, gate]
      ├── if: all green + label `agent-pr`
      └── gh pr merge --auto --squash
```

**After merge to main** (for prims transitioning testing→live):

```
gate.yml (on push to main, schedule, or manual)
  ├── gate-runner.ts --ci             (layer 2: deterministic HTTP, 68 tests)
  ├── gate-runner.ts --canary         (layer 3: LLM agent exercises service)
  └── gate-runner.ts --spawn          (layer 4: clean-room VPS, future)
```

**PR labeling**:
- PRs opened by pr.sh get the `agent-pr` label automatically
- `agent-pr` label enables auto-merge on all-green
- Human PRs don't get the label → require manual merge
- CODEOWNERS can override: specific paths require human approval even on agent PRs

**CI feedback loop**:
- On failure: GHA posts a comment with the failing check + log excerpt + gate runner output
- Agent reads the comment via `pr.sh GET /v1/pr/:id/status` and can retry
- On persistent failure (3+ consecutive red runs from same wallet): PR auto-closed with summary
- Agent canary failures produce `ux_notes` — actionable feedback the agent can use to fix llms.txt or error messages

**Canary as promotion gate**:
- A prim at `status: testing` can only move to `status: live` when `--canary` passes
- This means an LLM agent has successfully read the llms.txt, obtained a wallet, paid x402, and completed the service workflow end-to-end
- This is the "would a real agent actually be able to use this?" test — the highest quality bar before going live

### Phase 5: Build providers.sh (I-43)

**Goal**: A primitive that scaffolds provider implementations for existing prims.

**Routes**:
- `POST /v1/provider` — accepts `{ prim_id, vendor, api_spec_url? }`, returns file manifest
- `GET /v1/providers` — lists all prims and their current provider coverage

**Implementation**:
- Reads the target prim's `provider.ts` interface
- Fetches the vendor's API spec (OpenAPI URL, or falls back to provider template library)
- Generates `<vendor>.ts` with real HTTP client calls, auth handling, error mapping
- Includes smoke test additions for the new provider
- Returns file manifest → agent sends to pr.sh

### Phase 6: CI Flood Control (I-44)

**Goal**: Handle high-volume agent PR inbound without drowning CI or the repo.

**Problems to solve**:

1. **Duplicate PRs** — Agent retries create identical PRs
2. **Conflicting PRs** — Two agents modify the same primitive
3. **CI resource exhaustion** — 50 PRs queued, all running CI
4. **Stale PRs** — Agent opens PR, never comes back
5. **Spam / abuse** — Malicious agent floods repo

**Solutions**:

```
Deduplication:
  - pr.sh hashes the file manifest content
  - Before opening PR, checks if an open PR with the same hash exists
  - If yes: returns existing PR URL instead of creating a new one

Conflict detection:
  - pr.sh checks for open PRs touching the same packages/ directory
  - If conflict: returns 409 with the conflicting PR URL
  - Agent can either wait or coordinate

CI concurrency:
  - GitHub Actions concurrency group per PR: `ci-${{ github.event.pull_request.number }}`
  - Max concurrent CI runs: configurable (start with 5)
  - Queue overflow: newest PRs wait, oldest run first

Stale PR cleanup:
  - Scheduled GHA workflow (daily): close PRs with no activity for 7 days
  - Label: `stale-agent-pr`
  - Comment: "This PR has been inactive for 7 days. Closing. Reopen or create a new PR to continue."

Rate limiting:
  - pr.sh rate-limits per wallet: max 10 PRs/hour, max 50 PRs/day
  - x402 pricing can be used as economic rate limiting ($0.05 per PR?)
  - Abuse detection: if >3 consecutive red PRs from same wallet, cool-down period
```

### Phase 7: Auto-Register + Auto-Deploy New Prims (I-45)

**Goal**: New primitives go live without SSH.

**What changes**:

**deploy.sh upgrades**:
```bash
# Scan for new service files not yet installed
for svc in deploy/prim/services/prim-*.service; do
  name=$(basename "$svc")
  if ! systemctl is-enabled "$name" 2>/dev/null; then
    cp "$svc" /etc/systemd/system/
    systemctl daemon-reload
    systemctl enable "$name"
    systemctl start "$name"
    echo "NEW SERVICE: $name enabled and started"
  fi
done

# Regenerate Caddyfile from fragments
cat deploy/prim/caddy-header.conf deploy/prim/generated/*.caddy > /etc/caddy/Caddyfile
systemctl reload caddy
```

**Secrets provisioning**:
- `deploy-prim.ts` generates `.env.template` with all required vars
- New command: `pnpm secrets:provision <id>` — SSHs to VPS, diffs template vs installed env, prompts for missing values
- Long-term: dekeys.sh provisions provider keys automatically → no human SSH needed

**DNS automation**:
- New prim gets `<id>.prim.sh` subdomain
- `deploy-prim.ts` calls domain.sh to create the A record pointing to VPS IP
- Caddy auto-TLS handles the cert

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Generated code quality** — LLM-generated service.ts may have subtle bugs that pass smoke tests but fail in production | High | Gate runner live checks (POST to endpoint, assert 402). Mandatory live smoke test before `status: live`. Human review for first N agent-generated prims until confidence builds. |
| **API key leakage** — Agent-provisioned keys leak via logs, error messages, or git commits | Critical | Secret scanning in CI (gitleaks). Never log env vars. dekeys.sh keys are scoped + rotatable + short-lived. Provider keys never appear in file manifests. |
| **CI cost explosion** — High-volume agent PRs exhaust GHA minutes | High | Concurrency limits (Phase 6). Economic rate limiting via x402 pricing on pr.sh. Free tier: 0 PRs. Paid tier: $0.05/PR caps volume naturally. |
| **Merge conflicts** — Multiple agents modify the same package simultaneously | Medium | pr.sh conflict detection (Phase 6). Branch naming convention prevents silent overwrites. Worst case: agent gets 409, retries after conflicting PR merges. |
| **Vendor API drift** — Pre-built provider implementations break when vendor APIs change | Medium | Pin provider API versions in prim.yaml. Live smoke tests catch drift. Provider template library is versioned. |
| **Runaway auto-merge** — Bug in CI lets broken code auto-merge to main | High | Branch protection rules: require all checks to pass. CODEOWNERS for critical paths (x402-middleware, deploy/). Auto-merge only on `agent-pr` label, which pr.sh controls. |

---

## Unknowns

| Unknown | Impact | How to Resolve |
|---|---|---|
| **Can generated provider implementations pass live smoke tests without human tuning?** | Determines whether Phase 1 actually saves time or just shifts work | Build 3 providers (ring.sh/Twilio, watch.sh/BetterUptime, code.sh/E2B). If 2/3 pass live smoke tests without manual edits, the approach works. |
| **Will agents actually use create.sh?** | Determines whether this is infrastructure or a product | Ship create.sh as-is, track usage via x402 payment logs. If agents use it, invest more. If not, the factory still benefits internal velocity. |
| **How much does dekeys.sh actually unlock?** | Without keys, providers.sh generates code that can't run | Start with providers that have free tiers or test modes (Twilio trial, Stripe test mode). dekeys.sh is the long-term solve; free-tier keys are the short-term bridge. |
| **What's the right granularity for auto-merge policy?** | Too permissive → bad code ships. Too restrictive → agents are blocked. | Start conservative: auto-merge only for phantom→building transitions (new prims). Require human review for changes to live prims. Relax as confidence builds. |
| **Will CI handle the inbound volume?** | GHA has concurrency limits, queue depth limits | Stress test: open 20 PRs simultaneously, measure queue time and cost. If >$50/day in GHA minutes, add self-hosted runner or switch to Buildkite. |

---

## Blockers

| Blocker | Blocks | Resolution |
|---|---|---|
| **dekeys.sh not built** | Phase 5 (providers.sh full automation), Phase 7 (zero-human deploy) | Use free-tier / test-mode keys as bridge. dekeys.sh plan exists at `tasks/active/dk-1-dekeys-plan.md`. |
| **OG image generator broken** | `pnpm gen:check` exits 1, CI gate is red | Fix or exclude from gen:check. Blocking CI reliability. |
| **Gate CI workflow not wired (I-32)** | Phase 4 (gate runner exists but doesn't run in CI) | gate-runner.ts is done (68 tests, `--ci`, `--canary`). Missing: `.github/workflows/gate.yml` to run it on PRs/pushes. Straightforward GHA job. |
| **`--spawn` mode not built** | Layer 4 validation (clean-room VPS testing) | Requires spawn.sh + wallet funding in CI. Design exists in I-30 plan. Not blocking — layers 1-3 cover the critical path. |
| **Live smoke tests optional** | Phase 2 (can't validate generated code works against real APIs) | Make `smoke-live.test.ts` mandatory for `status: live` prims. Scaffold it in create-prim. |
| **GitHub App token for pr.sh** | Phase 3 (pr.sh needs repo write access) | Create GitHub App with scoped permissions: contents:write, pull_requests:write, checks:read. |

---

## Rollout Strategy

The factory doesn't launch as a big bang. Stable release stays untouched. A small beta cohort validates the loop. Then we scale or fix and repeat.

```
┌─────────────────────────────────────────────────────────────────┐
│  STABLE (now)          BETA                 GA                  │
│  ─────────────         ────                 ──                  │
│  9 live prims          3-5 invited agents   auto-merge on green │
│  human merges          manual merge review  agent-pr label      │
│  manual deploy         CI gates enforced    auto-deploy         │
│  no agent PRs          PRs to main branch   flood control live  │
│                        canary validates     canary + spawn      │
│                                                                 │
│  ◄── we are here       ◄── Factory V1       ◄── Factory V2      │
└─────────────────────────────────────────────────────────────────┘
```

### Stable (current state, unchanged)

- 9 live prims running in production, untouched by factory changes
- Human-authored PRs, human-merged, human-deployed
- Gate runner validates on schedule, canary runs manually
- **Nothing changes here until beta proves out**

### Beta (Factory V1 ships, invite-only)

- Invite 3-5 agents (internal or trusted partners) to use `create.sh` + `pr.sh`
- Agent PRs land on `main` but require **manual merge review** (no auto-merge yet)
- CI gates (ci.yml + gate.yml) run on every agent PR — must pass to be merge-eligible
- Human curator reviews: is this prim appropriate? Does the generated code look sane?
- After merge: deploy is still the existing GHA pipeline (no changes to stable deploy)
- `--canary` runs post-deploy to validate agent usability
- **Exit criteria for beta**: 5+ agent-generated prims merged with zero human code edits required

### GA (Factory V2, auto-merge enabled)

- Auto-merge on green for `agent-pr` labeled PRs
- CI flood control live (dedup, rate limiting, stale cleanup)
- Auto-register new systemd units in deploy.sh
- `--canary` as promotion gate (testing→live)
- `--spawn` for release-grade validation
- Human review only for CODEOWNERS-protected paths (x402-middleware, deploy/)
- **Exit criteria**: sustained agent PR throughput with <5% revert rate

### Rollback at any stage

If beta produces bad outcomes (broken prims, CI overload, quality issues):
1. Remove `agent-pr` label handling from CI → agent PRs require human merge again
2. Rate-limit or disable pr.sh → agents can't open PRs
3. Revert to stable — zero impact on running prims since factory only adds, never modifies live services

The factory is additive. It can't break what's already running.

---

## Factory V1 Milestone (the MVP)

Factory V1 is the minimum viable flywheel. An agent can go from idea to merged PR with zero human code edits. Human still reviews and merges.

**What ships in V1**:
- Provider template library validated against 3-5 real providers (Phase 1, partial)
- `create.sh` generates functional implementations, not stubs (Phase 2)
- `pr.sh` primitive (Phase 3)
- `gate.yml` wired in CI (I-32, Phase 4 partial)
- Manual merge review (no auto-merge)

**What does NOT ship in V1**:
- Auto-merge, flood control, providers.sh, auto-deploy, dekeys.sh
- These are Factory V2 (GA) scope

**V1 validates the thesis**: can the factory generate code good enough that a human reviewer approves without edits? If yes, auto-merge is safe to enable. If no, fix the generators before scaling.

---

## Success Metrics

| Metric | Current | V1 (Beta) | V2 (GA) |
|---|---|---|---|
| Time: idea → passing smoke test | ~4 hrs (human) | <10 min (agent) | <5 min |
| Time: tests pass → live in production | ~30 min (manual) | ~30 min (same) | <10 min (auto) |
| Prims with working provider implementations | 9/34 | 14/34 | 25/34 |
| Agent PRs merged without human code edits | 0% | >50% | >80% |
| Agent PRs that pass CI on first attempt | N/A | >70% | >90% |
| CI false positive rate | Unknown | <10% | <5% |
| Reverts caused by agent PRs | N/A | 0 | <5% of merges |

---

## Dependency Graph

```
ALREADY DONE (leverage, don't rebuild)
──────────────────────────────────────
gate-runner.ts (I-30)  ──── 68 tests, --ci, --canary
gen:gate (I-33)        ──── auto-gen test entries from prim.yaml
create.sh /v1/scaffold ──── returns file manifests today
scaffoldPure()         ──── zero-side-effect scaffold library

TO BUILD
──────────────────────────────────────
Phase 1 (pre-build providers) ─────────┐
                                        ├──→ Phase 2 (create.sh upgrade)
Fix OG images (unblock CI) ────────────┘            │
                                                     │
Gate CI workflow (I-32) ─────────────────────────────┤
                                                     │
Phase 3 (pr.sh) ─────────────────────────────────────┤
                                                     │
                                                     ▼
                                           Phase 4 (CI gates + auto-merge)
                                                     │
                                          ┌──────────┼──────────┐
                                          ▼          ▼          ▼
                                   Phase 5      Phase 6     Phase 7
                                  (provdrs.sh) (flood ctrl) (auto-deploy)
                                       │
                                       ▼
                                  dekeys.sh (DK-1)
                                  (unblocks full auto)
```

**Critical path**: Phase 1 → Phase 2 + Phase 3 + I-32 (parallel) → Phase 4 → Phase 7

I-32 (gate.yml) is the cheapest high-leverage item — the gate runner already works, it just needs a GHA wrapper. Phase 3 (pr.sh) and Phase 1 (providers) can proceed in parallel.

Phases 5 and 6 are enhancements built after the critical path.

---

## Before Closing

- [ ] Run `pnpm check` (lint + typecheck + tests pass)
- [ ] Validate that all referenced task IDs exist in tasks.json
- [ ] Verify provider API specs are actually available (spot-check 5)
- [ ] Confirm GitHub App creation process for pr.sh
- [ ] Stress test CI with concurrent PR volume before enabling auto-merge
- [ ] Review auto-merge policy with CODEOWNERS before enabling
