# I-2: Migrate TASKS.md → tasks.json

**Date**: 2026-02-26
**Status**: Plan
**Owner**: Claude

## Context

TASKS.md is parsed by `scripts/launch-status.ts` using a fragile regex that only extracts task rows (ID, description, status, release). It ignores the full hierarchy (sections, waves, phases, parallelism annotations). Moving to a structured JSON source of truth makes the data queryable, validatable, and machine-friendly — critical as more scripts and agents consume task state.

## Goals

1. Define a JSON schema that captures the full TASKS.md hierarchy (sections → waves → phases → tasks)
2. Convert current TASKS.md data into `tasks.json`
3. Update `launch-status.ts` to read from `tasks.json` instead of regex-parsing markdown
4. Update `tasks/README.md` to document the new format
5. (Optional) Add a `gen-tasks-md.ts` script that regenerates TASKS.md from `tasks.json` for human readability

## Phase 1: Schema Definition

**File**: `tasks/tasks.schema.json` (JSON Schema draft 2020-12)

Top-level structure:

```json
{
  "sections": [
    {
      "id": "HRD",
      "title": "Hardening",
      "description": "Code quality, security...",
      "waves": [...]
    }
  ]
}
```

### Key types

- **Section**: `{ id, title, description, waves[] }`
- **Wave**: `{ id, title, parallelism: "PARA"|"SRL", phases[]?, tasks[]? }` — waves contain either phases or tasks directly
- **Phase**: `{ id, title, parallelism: "PARA"|"SRL", tasks[] }`
- **Task**: `{ id, description, owner, depends[], status, release, plan? }`

Field mappings from markdown:

| Markdown | JSON | Notes |
|----------|------|-------|
| `## HRD — Hardening` | `{ id: "HRD", title: "Hardening" }` | Parse `abbrev — title` |
| `### HRD-W1: Open-Source Readiness (PARA)` | `{ id: "HRD-W1", title: "Open-Source Readiness", parallelism: "PARA" }` | |
| `#### HRD-W1-PA: Service Layer (SRL)` | `{ id: "HRD-W1-PA", title: "Service Layer", parallelism: "SRL" }` | |
| `Depends: HRD-3, HRD-4` | `depends: ["HRD-3", "HRD-4"]` | `--` → `[]` |
| `Owner: Garric + Claude` | `owner: ["Garric", "Claude"]` | Array, not string |
| `Release: v1.0.0` | `release: "v1.0.0"` | `--` → `null` |
| `Plan: tasks/active/foo.md` | `plan: "tasks/active/foo.md"` | Extract from description |

### Decision: owner as array vs string

Array. `"Garric + Claude"` is two owners. Normalizing avoids parsing `+` everywhere.

### Decision: where tasks live in the tree

A wave can contain tasks directly (no phases) or contain phases that contain tasks. Never both at the same level. Schema uses a discriminated union:
- If `phases` is present, `tasks` must be absent (and vice versa)
- If neither is present, the wave is empty

## Phase 2: Data Conversion

**File**: `scripts/convert-tasks.ts` (one-shot migration script, can be deleted after)

Reads `TASKS.md`, parses markdown structure, outputs `tasks.json`. This is a one-time conversion — not an ongoing sync tool.

Parsing strategy:
1. Split by `##` to get sections
2. Within each section, split by `###` to get waves
3. Within each wave, split by `####` to get phases (if any)
4. Within each phase/wave, parse markdown table rows

Plan doc references are extracted from the Task column (regex: `Plan:\s*\`([^`]+)\``) and stored as `plan` field. The description is stripped of the plan reference.

Bold markers like `**DO FIRST.**` are preserved in the description as-is.

### Backlog section special case

BKLG has a flat task table (no wave/phase) plus a "Future Primitives" table that is NOT tasks — it's a reference table. The converter should:
- Parse the flat task table into tasks under a synthetic wave
- Ignore the "Future Primitives" table (it stays in TASKS.md only, or moves to a separate `primitives-backlog.yaml`)

## Phase 3: Update launch-status.ts

**File**: `scripts/launch-status.ts`

Replace `checkBlockers()` (lines 162–192):

Current: reads `TASKS.md`, regex-matches table rows, filters by release.

New: reads `tasks.json`, walks `sections[].waves[].phases?[].tasks[]`, filters by `release === TARGET_RELEASE`.

Changes:
- Remove `readFileSync("TASKS.md", "utf-8")` and the regex
- Add `import tasks from "../tasks/tasks.json"` (Bun supports JSON imports)
- Add a `flatTasks()` helper that flattens the hierarchy into `Task[]`
- Filter and report logic stays the same (pass/pending based on status)

Helper signature: `function flatTasks(data: TasksFile): Task[]` — recursively collects all tasks from the tree. This is useful beyond launch-status, so put it in `scripts/lib/tasks.ts`.

### New shared module

**File**: `scripts/lib/tasks.ts`

Exports:
- `loadTasks(path?: string): TasksFile` — reads and parses tasks.json
- `flatTasks(data: TasksFile): Task[]` — flattens hierarchy
- `filterByRelease(tasks: Task[], release: string): Task[]`
- Type exports: `TasksFile`, `Section`, `Wave`, `Phase`, `Task`

## Phase 4: Update Documentation

**File**: `tasks/README.md`

Add a section documenting:
- `tasks.json` is now SOT, not TASKS.md
- Schema location: `tasks/tasks.schema.json`
- How to regenerate TASKS.md (if codegen script exists)
- Completion workflow update: edit `tasks.json`, not TASKS.md

**File**: `CLAUDE.md`

Update references from "edit TASKS.md" to "edit tasks.json". The completion workflow section needs updating.

## Phase 5 (Optional): TASKS.md Codegen

**File**: `scripts/gen-tasks-md.ts`

Reads `tasks.json`, outputs `TASKS.md` in the current markdown format. This keeps TASKS.md as a human-readable view while `tasks.json` is the machine-editable SOT.

Run via: `bun scripts/gen-tasks-md.ts > TASKS.md`

This is optional — the user may prefer to drop TASKS.md entirely or maintain it manually. Include in the plan but gate on user preference.

## Files Modified

| File | Change |
|------|--------|
| `tasks/tasks.schema.json` | **New** — JSON Schema |
| `tasks/tasks.json` | **New** — Converted task data |
| `scripts/convert-tasks.ts` | **New** — One-shot migration script |
| `scripts/lib/tasks.ts` | **New** — Shared task loader + types |
| `scripts/launch-status.ts` | **Modify** — Replace regex parsing with JSON import |
| `tasks/README.md` | **Modify** — Document new format |
| `CLAUDE.md` | **Modify** — Update task editing references |
| `scripts/gen-tasks-md.ts` | **New** (optional) — TASKS.md codegen |

Dependency direction: `scripts/launch-status.ts` → `scripts/lib/tasks.ts` → `tasks/tasks.json`. No circular deps. `scripts/lib/tasks.ts` is a sibling to `scripts/lib/primitives.ts`.

## Testing Strategy

- `convert-tasks.ts` output is validated against `tasks.schema.json` using `ajv`
- After conversion, run `bun scripts/launch-status.ts` and verify identical output to pre-migration
- Exact assertion: `flatTasks(loadTasks()).filter(t => t.release === "v1.0.0" && t.status !== "done").length` equals the current blocker count (check before and after)

## Agent Team

Recommended: No — sequential dependencies. Phase 2 requires Phase 1 schema. Phase 3 requires Phase 2 output. Each phase builds on the prior.

## Before Closing

- [ ] Run `bun scripts/launch-status.ts` — output matches pre-migration
- [ ] `tasks.json` validates against `tasks/tasks.schema.json`
- [ ] All tasks from TASKS.md are present in `tasks.json` (count match)
- [ ] `scripts/lib/tasks.ts` exports compile with no type errors
- [ ] `tasks/README.md` documents the new workflow
- [ ] CLAUDE.md references updated
- [ ] No TASKS.md rows lost or duplicated during conversion
