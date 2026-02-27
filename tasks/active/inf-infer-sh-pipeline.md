# Spawn → Infer → Test Pipeline

**Tasks**: PRIMS-W7 (INF-1 through INF-6), INFRA-W8 (I-30, I-31)

## Context

Manual smoke testing (groups 1-6) found 2 failures, 7 blocked tests, 6 CLI bugs, and 3 UX gaps across 38 tests. To run these continuously, we need an automated runner. The vision: power an AI agent via infer.sh, have it exercise all primitives, collect results.

Three blockers today:
1. infer.sh is scaffolded but not implemented (all routes return 501)
2. infer.sh is not deployed to the VPS
3. No automated smoke runner script exists

## Phase 1: Implement infer.sh (INF-1 → INF-5, SRL)

### INF-1: api.ts types

**File**: `packages/infer/src/api.ts`

OpenAI-compatible types (OpenRouter uses the same schema).

**ChatRequest**: `model` (string, required), `messages` (Message[], required), `temperature?`, `max_tokens?`, `top_p?`, `stream?` (MVP: false only), `tools?` (Tool[]), `tool_choice?`, `response_format?` ({ type: "text" | "json_object" })

**Message**: `role` ("system" | "user" | "assistant" | "tool"), `content` (string | ContentPart[]), `tool_call_id?`, `tool_calls?` (ToolCall[])

**Supporting types**: Tool, ToolCall, ContentPart (text + image_url), Choice, Usage

**ChatResponse**: `id`, `object` ("chat.completion"), `created`, `model`, `choices` (Choice[]), `usage` (Usage)

**EmbedRequest**: `model` (string, required), `input` (string | string[], required)

**EmbedResponse**: `object` ("list"), `data` ({ object: "embedding", index, embedding: number[] }[]), `model`, `usage`

**ModelsResponse**: `data` (ModelInfo[]) — ModelInfo has `id`, `name`, `context_length`, `pricing` ({ prompt, completion })

### INF-2: openrouter.ts provider

**File**: `packages/infer/src/openrouter.ts`

Follow `packages/search/src/tavily.ts` pattern:
- Private `post<T>(path, body)` and `get<T>(path)` helpers
- `chat(req)` → POST `https://openrouter.ai/api/v1/chat/completions` — pass request body through, return ChatResponse
- `embed(req)` → POST `https://openrouter.ai/api/v1/embeddings` — if 404, return ProviderError("Embeddings not supported by this provider")
- `models()` → GET `https://openrouter.ai/api/v1/models` — map to ModelsResponse shape
- Rate limit: 429 → ProviderError with retryAfter from Retry-After header
- Headers: `Authorization: Bearer ${apiKey}`, `HTTP-Referer: https://prim.sh`, `X-OpenRouter-Title: infer.prim.sh`

**Fix**: Env var `INFER_API_KEY` → `OPENROUTER_API_KEY` (match prim.yaml)

**Provider interface** in `packages/infer/src/provider.ts`:
- `chat(req: ChatRequest): Promise<ChatResponse>`
- `embed(req: EmbedRequest): Promise<EmbedResponse>`
- `models(): Promise<ModelsResponse>`

### INF-3: service.ts

**File**: `packages/infer/src/service.ts`

Follow `packages/search/src/service.ts` pattern:
- Singleton `getClient()` import from openrouter.ts
- `chat(body)`: validate `model` (string, non-empty) and `messages` (array, non-empty) required → delegate to provider
- `embed(body)`: validate `model` and `input` required → delegate to provider
- `models()`: no validation, no body param → delegate to provider
- `handleProviderError()` helper: ProviderError → ServiceResult error shape

### INF-4: Fix scaffolder bugs in index.ts

**File**: `packages/infer/src/index.ts`

1. **GET /v1/models handler** (line 160-167): Remove JSON body parsing. GET requests don't have bodies. Just call `models()` directly.
2. **models() signature** in service.ts: Change from `models(body: Record<string, unknown>)` to `models()`.

### INF-5: Smoke test update

**File**: `packages/infer/test/smoke.test.ts`

Fill in `MOCK_RESPONSE` with realistic ChatResponse:
```
{ id: "gen-xxx", object: "chat.completion", created: 1700000000, model: "anthropic/claude-sonnet-4", choices: [{ index: 0, message: { role: "assistant", content: "Hello" }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }
```

Verify all 5 checks pass.

## Phase 2: Deploy infer.sh (INF-6)

1. **prim.yaml**: Change `status: building` → `status: live`
2. **gen-prims**: Run `pnpm gen:prims` — auto-updates SERVICES arrays in deploy.sh, setup.sh, healthcheck.sh
3. **Systemd unit**: Create `deploy/prim/services/prim-infer.service` (copy prim-search.service, change packages/search → packages/infer, port → 3012)
4. **Env template**: Create `deploy/prim/generated/infer.env.template` with PRIM_PAY_TO, PRIM_NETWORK, OPENROUTER_API_KEY, WALLET_INTERNAL_URL, PRIM_INTERNAL_KEY
5. **Caddy**: Add `infer.prim.sh` reverse proxy block → localhost:3012
6. **VPS**: rsync, deploy.sh, create /etc/prim/infer.env with real secrets, start prim-infer
7. **Verify**: `GET https://infer.prim.sh/` → `{ service: "infer.sh", status: "ok" }`

## Phase 3: Smoke Runner (I-30, I-31)

### I-30: tests/smoke-runner.ts

Bun script that orchestrates automated smoke testing:
- Reads `tests/smoke-test-plan.json`
- For each group: spawns a Claude subagent with group prompt
- Agent uses infer.sh for LLM reasoning + prim CLI for x402 calls
- Collects results (pass/fail/blocked per test ID) + UX observations
- Writes results to `tests/runs/<timestamp>.json`
- Prints summary

MVP: run agent locally (no spawn.sh isolation yet). Same pre-funded wallet.

### I-31: Add infer.sh tests to smoke-test-plan.json

New group `infer` with 4 tests:
- INF-H1: GET / → health check
- INF-T1: POST /v1/chat → chat completion with simple prompt
- INF-T2: POST /v1/embed → embeddings
- INF-T3: GET /v1/models → model list

## Key references

- Provider pattern: `packages/search/src/tavily.ts`, `packages/search/src/provider.ts`
- Service pattern: `packages/search/src/service.ts`
- Deploy pattern: `deploy/prim/services/prim-search.service`, `deploy/prim/deploy.sh`
- OpenRouter base URL: `https://openrouter.ai/api/v1`
- Smoke test plan: `tests/smoke-test-plan.json`

## Before closing

- [ ] Run `pnpm -r check` (lint + typecheck + test)
- [ ] Verify env var name is OPENROUTER_API_KEY everywhere (not INFER_API_KEY)
- [ ] Verify GET /v1/models handler does NOT parse JSON body
- [ ] Verify 5/5 smoke tests pass with realistic mock data
- [ ] Run `pnpm gen:prims` after changing status to live
