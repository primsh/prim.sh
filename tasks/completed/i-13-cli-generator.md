# I-13: CLI Command Generator

**Status:** pending
**Goal:** `pnpm gen:cli` reads OpenAPI specs and generates CLI command files (`packages/keystore/src/*-commands.ts`), replacing manually maintained CLI code. Single source: OpenAPI → CLI.
**Depends on:** OpenAPI specs must exist (Wave 5.5 L-62). Benefits from I-8 (prim.yaml operation_id for subcommand naming).
**Scope:** `scripts/gen-cli.ts` (new), `packages/keystore/src/*-commands.ts` (generated), `package.json`

## Problem

CLI command files are hand-written per prim (~300-500 lines each). They duplicate the same information as OpenAPI specs: endpoint paths, request parameters, response formatting. The email-commands.ts pattern is well-established but must be manually replicated for every new prim. Adding a route to a prim requires updating both the service and the CLI file.

## Design

### Generation chain

```
specs/openapi/<id>.yaml
    ↓ gen-cli.ts
packages/keystore/src/<id>-commands.ts
```

### Generated file structure

Each generated `<id>-commands.ts` follows the email-commands.ts pattern:

1. **Imports** — `createPrimFetch`, `getFlag`, `getFlagValue` from existing keystore utils
2. **Subcommand dispatch** — switch on `args[0]` to route to the right handler
3. **Handler per operation** — one async function per OpenAPI operation:
   - Parse CLI args into request body using `getFlag()`/`getFlagValue()`
   - Call endpoint via `primFetch()`
   - Format response for terminal output (tables for lists, detail views for objects)
4. **Help text** — generated from OpenAPI summaries

### OpenAPI → CLI mapping

| OpenAPI | CLI |
|---------|-----|
| `operationId: search_web` | Subcommand: `prim search web` |
| `operationId: store_bucket_create` | Subcommand: `prim store bucket create` |
| Request body properties | CLI flags: `--name`, `--limit`, positional args for required fields |
| `required` properties | Positional args or required flags |
| `enum` values | Validated against enum list |
| Array response | Formatted as table |
| Object response | Formatted as key-value detail view |

### Naming convention

`operation_id` (from prim.yaml or OpenAPI operationId) maps to subcommand:
- Underscores → space-separated groups: `bucket_create` → `prim store bucket create`
- Top-level operation: `search_web` → `prim search web`

### Arg parsing

The existing pattern uses `getFlag(args, "--flag")` and `getFlagValue(args, "--flag")`. The generator produces the same pattern:
- Required fields with no default → positional arg
- Optional fields → `--flag` with default from OpenAPI `default` value
- Boolean fields → `--flag` (presence = true)

### Output formatting

- **List endpoints** → table format (like `prim wallet ls`)
- **Detail endpoints** → key-value pairs (like `prim wallet get <addr>`)
- **Action endpoints** → success message + relevant fields
- **Error responses** → stderr with error code + message

## Files to Create/Modify

| File | Action |
|------|--------|
| `scripts/gen-cli.ts` | Create — CLI command generator |
| `packages/keystore/src/*-commands.ts` | Overwrite (marker-bounded) — generated CLI files |
| `packages/keystore/src/cli.ts` | May need update for new prim dispatch entries |
| `package.json` | Modify — add `gen:cli` script |

## Key Decisions

- **Generate dispatch entries too.** The generator updates `cli.ts` to add dispatch cases for new prims (marker-bounded section).
- **Positional args for the most common required field.** If a route has one obviously primary field (e.g., `query` for search, `domain` for domain operations), make it positional. All others are flags.
- **Table formatting uses fixed-width columns.** No dependency on external table library — use `String.padEnd()` like existing CLI code.
- **Help generation.** `prim <id> --help` and `prim <id> <subcommand> --help` are generated from OpenAPI summaries + parameter descriptions.

## Testing Strategy

- Generate CLI for search.sh → compare with what manual implementation would look like
- Verify `prim search web "test"` produces a valid HTTP request to the right endpoint
- Verify `prim search --help` lists all subcommands with descriptions

## Before Closing

- [ ] `pnpm gen:cli` generates command files for all prims with OpenAPI specs
- [ ] Generated CLI passes typecheck
- [ ] Help text is accurate (matches OpenAPI summaries)
- [ ] Positional args work for primary fields
- [ ] Table output formatting is consistent with existing CLI commands
- [ ] `pnpm gen:check` includes CLI freshness
