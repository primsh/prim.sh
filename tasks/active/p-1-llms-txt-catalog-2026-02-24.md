# P-1 — llms.txt Root + Per-Primitive Files

**Date:** 2026-02-24  
**Status:** Active  
**Task:** P-1  
**Scope:** Author static `llms.txt` docs only (no server routing changes)

## Context

`specs/llms-txt.md` defines a machine-first documentation surface: one root `/llms.txt`, one per primitive (`/<primitive>/llms.txt`), and optional `/llms-full.txt`. The repo currently has landing pages in `site/*/index.html` and a static route map in `site/serve.py`, but no `llms.txt` files yet.

P-1 should create the docs artifacts. Serving those files from HTTP belongs to P-2.

## Goals

- Add root `site/llms.txt` with complete primitive navigation and x402 context.
- Add per-primitive `site/<primitive>/llms.txt` files for all current primitives.
- Keep format consistent and agent-parseable across files.
- Avoid changing `site/serve.py` in this task.

## Non-Goals

- No route wiring or fallback path logic (`/llms.txt` and `/<primitive>/llms.txt` serving is P-2).
- No HTML hero/footer edits in this task.
- No API runtime implementation in packages.

## Files To Modify

- `site/llms.txt` (new)
- `site/agentstack/llms.txt` (new, optional alias text pointing to root and index)
- `site/<primitive>/llms.txt` (new for each primitive directory under `site/`)
- `TASKS.md` (mark plan link only if needed by workflow)

Primitive directories in scope:
`ads, auth, browse, code, corp, cron, dns, docs, hands, hive, id, infer, mart, mem, pay, pins, pipe, relay, ring, seek, ship, spawn, store, trace, vault, wallet, watch`.

## Content Model

### Required section order (every primitive file)

1. Title + one-line description
2. Base URL
3. Auth (`x402`, Base `eip155:8453`, USDC)
4. Endpoints list (method/path + purpose)
5. Pricing notes
6. Minimal curl example(s)

### Root index requirements

- Platform intro and payment model.
- Grouped primitive links (Core, Communication, Intelligence, Operations, Physical World, Optional).
- Short guidance on handling `402 Payment Required`.

## Data Schemas

Canonical primitive metadata schema (planning artifact):

```json
{
  "slug": "relay",
  "domain": "relay.sh",
  "base_url": "https://api.relay.sh",
  "category": "Communication",
  "auth": { "scheme": "x402", "chain": "eip155:8453", "token": "USDC" }
}
```

Canonical endpoint entry schema (within docs drafting source):

```json
{
  "method": "POST",
  "path": "/v1/mailboxes",
  "summary": "Create mailbox",
  "cost_usd": "0.01"
}
```

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| File placement | `site/` tree | Matches current static artifact location and future `serve.py` routing |
| Format | Plain Markdown in `llms.txt` | Human-readable and LLM-friendly without custom parser |
| API detail level | Endpoint summaries + minimal request/response shape | Useful now without inventing unstable full contracts |
| `/llms-full.txt` | Defer to P-2/P-later | Large concatenation can be generated once route strategy is finalized |

## Dependency Direction

- Source of truth for product intent: `specs/llms-txt.md`.
- Generated/maintained artifacts: `site/**/llms.txt`.
- Runtime serving concerns (`site/serve.py`) must depend on these files in P-2, not vice versa.

## Reusable Function Signatures (for P-2 tooling)

- `def llms_path_for(slug: str) -> str`
- `def load_llms_doc(slug: str) -> str`
- `def render_root_llms(primitives: list[dict]) -> str`

These signatures define ownership boundaries if route generation helpers are introduced later.

## Phases

### Phase 1 — Inventory and template lock

- Confirm primitive directory inventory in `site/`.
- Freeze one shared template structure for all primitive `llms.txt` files.

### Phase 2 — Author docs

- Write `site/llms.txt` from grouped inventory.
- Draft each primitive `llms.txt` using the same section order and x402 auth block.

### Phase 3 — Consistency pass

- Validate all links/slug names match existing site directories.
- Ensure consistent chain/token/auth wording across all files.

## Test Assertions

- `assert Path("site/llms.txt").exists()`
- `assert "# AgentStack" in Path("site/llms.txt").read_text()`
- `assert len(list(Path("site").glob("*/llms.txt"))) == 28`  
  Note: includes `site/agentstack/llms.txt` plus 27 primitives.
- `assert "Auth:" in Path("site/relay/llms.txt").read_text()`
- `assert "eip155:8453" in Path("site/wallet/llms.txt").read_text()`
- `assert "USDC" in Path("site/spawn/llms.txt").read_text()`

## Inversion-Prone Logic To Flag

- Do not invert P-1/P-2 boundaries: writing files is P-1; serving files is P-2.
- Do not assume `agentstack` is a primitive API; treat it as platform index context.
- Avoid mixing `https://agentstack.sh/<slug>/llms.txt` links with `https://api.<slug>.sh` base URLs (discovery URL vs API URL are different concerns).

## Before Closing

- [ ] `site/llms.txt` created with grouped primitive links
- [ ] Every `site/<primitive>/` directory has `llms.txt`
- [ ] Auth/chain/token wording is consistent (`x402`, `eip155:8453`, `USDC`)
- [ ] No `site/serve.py` edits in this task
- [ ] Commit contains only P-1 plan artifacts (`TASKS.md` + this plan doc)
