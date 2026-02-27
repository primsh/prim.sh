# I-8: prim.yaml Schema V2

**Status:** pending
**Goal:** Extend prim.yaml to be the single source of truth for provider configuration and interface generation flags. Every piece of metadata needed to scaffold, generate, and deploy a prim lives in one file.
**Depends on:** I-5 (factory config shape informs schema design)
**Scope:** `packages/*/prim.yaml` (all 10), `scripts/lib/primitives.ts`, `primitives.yaml`

## Problem

Provider information is scattered: env vars are in prim.yaml but which vendor they belong to is implicit. There's no way to know from prim.yaml alone that search.sh wraps Tavily, or that spawn.sh wraps Hetzner. Adding a second vendor to any prim requires the developer to know the codebase — there's no structured metadata to guide scaffolding or documentation.

Similarly, there's no flag indicating which interfaces a prim should have (MCP tools, CLI, OpenAI functions). The generators (I-12, I-13, I-14) need to know which prims to generate for.

## Design

### New `providers` section

```yaml
providers:
  - name: tavily
    env: [TAVILY_API_KEY]
    status: active       # active | planned | deprecated
    default: true
    url: https://tavily.com
  - name: serper
    env: [SERPER_API_KEY]
    status: planned
    default: false
```

Fields:
- `name` — vendor identifier (lowercase, used in code as provider name)
- `env` — env vars specific to this vendor (NOT shared vars like PRIM_PAY_TO)
- `status` — vendor integration status
- `default` — exactly one provider must be default (used when no explicit selection)
- `url` — vendor homepage (for docs/llms.txt attribution)

### New `interfaces` section

```yaml
interfaces:
  mcp: true
  cli: true
  openai: true
  rest: true     # always true for deployed prims, explicit for clarity
```

Generators check this before producing output. Allows opting out (e.g. faucet might skip OpenAI functions since it's free/simple).

### Strengthened `routes_map`

Current routes_map is sufficient for llms.txt generation. Extend with fields the interface generators need:

```yaml
routes_map:
  - method: POST
    path: /v1/search
    price: "$0.01"
    summary: "Web search"
    operation_id: search_web        # used for MCP tool name, CLI subcommand, OpenAI function name
    request_type: SearchRequest     # TypeScript type name from api.ts
    response_type: SearchResponse   # TypeScript type name from api.ts
```

`operation_id`, `request_type`, `response_type` are new. They link prim.yaml routes to api.ts types, enabling generators to produce typed interfaces.

### New `factory` section

Config consumed by `createPrimApp()`:

```yaml
factory:
  max_body_size: 1MB     # default, override for email (25MB), store (128MB)
  metrics: true           # default true
  free_service: false     # true for faucet only — skips x402 middleware
```

## Files to Create/Modify

| File | Action |
|------|--------|
| `scripts/lib/primitives.ts` | Modify — extend `Primitive` type with `Provider`, `Interfaces`, strengthened `RouteMapping`, `FactoryConfig` |
| `packages/*/prim.yaml` (10 files) | Modify — add providers, interfaces, factory sections; add operation_id + type refs to routes_map |
| `primitives.yaml` | No change (unbuilt prims don't have providers yet) |

### Backfill: providers for each prim

| Prim | Provider(s) |
|------|------------|
| wallet | viem (not really a "provider" — skip providers section) |
| store | cloudflare-r2 |
| spawn | hetzner |
| faucet | — (no external provider) |
| search | tavily |
| email | stalwart |
| token | viem |
| mem | qdrant |
| domain | cloudflare-registrar |
| track | trackingmore |

Wallet, token, and faucet don't have traditional vendor providers. Wallet/token use viem (a library, not a service). Faucet has no external dependency. These can either omit `providers` or list the library for documentation purposes.

## Key Decisions

- **Providers section is optional.** Prims without external vendors (wallet, faucet) can omit it. Generators handle absence gracefully.
- **operation_id is the universal identifier.** MCP tool name = `<prim>_<operation_id>`. CLI subcommand = `<operation_id>` with underscores → hyphens. OpenAI function name = `<prim>_<operation_id>`.
- **Schema validation at gen time.** `gen-prims.ts` validates prim.yaml against the schema on load. Missing required fields → hard error with file path + field name.

## Testing Strategy

- Run `pnpm gen` after updating all prim.yaml files — existing generated outputs should not change (additive schema extension)
- Validate all 10 prim.yaml files parse correctly with updated Primitive type (TypeScript compilation catches type errors)

## Before Closing

- [ ] All 10 deployed prim.yaml files updated with new sections
- [ ] `Primitive` type in primitives.ts matches new schema
- [ ] `pnpm gen:check` still passes (no unintended output changes)
- [ ] `pnpm check` passes (typecheck catches any type mismatches)
- [ ] Every routes_map entry has operation_id, request_type, response_type
