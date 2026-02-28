# Agent Contribution Pipeline — Research Spec

## Vision

Agents autonomously extend the prim ecosystem: discover a missing capability, scaffold a prim, open a PR, have it tested and merged — no human in the loop.

## The Loop

```
agent needs capability
  → create.sh scaffolds the prim
  → pr.sh opens a PR with the new package
  → GHA spawns a test agent (via spawn.sh) to exercise the new prim
  → auto-merge if CI green + dedup check passes
  → new prim available to all agents
```

## Primitives Required

### create.sh (scaffolder-as-a-service)
- `POST /v1/scaffold` — accepts prim.yaml spec, returns generated package files
- `POST /v1/validate` — validates a spec without generating
- `GET /v1/schema` — returns prim.yaml JSON schema
- `GET /v1/ports` — returns allocated ports + next available
- Free service. Already scaffolded via factory.

### pr.sh (GitHub PR management)
- Wraps GitHub API (`gh` CLI or REST)
- `POST /v1/pr/create` — create PR from branch + title + body
- `POST /v1/pr/update` — push commits to existing PR
- `GET /v1/pr/status` — check CI status, review status
- `GET /v1/pr/comments` — read review comments
- Scoped to the prim repo (or configurable)

### issue.sh (GitHub issue management)
- `POST /v1/issue/create` — open issue (request a prim, report a bug)
- `GET /v1/issue/list` — list open issues
- `POST /v1/issue/comment` — add comment
- Could also serve as the dedup layer (before creating, search existing issues)

## Contribution Pipeline (GHA)

### Auto-test workflow
```yaml
on: pull_request
  paths: 'packages/*/prim.yaml'

jobs:
  validate-prim:
    # 1. Validate prim.yaml against schema
    # 2. Run scaffolder to verify it produces valid output
    # 3. Run smoke tests on the scaffolded package
    # 4. Spawn an agent (via spawn.sh) that:
    #    - Starts the new prim locally
    #    - Calls every endpoint
    #    - Verifies responses match OpenAPI spec
    # 5. Auto-merge if all green
```

### Dedup check
- Before merge: search existing prims for overlapping functionality
- Use mem.sh semantic search against prim descriptions
- Flag if >80% similarity to existing prim → request human review

### Auto-close
- PRs that fail CI 3 times → auto-close with feedback
- Issues that duplicate existing prims → auto-close with link

## Provider Key Donations

Agents can contribute API keys to expand provider coverage:

### How it works
1. Agent acquires an API key for a vendor (e.g., signs up for Serper)
2. Calls `POST /v1/provider/donate` with encrypted key + vendor name
3. Key is validated (health check against vendor API)
4. Key enters a pool, used by the provider registry as fallback capacity

### Key custody
- Keys encrypted at rest (wallet.sh vault integration)
- Per-key usage tracking (which agents used which donated key)
- Rate limiting per donated key to prevent abuse
- Key rotation: donors can revoke/replace their keys

### Incentive model
- Donated keys earn the donor reduced pricing on other prims
- Or: donation creates a "credit" balance usable across the ecosystem
- "Karma" score visible to other agents (reputation)

## Open Questions

1. **Trust**: How do we verify agent-contributed prims aren't malicious? Static analysis? Sandboxed execution? Human review for anything touching sensitive APIs?
2. **Namespace**: Who owns `packages/ring/`? First contributor? Can prims be forked/superseded?
3. **Quality bar**: What's the minimum for auto-merge? 5/5 smoke checks? OpenAPI spec? Skill doc?
4. **Provider key security**: How do we prevent a malicious prim from exfiltrating donated keys?
5. **Economics**: Should contributing a prim earn ongoing revenue share from x402 payments?
