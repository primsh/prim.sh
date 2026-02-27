# Wave 5.5: Agent Interface Layer

**Tasks:** L-62, L-63, L-64, L-65, L-66, L-67
**Status:** Planning
**Goal:** Make all 5 live primitives (wallet, store, spawn, faucet, search) consumable by any agent framework — not just raw HTTP. Today an agent reads a 90-line brochure llms.txt and writes custom HTTP scripts. After this wave: OpenAPI specs, full API reference docs, MCP servers, Skills, Plugins, and CLI coverage for every live primitive.

**Why this blocks launch:** The Asher test failure proved that brochure-style llms.txt is insufficient. Agents need machine-readable schemas (OpenAPI), tool integration (MCP), and workflow knowledge (Skills) to reliably use prim without human guidance.

---

## Primitives in scope

| Primitive | Package | Endpoints | x402 | CLI today |
|-----------|---------|-----------|------|-----------|
| wallet | `packages/wallet/` | 18 routes (3 admin, 3 internal) | Yes (except register) | `prim wallet` (8 subcommands) |
| store | `packages/store/` | 12 routes | Yes | `prim store` (7 subcommands) |
| spawn | `packages/spawn/` | 13 routes | Yes | `prim spawn` (8 subcommands) |
| faucet | `packages/faucet/` | 4 routes | No (free, rate-limited) | `prim faucet` (3 subcommands) |
| search | `packages/search/` | 4 routes | Yes | None |

---

## Phase 1: OpenAPI Specs (L-62)

**Goal:** Machine-readable source of truth for every endpoint. Everything else in this wave derives from these specs.

### Files to create

```
specs/openapi/
├── wallet.yaml
├── store.yaml
├── spawn.yaml
├── faucet.yaml
└── search.yaml
```

YAML, not JSON — easier to read, comment, and diff.

### What each spec must contain

- OpenAPI 3.1 format
- Every route: method, path, operationId, summary, description
- Request bodies: full JSON Schema with `required` fields, types, constraints (min/max, pattern for addresses, enums for status values)
- Response bodies: full JSON Schema for success (200/201) and every error shape
- x402 payment flow documented as a `securityScheme` (custom scheme type) with per-route pricing in `x-price` extension field
- Error envelope: `{error: {code: string, message: string, retryAfter?: number}}`
- Pagination params: `limit`, `cursor`/`page`, response shape with `cursor`/`is_truncated`
- Rate limiting: 429 response shape with `retryAfter`
- Path params typed (`:address` as `string, pattern: ^0x[a-fA-F0-9]{40}$`)
- Examples for every endpoint (request + response)

### Source data

Extract schemas directly from each primitive's `api.ts` type definitions + `index.ts` route handlers. The types are already well-defined:

- `packages/wallet/src/api.ts` — WalletRegisterRequest, WalletListResponse, SpendingPolicy, etc.
- `packages/store/src/api.ts` — CreateBucketRequest, BucketResponse, ObjectListResponse, etc.
- `packages/spawn/src/api.ts` — CreateServerRequest, ServerResponse, ServerStatus enum, etc.
- `packages/faucet/src/service.ts` — request/response shapes inline
- `packages/search/src/api.ts` — SearchRequest, SearchResponse, ExtractRequest, etc.

### x402 security scheme

Define once, reference everywhere:

```yaml
# Example structure (not implementation code)
securitySchemes:
  x402:
    type: http
    scheme: x402
    description: "EIP-3009 payment. 402 → sign → retry with Payment-Signature header."
```

Per-route pricing via extension:
```yaml
x-price: "$0.01"
```

### Decision: admin/internal routes

**Exclude** admin routes (`/v1/admin/*`, `/internal/*`) from public OpenAPI specs. These require `PRIM_INTERNAL_KEY` and are not agent-facing. Document them in a separate `wallet-admin.yaml` only if needed later.

### Validation

After writing each spec, validate with:
- `npx @redocly/cli lint specs/openapi/wallet.yaml`
- Cross-check every operationId against the actual Hono route handler to confirm request/response shapes match

---

## Phase 2: Full API Reference llms.txt (L-63)

**Goal:** Rewrite llms.txt files from brochure format to complete plain-text API references. An agent should be able to use the API with only llms.txt — no other docs needed.

**Depends on:** L-62 (OpenAPI specs are the source of truth; llms.txt is the human/agent-readable rendering).

### Current state (problems)

- Root `site/llms.txt`: 90 lines. Lists endpoints with prices but no request/response schemas, no error codes, no field descriptions.
- Per-primitive llms.txt: 28–48 lines each. Endpoint list + 1–2 curl examples. Missing: field types, required vs optional, error shapes, pagination, rate limits.
- Format is "brochure" — tells agents what exists, not how to use it.

### Target format

Follow the xAI/Grok API reference style — every endpoint gets:

```
### POST /v1/search

Web search.

Price: $0.01

Request:
  query        string   required  Search query
  max_results  integer  optional  1-20, default 10
  search_depth string   optional  "basic" | "advanced", default "basic"
  ...

Response (200):
  query          string    The search query echoed back
  answer         string?   AI-generated answer (if include_answer=true)
  results        array     Search results
    .title       string    Page title
    .url         string    Page URL
    .content     string    Snippet text
    .score       number    Relevance score (0-1)
  response_time  number    Milliseconds

Errors:
  400  invalid_request    Missing or invalid query
  402  payment_required   x402 payment needed (see Payment section)
  429  rate_limited       Too many requests. retryAfter: seconds to wait
  500  search_failed      Upstream provider error

Example:
  POST /v1/search
  {"query": "Base L2 gas prices", "max_results": 5}

  → 200
  {"query": "Base L2 gas prices", "results": [...], "response_time": 340}
```

### Files to update

- `site/llms.txt` — root reference. Expand from 90 lines to ~200–250. Add: full x402 flow with header names, complete getting-started sequence, all 5 primitives with endpoint summaries + links.
- `site/wallet/llms.txt` — full wallet API reference (~150 lines)
- `site/store/llms.txt` — full store API reference (~120 lines)
- `site/spawn/llms.txt` — full spawn API reference (~130 lines)
- `site/faucet/llms.txt` — full faucet API reference (~80 lines)
- `site/search/llms.txt` — full search API reference (~90 lines)

### Decision: field format

Use aligned plain-text columns (not markdown tables) for field listings. Agents parse plain text more reliably than markdown tables. Indent nested fields with `.` prefix (`.title`, `.url`).

---

## Phase 3: MCP Servers (L-64)

**Goal:** `prim mcp` starts an MCP server on stdio. Agent runtimes (Claude Code, Cursor, Windsurf, custom) connect and get all primitives as native tools.

**Depends on:** L-62 (OpenAPI specs define tool schemas).

### Architecture decision: unified vs per-primitive

**Unified.** One MCP server exposes all primitives. Reasons:
- Single connection point for agent runtimes
- Shared wallet/signing infrastructure
- `prim mcp` is simpler than `prim mcp --primitive wallet`
- Per-primitive filtering via `prim mcp --primitives wallet,store` for agents that want a subset

### Where it lives

```
packages/mcp/
├── package.json        # @primsh/mcp
├── src/
│   ├── index.ts        # Entry: parse args, start server
│   ├── server.ts       # MCP server setup (tools, resources)
│   ├── tools/
│   │   ├── wallet.ts   # wallet_* tool definitions
│   │   ├── store.ts    # store_* tool definitions
│   │   ├── spawn.ts    # spawn_* tool definitions
│   │   ├── faucet.ts   # faucet_* tool definitions
│   │   └── search.ts   # search_* tool definitions
│   └── x402.ts         # Shared: createPrimFetch integration
├── tsconfig.json
└── test/
```

### MCP SDK

Use `@modelcontextprotocol/sdk` (official TypeScript SDK). It handles stdio transport, JSON-RPC, tool/resource protocol.

### Tool naming convention

`<primitive>_<action>` — flat namespace, no nesting:

- `wallet_register`, `wallet_list`, `wallet_get`, `wallet_deactivate`
- `wallet_fund_request_create`, `wallet_fund_request_approve`, `wallet_fund_request_deny`
- `wallet_policy_get`, `wallet_policy_update`
- `wallet_pause`, `wallet_resume`
- `store_bucket_create`, `store_bucket_list`, `store_bucket_get`, `store_bucket_delete`
- `store_object_put`, `store_object_list`, `store_object_get`, `store_object_delete`
- `store_quota_get`, `store_quota_set`
- `spawn_server_create`, `spawn_server_list`, `spawn_server_get`, `spawn_server_delete`
- `spawn_server_start`, `spawn_server_stop`, `spawn_server_reboot`, `spawn_server_resize`, `spawn_server_rebuild`
- `spawn_ssh_key_create`, `spawn_ssh_key_list`, `spawn_ssh_key_delete`
- `faucet_usdc`, `faucet_eth`, `faucet_status`
- `search_web`, `search_news`, `search_extract`

### x402 payment handling

Each tool handler uses `createPrimFetch()` from `@primsh/x402-client`. The MCP server reads the wallet keystore from `~/.prim/keys/` (same as CLI). Payment is transparent to the agent — it calls `store_bucket_create`, MCP server handles 402 → sign → retry internally.

Config resolution order:
1. `--wallet` flag to `prim mcp`
2. `PRIM_WALLET` env var
3. Default wallet from `~/.prim/config.toml`

### Tool input/output schemas

Derived from OpenAPI specs (L-62). Each tool's `inputSchema` is the OpenAPI request body schema. Output is the response schema. Errors surfaced as MCP tool errors with the prim error envelope.

### Resources (MCP resources, not tools)

Expose read-only state as MCP resources:
- `prim://wallet/{address}` — wallet details
- `prim://store/{bucket_id}` — bucket details
- `prim://spawn/{server_id}` — server details

Resources are optional — tools are the primary interface.

### CLI integration

Add to `packages/keystore/src/cli.ts`:

```
prim mcp [--primitives wallet,store] [--wallet 0x...]
```

Dispatches to `packages/mcp/src/index.ts`. The `prim` binary must be recompiled to include the mcp package.

### Testing

- Unit tests: mock HTTP responses, verify tool schemas match OpenAPI
- Integration test: start MCP server, connect via SDK client, call each tool, verify responses
- Smoke test: `echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | prim mcp` returns valid tool list

---

## Phase 4: Skills (L-65)

**Goal:** Workflow knowledge documents that teach agents *when* and *why* to use each primitive, error handling patterns, and multi-primitive workflows.

**Depends on:** L-62 (needs accurate endpoint inventory).

### What a Skill is

A markdown document with optional YAML frontmatter. Not code — knowledge. Agents load Skills into their context to understand how to accomplish tasks using prim primitives.

### Files to create

```
skills/
├── wallet.md       # Wallet management workflows
├── store.md        # Storage workflows
├── spawn.md        # Server provisioning workflows
├── faucet.md       # Testnet funding workflows
├── search.md       # Search and extraction workflows
├── getting-started.md  # Onboarding: wallet → fund → use
└── multi-prim.md   # Cross-primitive workflows
```

### Skill content structure

Each skill file covers:

1. **When to use** — which problems this primitive solves, when to reach for it vs alternatives
2. **Prerequisites** — what must be true before using (wallet registered? funded? allowlisted?)
3. **Common workflows** — step-by-step sequences with tool names (not HTTP calls)
4. **Error handling** — what each error code means, how to recover
5. **Gotchas** — rate limits, pagination, size limits, things agents get wrong
6. **Multi-prim patterns** — how this primitive connects to others

### Key multi-prim workflows to document

- **Onboarding:** `wallet_register` → `faucet_usdc` → ready to use any primitive
- **Deploy and store:** `spawn_server_create` → `store_bucket_create` → `store_object_put` (deploy config)
- **Research pipeline:** `search_web` → `store_object_put` (save results) → `search_extract` (deep dive)
- **Server lifecycle:** `spawn_server_create` → monitor → `spawn_server_resize` → `spawn_server_delete`

### YAML frontmatter

```yaml
---
name: store
version: 1.0.0
primitive: store.prim.sh
requires: [wallet]
tools: [store_bucket_create, store_bucket_list, ...]
---
```

---

## Phase 5: Plugins (L-66)

**Goal:** `prim install store` drops MCP config + skill into the agent's environment. One command, fully wired.

**Depends on:** L-64 (MCP server), L-65 (Skills).

### What "install" means

For Claude Code / Cursor / VS Code agents, installing a plugin means:
1. Adding MCP server config to the agent's MCP settings file
2. Dropping the skill file where the agent can load it

### Plugin registry

```
plugins/
├── wallet/
│   ├── manifest.json    # Plugin metadata
│   ├── mcp-config.json  # MCP server connection config
│   └── skill.md         # → symlink or copy of skills/wallet.md
├── store/
│   ├── manifest.json
│   ├── mcp-config.json
│   └── skill.md
└── ...
```

### manifest.json

```json
{
  "name": "store",
  "version": "1.0.0",
  "primitive": "store.prim.sh",
  "description": "Object storage for agents",
  "requires": ["wallet"],
  "mcp": "mcp-config.json",
  "skill": "skill.md"
}
```

### mcp-config.json

```json
{
  "mcpServers": {
    "prim-store": {
      "command": "prim",
      "args": ["mcp", "--primitives", "store"]
    }
  }
}
```

### `prim install` behavior

1. Check `prim` binary is installed
2. Check wallet exists (prompt to create if not)
3. Detect agent environment (Claude Code → `~/.claude/mcp.json`, Cursor → `.cursor/mcp.json`, generic → stdout)
4. Merge MCP config into detected config file
5. Copy skill file to agent's skill/context directory (or print instructions if location unknown)
6. Print: "Installed store.prim.sh. Restart your agent to load the MCP server."

### CLI integration

Add to `packages/keystore/src/cli.ts`:

```
prim install <primitive|all> [--agent claude|cursor|generic]
prim uninstall <primitive|all>
```

### Decision: `prim install all` vs individual

Support both. `prim install all` wires up the unified MCP server (all primitives). `prim install store` wires up a filtered MCP server (`--primitives store`). Default to `all` if no argument.

---

## Phase 6: CLI for remaining prims (L-67)

**Goal:** `prim search` subcommands. search is the only live primitive without CLI coverage.

**Depends on:** L-62 (OpenAPI spec defines the commands).

### Files to create/modify

- Create `packages/keystore/src/search-commands.ts` — following the pattern in `email-commands.ts`, `store-commands.ts`, `spawn-commands.ts`
- Modify `packages/keystore/src/cli.ts` — add `search` group dispatch

### Subcommands

```
prim search web <query> [--max-results N] [--depth basic|advanced] [--country XX] [--time-range day|week|month|year]
prim search news <query> [--max-results N] [--country XX] [--time-range day|week|month|year]
prim search extract <url> [--format markdown|text]
```

### Pattern to follow

`email-commands.ts` is the most recent and cleanest pattern (~470 lines). Key elements:
- Uses `createPrimFetch()` for x402 payment
- Uses `getFlag()` / `getFlagValue()` from `flags.ts` for arg parsing
- Prints structured output (tables for lists, detail views for single items)
- Error handling with user-friendly messages

---

## Execution order

```
L-62 (OpenAPI specs)
 ├─→ L-63 (llms.txt rewrite)
 ├─→ L-64 (MCP servers)
 ├─→ L-65 (Skills)
 └─→ L-67 (CLI for search)
       │
       └─→ L-66 (Plugins) — needs L-64 + L-65 done first
```

L-62 is the keystone. L-63, L-64, L-65, L-67 can proceed in parallel once L-62 is done. L-66 is the capstone that bundles L-64 + L-65.

---

## Testing strategy

| Task | Test |
|------|------|
| L-62 | `npx @redocly/cli lint specs/openapi/*.yaml` passes. Every operationId maps to an actual route handler. |
| L-63 | Every endpoint listed in OpenAPI spec appears in llms.txt with request fields, response fields, and error codes. Manual review. |
| L-64 | `echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' \| prim mcp` returns valid JSON-RPC with all expected tool names. Integration test: call `faucet_status` tool → get valid response. |
| L-65 | Each skill references only tools that exist in the MCP server. Every error code mentioned matches the OpenAPI spec. |
| L-66 | `prim install store --agent generic` outputs valid MCP config JSON. `prim install all` writes config to detected agent environment. |
| L-67 | `prim search web "test query"` returns results (against live or mocked endpoint). `prim search --help` prints usage. |

## Before closing

- [ ] Run `pnpm check` (lint + typecheck + tests pass)
- [ ] Re-read each AC and locate the line of code that enforces it
- [ ] For every boolean condition, verify both True and False paths are covered by tests
- [ ] Verify OpenAPI specs validate with redocly lint
- [ ] Verify every MCP tool name matches its OpenAPI operationId
- [ ] Verify llms.txt field listings match OpenAPI request/response schemas exactly
- [ ] Verify `prim mcp` handles missing wallet gracefully (error message, not crash)
