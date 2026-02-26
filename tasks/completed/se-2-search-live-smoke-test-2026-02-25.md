# SE-2: search.sh Live Smoke Test

## Context

search.sh (SE-1) is built with 30 unit tests against mocked Tavily responses. SE-2 validates the `TavilyClient` works against the real Tavily API — same pattern as SP-8 (spawn DO smoke test).

search.sh is **stateless** — no resources to create or clean up. This is simpler than SP-8. No `afterAll` cleanup, no polling, no resource IDs to track.

## Goals

- Verify `TavilyClient` works against live Tavily API (web search, news search, extract)
- Confirm response shapes match our provider interfaces
- Run separately from `pnpm -r test` (don't hit Tavily in CI)
- Skip gracefully when `TAVILY_API_KEY` is not set

## Run Command

```bash
TAVILY_API_KEY=tvly-xxx pnpm -C packages/search test:smoke
```

## Files to Modify

### 1. `packages/search/test/smoke-live.test.ts` (NEW)

Live test file. Tests the `TavilyClient` class directly (provider-level, not HTTP routes). 5 sequential tests:

| # | Test | Assertion |
|---|------|-----------|
| 0 | preflight — client instantiates | `expect(client).toBeDefined()` — `TavilyClient` constructor accepts the key without throwing |
| 1 | web search — basic query | `results.length > 0`, `results[0].score > 0`, `results[0].url` starts with `http`, `results[0].title` is non-empty string, `response_time > 0` |
| 2 | web search with `include_answer` | `answer` is a non-empty string (truthy), `results.length > 0` |
| 3 | news search | `results.length > 0`, `results[0].url` starts with `http` |
| 4 | URL extract | Use `https://example.com` (stable, always available). `results.length === 1`, `results[0].url === "https://example.com"`, `results[0].content` is non-empty, `failed.length === 0` |

**Pattern to follow** — SP-8's structure:
- `describe.skipIf(!HAS_KEY)` wrapping all tests
- `requireEnv()` helper in test 0
- Sequential numbered tests (each depends on client from test 0)
- Suite timeout: `30_000` (Tavily is fast, no resource provisioning)

**Test query choice**: Use a factual, stable query like `"TypeScript programming language"` — results won't change over time. Avoid current events or time-sensitive queries.

### 2. `packages/search/package.json`

Update scripts to match SP-8 pattern:

| Script | Current | New |
|--------|---------|-----|
| `test` | `vitest --run` | `vitest --run --exclude test/smoke-live.test.ts` |
| `test:smoke` | (missing) | `vitest --run test/smoke-live.test.ts` |

This ensures `pnpm -r check` and CI don't hit Tavily. Live tests only run with explicit `test:smoke`.

### 3. `packages/search/vitest.config.ts`

No changes needed — the `--exclude` flag in the `test` script handles separation.

## Key Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Test level | `TavilyClient` directly | Same as SP-8 (tests provider, not HTTP stack). Unit tests already cover routes. |
| No cleanup needed | Stateless | search.sh creates no resources — no buckets, no servers, no mailboxes |
| Query string | `"TypeScript programming language"` | Stable, factual, guaranteed to return results |
| Extract URL | `https://example.com` | IANA-reserved, always up, small page, fast extract |
| Suite timeout | 30s | Tavily responds in <2s per request; 30s is generous |
| Skip mechanism | `describe.skipIf(!process.env.TAVILY_API_KEY)` | Same as SP-8's `!HAS_TOKEN` pattern |

## Env Vars

Only one required: `TAVILY_API_KEY` (format: `tvly-...`, from app.tavily.com).

No `PRIM_NETWORK` or `PRIM_PAY_TO` needed — smoke test hits Tavily directly, not through x402.

## Before Closing

- [ ] Run `TAVILY_API_KEY=tvly-xxx pnpm -C packages/search test:smoke` — all 5 tests pass
- [ ] Run `pnpm -C packages/search test` — existing 30 tests still pass (smoke-live excluded)
- [ ] Run `pnpm -C packages/search check` — lint + typecheck + test pass
- [ ] Verify missing `TAVILY_API_KEY` skips the entire describe block (no failure)
