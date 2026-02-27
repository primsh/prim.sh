# L-72: Agent Interface Layer — Wave 2 (email, mem, domain, token)

**Status:** Planning
**Goal:** Extend the full agent interface stack (OpenAPI, MCP tools, Skills, Plugins, CLI, llms.txt) to the next 4 primitives: email, mem, domain, token. Follows the Wave 5.5 pattern exactly.

**Why now:** email.sh just deployed live. Asher test showed agents can't reliably use a primitive without machine-readable schemas and MCP tools. Every primitive that goes live needs the full interface stack or agents can't use it.

---

## Primitives in scope

| Primitive | Package | Routes | CLI today | MCP today | Status |
|-----------|---------|--------|-----------|-----------|--------|
| email | `packages/email/` | 17 | `prim email` (R-15) | None | Live on VPS |
| mem | `packages/mem/` | 10 | None | None | Built, not deployed |
| domain | `packages/domain/` | 20 | None | None | Built, not deployed |
| token | `packages/token/` | 9 | None | None | Built, not deployed |

---

## Deliverables per primitive

For each of email, mem, domain, token:

1. **OpenAPI spec** → `specs/openapi/{name}.yaml`
2. **MCP tools** → `packages/mcp/src/tools/{name}.ts`
3. **Skill** → `skills/{name}.md`
4. **Plugin** → register in `install-commands.ts` primitive registry
5. **CLI subcommands** → `packages/keystore/src/{name}-commands.ts` (email already done)
6. **llms.txt** → inline `GET /llms.txt` route in each service's `index.ts` (email already done)

---

## Phase 1: OpenAPI Specs

### Files to create

```
specs/openapi/
├── email.yaml     # 17 routes: mailbox CRUD, messages, send, webhooks, domains
├── mem.yaml       # 10 routes: collections, upsert, query, cache CRUD
├── domain.yaml    # 20 routes: domain search/register/recover, zones, records
└── token.yaml     # 9 routes: token deploy, mint, supply, pool/liquidity
```

### Source data

Extract schemas from each primitive's `api.ts` + `index.ts`:
- `packages/email/src/api.ts` — 212 lines, well-typed (CreateMailboxRequest, EmailMessage, WebhookPayload, DomainResponse, etc.)
- `packages/mem/src/api.ts` — 104 lines (CreateCollectionRequest, UpsertRequest, QueryRequest, CacheEntry)
- `packages/domain/src/api.ts` — 272 lines (DomainQuoteRequest, RegisterDomainRequest, ZoneResponse, DnsRecordRequest, etc.)
- `packages/token/src/api.ts` — 118 lines (DeployTokenRequest, MintRequest, PoolCreateRequest, TokenResponse)

### Same format as Wave 5.5 specs

- OpenAPI 3.1
- x402 security scheme with per-route `x-price`
- Full JSON Schema for every request/response
- Error envelope: `{error: {code: string, message: string}}`
- Examples for every endpoint

---

## Phase 2: MCP Tools

### Files to create

```
packages/mcp/src/tools/
├── email.ts    # email_* tools
├── mem.ts      # mem_* tools
├── domain.ts   # domain_* tools
└── token.ts    # token_* tools
```

### File to modify

- `packages/mcp/src/server.ts` — import and register the 4 new tool modules
- `packages/mcp/src/index.ts` — add email, mem, domain, token to `--primitives` filter

### Tool naming

Follow `<primitive>_<action>` convention:

**email** (17 tools):
- `email_mailbox_create`, `email_mailbox_list`, `email_mailbox_get`, `email_mailbox_delete`, `email_mailbox_renew`
- `email_messages_list`, `email_message_get`, `email_send`
- `email_webhook_create`, `email_webhook_list`, `email_webhook_delete`
- `email_domain_register`, `email_domain_list`, `email_domain_get`, `email_domain_verify`, `email_domain_delete`

**mem** (7 tools):
- `mem_collection_create`, `mem_collection_list`, `mem_collection_get`, `mem_collection_delete`
- `mem_upsert`, `mem_query`
- `mem_cache_put`, `mem_cache_get`, `mem_cache_delete`

**domain** (14 tools):
- `domain_search`, `domain_quote`, `domain_register`, `domain_recover`, `domain_status`, `domain_configure_ns`
- `domain_zone_create`, `domain_zone_list`, `domain_zone_get`, `domain_zone_delete`, `domain_zone_verify`, `domain_zone_activate`, `domain_zone_mail_setup`
- `domain_record_create`, `domain_record_list`, `domain_record_get`, `domain_record_update`, `domain_record_delete`, `domain_record_batch`

**token** (8 tools):
- `token_deploy`, `token_list`, `token_get`
- `token_mint`, `token_supply`
- `token_pool_create`, `token_pool_get`, `token_pool_liquidity_params`

### x402 handling

Same as Wave 5.5 — each tool handler uses `createPrimFetch()` from `@primsh/x402-client`. Payment is transparent to the agent.

---

## Phase 3: Skills

### Files to create

```
skills/
├── email.md      # Email workflows: create mailbox → receive → send → webhooks
├── mem.md        # Memory workflows: collections → upsert → semantic query
├── domain.md     # Domain workflows: search → register → DNS → mail setup
└── token.md      # Token workflows: deploy → mint → create pool → add liquidity
```

### File to modify

- `skills/multi-prim.md` — add cross-primitive workflows involving the new 4
- `skills/getting-started.md` — mention email/mem/domain/token as available primitives

### Key multi-prim workflows to add

- **Agent identity:** `wallet_register` → `email_mailbox_create` → `domain_register` → agent has wallet + email + custom domain
- **Knowledge base:** `mem_collection_create` → `search_web` → `mem_upsert` (search and remember)
- **Launch token:** `token_deploy` → `token_mint` → `token_pool_create` → `domain_register` (project site)
- **Custom email domain:** `domain_register` → `domain_zone_mail_setup` → `email_domain_register` → `email_domain_verify`

---

## Phase 4: Plugins

### File to modify

- `packages/keystore/src/install-commands.ts` — add email, mem, domain, token to the primitive registry so `prim install email` and `prim install all` work

---

## Phase 5: CLI Subcommands

### Files to create

```
packages/keystore/src/
├── mem-commands.ts      # prim mem create/ls/get/rm/upsert/query/cache
├── domain-commands.ts   # prim domain search/register/recover/zone/record
└── token-commands.ts    # prim token deploy/ls/get/mint/supply/pool
```

### File to modify

- `packages/keystore/src/cli.ts` — add mem, domain, token group dispatches

Email CLI already exists (`email-commands.ts`). No changes needed.

### Subcommands

```
prim mem create --name NAME [--model MODEL]
prim mem ls
prim mem get COLLECTION_ID
prim mem rm COLLECTION_ID
prim mem upsert COLLECTION_ID --text TEXT [--id DOC_ID] [--metadata JSON]
prim mem query COLLECTION_ID --query TEXT [--limit N]
prim mem cache put NAMESPACE KEY [--value VALUE | --file PATH] [--ttl SECONDS]
prim mem cache get NAMESPACE KEY
prim mem cache rm NAMESPACE KEY

prim domain search QUERY [--tlds com,xyz,...]
prim domain quote DOMAIN
prim domain register DOMAIN [--years N]
prim domain recover DOMAIN --secret SECRET
prim domain status DOMAIN
prim domain ns DOMAIN --ns NS1 --ns NS2
prim domain zone create --zone ZONE
prim domain zone ls
prim domain zone get ZONE_ID
prim domain zone rm ZONE_ID
prim domain zone verify ZONE_ID
prim domain zone activate ZONE_ID
prim domain zone mail-setup ZONE_ID
prim domain record add ZONE_ID --type A --name @ --content IP [--ttl 300]
prim domain record ls ZONE_ID
prim domain record get ZONE_ID RECORD_ID
prim domain record update ZONE_ID RECORD_ID --content NEW_IP
prim domain record rm ZONE_ID RECORD_ID

prim token deploy --name NAME --symbol SYM --supply N [--decimals 18]
prim token ls
prim token get TOKEN_ID
prim token mint TOKEN_ID --amount N --to ADDRESS
prim token supply TOKEN_ID
prim token pool create TOKEN_ID --eth-amount N [--fee-tier 3000]
prim token pool get TOKEN_ID
prim token pool params TOKEN_ID
```

---

## Phase 6: Inline llms.txt

### Files to modify

- `packages/mem/src/index.ts` — add `GET /llms.txt` free route with full API reference
- `packages/domain/src/index.ts` — add `GET /llms.txt` free route
- `packages/token/src/index.ts` — add `GET /llms.txt` free route

Email already has `GET /llms.txt` (done in L-68 deploy).

---

## Execution order

```
OpenAPI specs (all 4 in parallel)
 ├─→ MCP tools (all 4)
 ├─→ Skills (all 4)
 ├─→ CLI subcommands (mem, domain, token — email already done)
 └─→ Inline llms.txt (mem, domain, token — email already done)
       │
       └─→ Plugin registry update (needs MCP + Skills done)
```

OpenAPI specs first — everything else derives from them.

---

## Dependency: email only is live

email.sh is the only one deployed. mem, domain, and token need their own deploy tasks (L-71 for mem, L-70 for token, new task for domain). The agent interface work can proceed before deployment — MCP tools just need the API types, not a live server. Point URLs at env vars (`PRIM_EMAIL_URL`, `PRIM_MEM_URL`, etc.) so they work against localhost or live.

---

## Before closing

- [ ] Run `pnpm check` (lint + typecheck + tests pass)
- [ ] `npx @redocly/cli lint specs/openapi/{email,mem,domain,token}.yaml` passes
- [ ] Every MCP tool name maps to an actual route handler
- [ ] `prim install all` includes all 9 primitives (5 existing + 4 new)
- [ ] `echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | prim mcp` lists email/mem/domain/token tools
- [ ] Each inline llms.txt covers every endpoint with request/response fields
- [ ] Skills reference only tools that exist in the MCP server
