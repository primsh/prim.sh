# SE-1: Build search.sh — Agent-Native Web Search

> Renamed from seek.sh → search.sh. Package: `@agentstack/search`. Subdomain: `search.prim.sh`.

## Context

Agents need web access — search, page extraction, screenshots for vision models. Today they bring their own API keys (Brave, Google, Tavily) and manage accounts. search.sh makes the web an x402 API call: pay per request, no signup, no key management.

**Key insight:** search.sh is a **stateless proxy** — unlike store.sh or spawn.sh, there are no user-owned resources to track. No CRUD, no ownership model, no SQLite. Agent pays, gets results, done.

## TOS Compliance

Every major search API (Brave, Google, Bing, Serper) explicitly prohibits redistribution/reselling of results. The exception is **Tavily**, whose TOS includes a carve-out:

> "integration of the Services in Customer Applications in accordance with this Agreement will not constitute a violation of this restriction"

search.sh is a Customer Application — it provides a fundamentally different auth/payment mechanism (x402 crypto micropayments vs API keys), unified response schema, and provider abstraction. This is integration, not resale.

## Goals

- 4 endpoints: web search, news search, extract (URL → Markdown), screenshot (URL → PNG)
- x402 gated — per-request micropayments
- Provider-abstracted from day 1 — start with Tavily (search + extract), add others behind the interface
- Stateless — no SQLite, no ownership model

## API Surface

### Endpoints

```
POST /v1/search           # Web search
POST /v1/search/news      # News-specific search
POST /v1/extract          # URL → Markdown
GET  /v1/screenshot       # URL → PNG image
GET  /                    # Health check (free)
```

> POST for search + extract (matches Tavily's API and avoids query-string length limits for complex queries). GET for screenshot (simple URL param, returns binary).

### Pricing

| Endpoint | Cost | Upstream cost | Margin |
|----------|------|---------------|--------|
| `POST /v1/search` | $0.01 | $0.008 (Tavily basic, 1 credit) | 25% |
| `POST /v1/search/news` | $0.01 | $0.008 (Tavily basic, topic=news) | 25% |
| `POST /v1/extract` | $0.005 | $0.0016 (Tavily, 1 credit/5 URLs) | 69% |
| `GET /v1/screenshot` | $0.01 | TBD (separate provider) | TBD |

> Tavily pricing: $0.008/credit (pay-as-you-go). Basic search = 1 credit. Advanced = 2 credits. Extract = 1 credit per 5 URLs. Free tier: 1,000 credits/month.

### Request/Response Types

```
SearchRequest (POST body):
  query: string             — search query (required)
  max_results?: number      — 1-20 (default 5)
  search_depth?: string     — "basic" | "advanced" (default "basic")
  country?: string          — boost results from country
  time_range?: string       — "day" | "week" | "month" | "year"
  include_answer?: boolean  — LLM-generated short answer (default false)
  include_domains?: string[] — restrict to these domains
  exclude_domains?: string[] — exclude these domains

SearchResponse:
  query: string
  answer?: string                — LLM-generated answer (if requested)
  results: SearchResult[]
  response_time: number          — seconds

SearchResult:
  title: string
  url: string
  content: string                — relevant snippet
  score: number                  — relevance score 0-1
  published?: string             — ISO 8601 (news results)

NewsSearchRequest (POST body):
  Same as SearchRequest. Internally sets topic="news" on Tavily.

ExtractRequest (POST body):
  urls: string | string[]   — 1-20 URLs to extract (required)
  format?: string           — "markdown" (default) | "text"

ExtractResponse:
  results: ExtractResult[]
  failed: FailedExtraction[]
  response_time: number

ExtractResult:
  url: string
  content: string            — extracted Markdown or text
  images?: string[]          — extracted image URLs

FailedExtraction:
  url: string
  error: string

ScreenshotRequest (query params):
  url: string               — URL to capture (required)
  width?: number            — viewport width (default 1280)
  height?: number           — viewport height (default 800, 0 = full page)
  format?: string           — "png" (default) | "jpeg"

ScreenshotResponse:
  Binary image data with Content-Type header
```

### Error Codes

```
invalid_request    — missing/invalid params
provider_error     — upstream API returned error
rate_limited       — upstream rate limit hit (include Retry-After header)
```

## Provider Strategy

### Launch provider: Tavily

**Why Tavily:**
- **TOS-compliant** — explicit Customer Application carve-out (only major search API with this)
- Search + extract in one provider — fewer moving parts
- Purpose-built for AI agents — clean structured JSON, relevance scoring
- `topic: "news"` handles news search on the same API (no separate endpoint)
- Batch extract (up to 20 URLs per call) — efficient for agents
- Free tier (1,000 credits/month) for development

**API details:**
- Base: `https://api.tavily.com`
- Auth: `Authorization: Bearer tvly-<API_KEY>`
- `POST /search` — web + news search (topic param)
- `POST /extract` — URL content extraction
- Rate limits: varies by plan. 429 on exceeded.

**Env var:** `TAVILY_API_KEY`

### Future providers (behind interface)

| Provider | Capability | TOS status | Notes |
|----------|-----------|------------|-------|
| Brave Search | search + news | ❌ Prohibits redistribution | Requires enterprise agreement |
| Exa.ai | semantic search | Unknown — needs TOS review | Good for AI-native queries |
| SearXNG | search | AGPL ok, upstream grey | Self-hosted, aggregates from Google/Bing |
| Firecrawl | extract + screenshot | Needs TOS review | Crawling + rendering |

Provider interface from day 1 means adding these later is mechanical.

### Screenshot provider: TBD

Tavily doesn't offer screenshots. Options:
- ScreenshotOne ($0.002/shot, simple API)
- Firecrawl (has screenshot, needs TOS review)
- Self-hosted Playwright (infra burden)

Defer to SE-3. Screenshot endpoint is independent — can add it without touching search/extract code.

### Provider Interfaces

```ts
// provider.ts

interface SearchProvider {
  search(params: SearchProviderParams): Promise<SearchProviderResult>
  searchNews(params: SearchProviderParams): Promise<SearchProviderResult>
}

interface ExtractProvider {
  extract(urls: string[], format: "markdown" | "text"): Promise<ExtractProviderResult>
}

interface ScreenshotProvider {
  capture(params: ScreenshotParams): Promise<Buffer>
}

// Tavily implements both SearchProvider and ExtractProvider.
// Screenshot is a separate provider (SE-3).
```

Three separate interfaces — search, extract, screenshot are independent concerns with different upstream providers. Tavily happens to cover the first two.

## Dependency Direction

```
index.ts → service.ts → tavily.ts (implements provider.ts interfaces)
                       ↘ provider.ts (SearchProvider + ExtractProvider + ProviderError)
api.ts ← (types only, imported by index + service)
```

No db.ts. No ownership checks. Stateless.

## Phases

### Phase 1: Web search + news search + extract (SE-1)

All three are Tavily-backed, so build together:

Files to create:
- `packages/search/package.json`
- `packages/search/tsconfig.json`
- `packages/search/vitest.config.ts`
- `packages/search/src/index.ts` — Hono app, routes, x402 middleware
- `packages/search/src/api.ts` — Request/response types, error envelope
- `packages/search/src/service.ts` — Validation, provider dispatch
- `packages/search/src/provider.ts` — SearchProvider + ExtractProvider interfaces, ProviderError
- `packages/search/src/tavily.ts` — Tavily API client (implements both interfaces)
- `packages/search/test/search.test.ts` — Unit tests (mocked Tavily responses)

### Phase 2: Screenshot capture (SE-2)

- Choose screenshot provider (ScreenshotOne or Firecrawl)
- Add `packages/search/src/screenshotone.ts` (or equivalent)
- Add screenshot route to `index.ts`
- Add screenshot types to `api.ts`
- Add screenshot service function to `service.ts`
- Add screenshot tests

### Phase 3: Integration test + landing page rename (SE-3)

- Add search.sh to `scripts/integration-test.ts` (x402 end-to-end on Base Sepolia)
- Rename `site/seek/` → `site/search/`
- Update landing page content (pricing, API endpoints, provider info)
- Update `site/serve.py` routes
- Update `site/index.html` primitive card (seek → search)

### Phase 4: Usage analytics + caching (SE-4, future)

- Add `db.ts` with SQLite: `queries` table (wallet, query hash, timestamp, provider, credits_used)
- Per-wallet usage tracking
- Result caching (dedup identical queries within configurable TTL)
- In-memory rate limiting per wallet (defense against runaway agents)

## Key Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Package name | `@agentstack/search` | "search" is clearer than "seek" |
| Subdomain | `search.prim.sh` | Agent-facing URL |
| Launch provider | Tavily | Only major search API with TOS-compliant Customer Application carve-out |
| POST vs GET for search | POST | Avoids query-string length limits, matches Tavily API |
| Combined Phase 1 | search + news + extract together | All Tavily-backed, minimal incremental cost |
| Screenshot in Phase 1? | No — defer to SE-2 | Different provider, independent concern |
| SQLite? | No (Phase 1) | Stateless proxy — no owned resources |
| Provider interface day 1? | Yes | Cheap to do right, follows spawn.sh pattern |

## Env Vars

```
TAVILY_API_KEY   — Tavily API key (required)
PRIM_PAY_TO      — Payment recipient wallet
PRIM_NETWORK     — Network config (Base mainnet or Sepolia)
```

## Before Closing

- [ ] Run `pnpm --filter @agentstack/search check` (lint + typecheck + tests pass)
- [ ] Verify `query` param is required and returns 400 when missing
- [ ] Verify `urls` param is required for extract and returns 400 when missing
- [ ] Verify upstream Tavily errors are wrapped as `provider_error` with our error envelope, not leaked raw
- [ ] Verify Tavily 429 is mapped to `rate_limited` with `Retry-After` header
- [ ] Verify screenshot returns binary response with correct Content-Type, not JSON wrapper (SE-2)
- [ ] Verify landing page URLs updated from seek → search (SE-3)
- [ ] For every error response, verify both the HTTP status code and the error code are correct
