# I-20: Agent Skills

**Status:** pending
**Goal:** Write workflow knowledge documents that teach agents *when* and *why* to use each primitive, error recovery patterns, and multi-primitive workflows. Skills are the "how to think about it" layer above the "how to call it" layer (MCP/CLI/OpenAI).
**Depends on:** I-18 (need accurate endpoint inventory from OpenAPI specs)
**Scope:** `skills/` directory (new)
**Absorbs:** Wave 5.5 L-65

## Context

The Asher test showed that schema-level docs (llms.txt, MCP tool descriptions) aren't sufficient. Agents need workflow knowledge: which primitives to combine, in what order, how to recover from errors, and what gotchas to watch for. Skills fill this gap.

Skills are markdown documents with YAML frontmatter. They're loaded into agent context (via MCP resources, Claude Code skills, or Cursor rules). Not code — knowledge.

## Files to Create

```
skills/
├── getting-started.md    # Onboarding: wallet → fund → use any prim
├── wallet.md             # Wallet management workflows
├── store.md              # Storage workflows
├── spawn.md              # Server provisioning workflows
├── search.md             # Search and extraction workflows
├── email.md              # Email workflows
├── mem.md                # Memory/vector workflows
├── domain.md             # Domain registration and DNS workflows
├── token.md              # Token deployment workflows
├── faucet.md             # Testnet funding (brief — simple service)
└── multi-prim.md         # Cross-primitive workflow patterns
```

## Skill Content Structure

Each per-prim skill follows this outline:

### 1. When to use
Which problems this primitive solves. When to reach for it vs alternatives.

### 2. Prerequisites
What must be true before using: wallet registered? funded? allowlisted?

### 3. Common workflows
Step-by-step sequences using tool names (not HTTP calls). Example:

```
## Create and use a mailbox

1. `email_mailbox_create` with desired username
2. Note the mailbox_id and email address returned
3. `email_webhook_create` to get notified of incoming mail
4. `email_messages_list` to poll for messages
5. `email_send` to send replies
```

### 4. Error handling
What each error code means and how to recover. Decision table format:

```
| Error code       | Meaning                    | Recovery                          |
|-----------------|----------------------------|-----------------------------------|
| invalid_request | Missing/bad field          | Check required fields, retry      |
| rate_limited    | Too many requests          | Wait retryAfter seconds, retry    |
| quota_exceeded  | Storage/mailbox limit hit  | Delete old items or request quota  |
| provider_error  | Upstream vendor failure    | Wait 30s, retry once, then report |
```

### 5. Gotchas
Rate limits, size limits, pagination requirements, things agents commonly get wrong.

### 6. Related primitives
How this primitive connects to others. Links to relevant multi-prim workflows.

## YAML Frontmatter

```yaml
---
name: store
version: 1.0.0
primitive: store.prim.sh
requires: [wallet]
tools: [store_bucket_create, store_bucket_list, ...]
---
```

`requires` lists primitives that must be set up first. `tools` lists all MCP tool names for this primitive (used by agent runtimes to validate tool availability).

## Multi-Prim Workflows

`multi-prim.md` documents cross-primitive patterns:

- **Agent identity:** wallet_register → email_mailbox_create → domain_register (wallet + email + custom domain)
- **Knowledge base:** mem_collection_create → search_web → mem_upsert (search and remember)
- **Deploy and store:** spawn_server_create → store_bucket_create → store_object_put (deploy config)
- **Token launch:** token_deploy → token_mint → token_pool_create → domain_register (project site)
- **Custom email domain:** domain_register → domain_zone_mail_setup → email_domain_register → email_domain_verify
- **Research pipeline:** search_web → store_object_put (save) → search_extract (deep dive) → mem_upsert (remember)

## Key Decisions

- **Tool names, not HTTP calls.** Skills reference MCP tool names (e.g. `store_bucket_create`), not endpoints (e.g. `POST /v1/buckets`). Agents using MCP, CLI, or OpenAI functions all use the same names.
- **Workflow, not reference.** Skills don't duplicate the endpoint docs (that's llms.txt / OpenAPI). They document *sequences*, *decisions*, and *recovery patterns*.
- **Concise.** Each skill should be <200 lines. Agents have limited context. Brevity is a feature.

## Testing Strategy

- Every tool name referenced in a skill exists in the MCP server (`prim mcp --list-tools`)
- Every error code referenced matches the OpenAPI spec's error definitions
- Getting-started.md sequence works end-to-end on testnet (manual validation)

## Before Closing

- [ ] All 11 skill files created
- [ ] Frontmatter `tools` lists match MCP tool names exactly
- [ ] No skill references a tool or error code that doesn't exist
- [ ] Multi-prim workflows are tested conceptually (each step is valid)
- [ ] Each skill is <200 lines
