---
name: search
version: 1.0.0
primitive: search.prim.sh
requires: [wallet]
tools:
  - search_search_web
  - search_search_news
  - search_extract_url
---

# search.prim.sh

Web search for agents. Search the web, search for news, and extract content from URLs. Payment via x402 (USDC on Base).

## When to use

Use search when you need to:
- Find current information not in your training data
- Get recent news on a topic
- Extract full readable content from a specific URL found in search results
- Research a topic from multiple sources and cache results

### search_search_web vs search_search_news

- `search_search_web` — General web search. Best for: documentation, technical answers, product info, anything that isn't time-sensitive.
- `search_search_news` — News-biased search. Results are ordered by recency, biased toward news publishers. Best for: current events, announcements, recent developments (use with `time_range`).

Use `search_extract_url` after getting URLs from either search tool to fetch full page content rather than just snippets.

## Prerequisites

- Registered wallet (`wallet_register`)
- Wallet funded with USDC (`faucet_usdc` on testnet)
- Wallet on access allowlist (private beta)

## Common workflows

### 1. Quick answer with AI summary

```
1. search_search_web
   - query: "Base L2 gas prices"
   - max_results: 5
   - include_answer: true
   → returns {answer: "...", results: [...]}
   → use answer field for a quick summary without reading all results
```

### 2. News search for recent coverage

```
1. search_search_news
   - query: "Coinbase Base blockchain"
   - max_results: 10
   - time_range: "week"
   → results ordered by recency, biased toward news sources
```

### 3. Deep-dive on a URL from search results

```
1. search_search_web
   - query: "x402 payment protocol spec"
   - max_results: 5
   → pick relevant URLs from results[].url

2. search_extract_url
   - urls: ["https://docs.example.com/x402"]
   - format: "markdown"
   → returns full page content as markdown
   → check failed[] for any URLs that couldn't be extracted
```

### 4. Multi-URL extraction in one call

```
1. search_extract_url
   - urls: ["https://url1.com", "https://url2.com", "https://url3.com"]
   - format: "text"
   → returns results[] (successful) and failed[] (could not extract)
   → request succeeds as long as at least one URL was attempted
```

### 5. Domain-filtered search

```
1. search_search_web
   - query: "USDC documentation"
   - include_domains: ["docs.base.org", "coinbase.com"]
   → only returns results from those domains

2. search_search_web
   - query: "ERC-20 token tutorial"
   - exclude_domains: ["reddit.com", "medium.com"]
   → excludes those domains from results
```

### 6. Time-range filtered search

```
1. search_search_web
   - query: "Base L2 updates"
   - time_range: "day"     # "day" | "week" | "month" | "year"
   → only results from the past day
```

## Error handling

- `invalid_request` → `query` is missing or `urls` is missing. These are required fields. For `search_extract_url`, `urls` must be a string or an array of strings.
- `rate_limited` (429) → Too many requests. Response includes `Retry-After` header (seconds). Wait and retry.
- `provider_error` (502) → Upstream search provider is unavailable. Retry after a brief wait. If persistent, try a simpler query or fewer results.
- `payment_required` (402) → x402 payment not completed. The MCP server handles this automatically.

For `search_extract_url`: individual URL failures appear in `failed[]`, not as HTTP errors. The overall request returns 200 even if some URLs fail. Always check `failed[]` after extraction.

## Gotchas

- **`failed[]` is not an error.** `search_extract_url` always returns HTTP 200 as long as the request was valid. Extraction failures (404, paywalled pages, timeouts) appear in `results[].failed[]`. Always check this array.
- **`answer` is only present when `include_answer: true`.** The field is absent (not null) when not requested. This costs more upstream compute — only enable it when you need a summary.
- **`search_depth: "advanced"` costs more.** Use `"basic"` (default) for most queries. Use `"advanced"` only when basic results are insufficient — it queries more sources.
- **`max_results` range is 1–20.** Default is 10. You pay per-search, not per-result, so there's no cost savings to reducing results.
- **`score` is a relevance float 0–1.** Results are already sorted by score descending. Use score to filter low-relevance results (e.g. discard anything below 0.5).
- **`published` may be absent.** Not all pages have parseable publication dates. Handle missing `published` field gracefully.
- **URLs from search results may go stale.** For important research, extract content immediately after getting URLs rather than storing URLs for later extraction.
- **`format: "markdown"` (default) is better for LLM consumption.** Use `"text"` only if you need raw text without markdown formatting.

## Related primitives

- **store** — Cache search results and extracted content to avoid re-paying for the same query.
- **wallet** — Required. Search costs $0.01/search, $0.005/extract.
