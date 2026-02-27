# I-14: OpenAI Function Schema Generator

**Status:** pending
**Goal:** `pnpm gen:openai` reads OpenAPI specs and outputs OpenAI-compatible function/tool definitions as JSON. Agents using the OpenAI Responses API or Chat Completions API can consume these directly to call prim endpoints as native tools.
**Depends on:** OpenAPI specs must exist (Wave 5.5 L-62).
**Scope:** `scripts/gen-openai.ts` (new), `packages/openai/` (new directory), `package.json`

## Context

OpenAI function calling (tool use) is the de facto standard that MCP's tool definitions are modeled after. Both use JSON Schema for input parameters. By generating OpenAI-compatible schemas from the same OpenAPI source, we support:

- **OpenAI Responses API / Chat Completions** — agents can use prim tools natively
- **Any framework that uses OpenAI-format tools** — LangChain, CrewAI, AutoGen, etc.
- **Claude API tool_use** — Anthropic's format is nearly identical to OpenAI's

This makes prim primitives consumable by any agent framework, not just MCP-aware ones.

## Design

### Generation chain

```
specs/openapi/<id>.yaml
    ↓ gen-openai.ts
packages/openai/<id>.json     (per-prim)
packages/openai/all.json      (combined)
```

### Output format

Per the OpenAI function calling spec, each tool is:

```json
{
  "type": "function",
  "function": {
    "name": "search_web",
    "description": "Web search. Price: $0.01/query via x402 payment.",
    "parameters": {
      "type": "object",
      "properties": {
        "query": { "type": "string", "description": "Search query" },
        "max_results": { "type": "integer", "description": "1-20, default 10" }
      },
      "required": ["query"]
    }
  }
}
```

### OpenAPI → OpenAI mapping

| OpenAPI | OpenAI Function |
|---------|----------------|
| `operationId` | `function.name` (prefixed with `<prim>_`) |
| `summary` + `x-price` | `function.description` |
| `requestBody.schema.properties` | `function.parameters.properties` |
| `requestBody.schema.required` | `function.parameters.required` |
| Property `description` | Property `description` |
| Property `enum` | Property `enum` |
| Property `default` | Mentioned in description |

### Per-prim vs combined

- `packages/openai/<id>.json` — array of tools for one prim (e.g., all search tools)
- `packages/openai/all.json` — all tools across all prims
- `packages/openai/manifest.json` — metadata: version, primitive list, generation timestamp

Agents choose granularity: load all tools, or only the prims they need.

### Optional: serve as endpoint

Each prim could serve `GET /openai.json` (free route) returning its tool definitions. This allows runtime discovery: an agent fetches `https://search.prim.sh/openai.json` and gets the tools it needs. This is similar to how llms.txt works but in machine-consumable JSON.

### Claude API compatibility

Anthropic's tool_use format uses `input_schema` instead of `parameters`, and wraps differently. Generate a parallel `packages/openai/<id>.claude.json` with Anthropic-format tools, or document the trivial mapping (rename `parameters` → `input_schema`).

## Files to Create/Modify

| File | Action |
|------|--------|
| `scripts/gen-openai.ts` | Create — OpenAI schema generator |
| `packages/openai/` | Create directory — generated output |
| `packages/openai/<id>.json` | Generated — per-prim tool definitions |
| `packages/openai/all.json` | Generated — combined tool definitions |
| `package.json` | Modify — add `gen:openai` script |

## Key Decisions

- **JSON output, not TypeScript.** These are data files consumed by agent frameworks at runtime. JSON is universally parseable.
- **Same naming as MCP tools.** `search_web`, `store_bucket_create`, etc. Consistency across interfaces means agents can switch between MCP and OpenAI tools without learning new names.
- **Description includes pricing.** Agents need to know cost before calling. "Web search. Price: $0.01/query" is more useful than just "Web search."
- **Path parameters flattened into properties.** OpenAPI path params (e.g., `:address`) become required properties in the function parameters.

## Testing Strategy

- Generate schemas for search.sh → validate against OpenAI's JSON Schema for tool definitions
- Load generated schemas into an OpenAI API call → verify the API accepts them without error
- Verify all.json contains tools from every prim with an OpenAPI spec

## Before Closing

- [ ] `pnpm gen:openai` generates per-prim and combined JSON files
- [ ] Generated schemas are valid per OpenAI function calling spec
- [ ] Tool names match MCP tool names exactly
- [ ] Pricing annotation present in every tool description
- [ ] `pnpm gen:check` includes OpenAI schema freshness
