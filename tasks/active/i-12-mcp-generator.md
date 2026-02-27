# I-12: MCP Tool Generator

**Status:** pending
**Goal:** `pnpm gen:mcp` reads OpenAPI specs and generates MCP tool definition files, replacing the manually maintained `packages/mcp/src/tools/*.ts` files. Single source of truth: OpenAPI → MCP.
**Depends on:** OpenAPI specs must exist (Wave 5.5 L-62, or manually written). Also benefits from I-8 (prim.yaml `interfaces.mcp` flag).
**Scope:** `scripts/gen-mcp.ts` (new), `packages/mcp/src/tools/*.ts` (generated), `package.json`

## Problem

MCP tool files are a second source of truth that drifts from the actual API. Each `packages/mcp/src/tools/<id>.ts` manually re-describes request schemas, response types, and tool metadata that already exists in OpenAPI specs and api.ts. When a route changes, the MCP tool file must be updated separately — and often isn't.

Currently 9 tool files with ~200 lines each = ~1800 lines of hand-maintained code that's derivable from OpenAPI.

## Design

### Generation chain

```
specs/openapi/<id>.yaml
    ↓ gen-mcp.ts
packages/mcp/src/tools/<id>.ts
```

### What gets generated per tool file

For each OpenAPI spec:

1. **Tool definitions array** (`<prim>Tools: Tool[]`):
   - `name`: `<prim>_<operationId>` (from OpenAPI operationId, or prim.yaml operation_id)
   - `description`: OpenAPI summary + price annotation (from `x-price` extension)
   - `inputSchema`: OpenAPI request body JSON Schema (converted to MCP tool input schema)

2. **Handler function** (`handle<Prim>Tool(name, args, fetch, baseUrl)`):
   - Switch on tool name → call the right endpoint via `fetch`
   - Method + path from OpenAPI
   - Body serialization from args
   - Response deserialization

### OpenAPI → MCP schema mapping

| OpenAPI | MCP Tool |
|---------|----------|
| `operationId` | Tool name (`<prim>_` prefix) |
| `summary` | Tool description |
| `requestBody.content.application/json.schema` | `inputSchema` |
| `x-price` extension | Appended to description: "Price: $0.01" |
| `responses.200.content.application/json.schema` | Return type annotation (TSDoc comment) |
| Path parameters | Flattened into inputSchema as required fields |

### Marker-based generation

Generated files use markers so that hand-written additions (e.g., custom helper functions, complex response transformations) can be preserved:

```ts
// BEGIN:GENERATED:TOOLS
export const searchTools: Tool[] = [...];
// END:GENERATED:TOOLS

// BEGIN:GENERATED:HANDLER
export function handleSearchTool(...) { ... }
// END:GENERATED:HANDLER
```

### OpenAPI parsing

Use `yaml` npm package to parse specs. No need for a full OpenAPI SDK — the generator only needs paths, operationIds, request/response schemas, and the `x-price` extension.

### Wire into `pnpm gen`

- Add `gen:mcp` to unified pipeline
- `gen:check` verifies generated MCP tools match current OpenAPI specs

## Files to Create/Modify

| File | Action |
|------|--------|
| `scripts/gen-mcp.ts` | Create — MCP tool generator |
| `packages/mcp/src/tools/*.ts` | Overwrite (marker-bounded) — generated tool files |
| `packages/mcp/src/server.ts` | May need update if tool registration pattern changes |
| `package.json` | Modify — add `gen:mcp` script |

## Key Decisions

- **OpenAPI is the source, not api.ts.** MCP schemas need JSON Schema (which OpenAPI provides natively). TypeScript types in api.ts would need conversion — OpenAPI already has the right format.
- **Generate handler bodies, not just schemas.** The handler function that maps tool args → HTTP request → response is mechanical and derivable from OpenAPI. Generate it completely.
- **x-price extension is required.** Every paid endpoint's OpenAPI spec must include `x-price` so the MCP tool description includes pricing. Free routes get "Free" annotation.
- **Preserve existing tool files initially.** First run: generate alongside existing files, diff, verify equivalence. Then switch to generated-only.

## Testing Strategy

- Generate MCP tools for search.sh (simplest spec) → compare with existing `packages/mcp/src/tools/search.ts`
- Generated tool list should exactly match the manually maintained one
- Run existing MCP tests against generated tools — must pass

## Before Closing

- [ ] `pnpm gen:mcp` generates tool files for all prims with OpenAPI specs
- [ ] Generated tools match existing manual tools (same names, same schemas)
- [ ] Existing MCP tests pass with generated tools
- [ ] `pnpm gen:check` includes MCP tool freshness
- [ ] x-price annotation appears in every tool description
