# I-11: Interactive Prim Creator

**Status:** pending
**Goal:** `pnpm create-prim --interactive` walks through creating a valid prim.yaml via CLI prompts. Also provides a structured LLM skill so agents can generate prim.yaml from a natural language description.
**Depends on:** I-9 (scaffolder — the creator outputs prim.yaml, then scaffolder generates the package)
**Scope:** `scripts/create-prim.ts` (extend), `skills/create-prim.md` (new)

## Problem

Writing prim.yaml from scratch requires knowing: the full schema (I-8), available port numbers (must not conflict), accent color conventions, route naming patterns, provider env var conventions. This tribal knowledge is documented in CLAUDE.md and various plan docs but not actionable at creation time.

## Design

### CLI Wizard

Add `--interactive` flag to `scripts/create-prim.ts`. Uses `@inquirer/prompts` (or equivalent — check what's already in the repo's deps).

**Wizard flow:**

1. **ID** — text input, validate: lowercase alpha, not taken (check `packages/` dir)
2. **Name** — auto-suggest `<id>.sh`, allow override
3. **Description** — text input, ~120 chars
4. **Type** — select from existing types (crypto, storage, compute, search, email, etc.) or enter custom
5. **Port** — auto-assign next available (scan existing prim.yaml ports), allow override
6. **Accent color** — select from unused accent colors, or enter hex
7. **Routes** — interactive loop:
   - Method (POST/GET/PUT/DELETE/PATCH)
   - Path (e.g. `/v1/call`)
   - Price (e.g. `$0.01` or `free`)
   - Summary (e.g. "Make a phone call")
   - Operation ID (auto-suggest from path: `/v1/call` → `call`, `/v1/messages/list` → `messages_list`)
   - "Add another route?" y/n
8. **Providers** — optional loop:
   - Vendor name
   - Env vars (comma-separated)
   - URL
   - "Add another provider?" y/n
9. **Confirm + write** — show YAML preview, confirm, write to `packages/<id>/prim.yaml`

After writing prim.yaml, prompt: "Run scaffolder now? (Y/n)" → if yes, runs `create-prim <id>`.

### LLM Skill

Create `skills/create-prim.md` — a structured prompt that an LLM (Claude Code, Cursor, etc.) can load to generate prim.yaml from a natural language description.

Skill content:
- Prim.yaml schema reference (from I-8)
- Port allocation rules (list current ports)
- Naming conventions (operation_id patterns, type categories)
- Example: complete prim.yaml for a real prim (e.g. search.sh)
- Instructions: "Given a description of a new primitive, generate a complete prim.yaml"

The skill is documentation — it doesn't execute code. It gives an LLM enough context to produce valid prim.yaml that the scaffolder can consume.

### Port allocation

Maintain a registry of assigned ports. Currently:
- wallet: 3001, store: 3003, faucet: 3002, spawn: 3004, search: 3005, email: 3006, token: 3007, mem: 3008, domain: 3009, track: 3010

The wizard reads all existing prim.yaml ports and suggests the next available (3011, 3012, etc.).

## Files to Create/Modify

| File | Action |
|------|--------|
| `scripts/create-prim.ts` | Modify — add `--interactive` mode with wizard |
| `skills/create-prim.md` | Create — LLM skill for prim.yaml generation |
| `package.json` | Check — may need `@inquirer/prompts` dependency |

## Key Decisions

- **Wizard is additive, not required.** `pnpm create-prim <id>` without `--interactive` still works (reads existing prim.yaml). The wizard is for the "start from nothing" case.
- **No AI in the CLI wizard.** The wizard is deterministic prompts. The LLM skill is a separate artifact. This keeps the CLI dependency-free and works offline.
- **YAML output, not JSON.** prim.yaml is YAML — the wizard outputs YAML. Use `yaml` npm package for serialization to ensure proper formatting.

## Testing Strategy

- Test wizard with mock stdin (inquirer supports programmatic answers)
- Verify generated prim.yaml validates against the schema
- Verify port conflict detection works
- Verify LLM skill produces valid prim.yaml when loaded into Claude Code context

## Before Closing

- [ ] `pnpm create-prim --interactive` produces valid prim.yaml
- [ ] Port auto-assignment avoids conflicts with all existing prims
- [ ] Generated prim.yaml passes schema validation in gen-prims.ts
- [ ] LLM skill exists at `skills/create-prim.md`
- [ ] Wizard → scaffolder pipeline works end-to-end
