/**
 * SE-1 search.sh tests: web search, news search, and URL extraction via Tavily.
 * Service functions accept injectable providers so tests avoid global fetch mocking.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { ProviderError } from "../src/provider.ts";
import { searchWeb, searchNews, extractUrls } from "../src/service.ts";
import type { SearchProvider, ExtractProvider, SearchProviderParams, SearchProviderResult, ExtractProviderResult } from "../src/provider.ts";

// ─── Mock providers ───────────────────────────────────────────────────────────

function makeSearchResult(overrides: Partial<SearchProviderResult["results"][0]> = {}) {
  return {
    title: "Test Result",
    url: "https://example.com/result",
    content: "Some relevant content",
    score: 0.92,
    published: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeSearchResponse(query: string, overrides: Partial<SearchProviderResult> = {}): SearchProviderResult {
  return {
    query,
    answer: "A short LLM-generated answer",
    results: [makeSearchResult()],
    response_time: 1.23,
    ...overrides,
  };
}

class MockSearchProvider implements SearchProvider {
  readonly name = "mock-search";
  capturedParams: SearchProviderParams[] = [];
  capturedTopics: ("news" | undefined)[] = [];

  async init(_config: { apiKey: string }): Promise<void> {}
  async healthCheck() { return { ok: true, latency_ms: 0 }; }

  async search(params: SearchProviderParams): Promise<SearchProviderResult> {
    this.capturedParams.push(params);
    this.capturedTopics.push(undefined);
    return makeSearchResponse(params.query);
  }

  async searchNews(params: SearchProviderParams): Promise<SearchProviderResult> {
    this.capturedParams.push(params);
    this.capturedTopics.push("news");
    return makeSearchResponse(params.query, {
      results: [makeSearchResult({ published: "2024-06-01T12:00:00Z" })],
    });
  }
}

class RateLimitedSearchProvider implements SearchProvider {
  readonly name = "rate-limited-search";
  async init(_config: { apiKey: string }): Promise<void> {}
  async healthCheck() { return { ok: false, latency_ms: 0, message: "rate limited" }; }
  async search(_params: SearchProviderParams): Promise<SearchProviderResult> {
    throw new ProviderError("Rate limit exceeded", "rate_limited", 30);
  }
  async searchNews(_params: SearchProviderParams): Promise<SearchProviderResult> {
    throw new ProviderError("Rate limit exceeded", "rate_limited", 30);
  }
}

class ErrorSearchProvider implements SearchProvider {
  readonly name = "error-search";
  async init(_config: { apiKey: string }): Promise<void> {}
  async healthCheck() { return { ok: false, latency_ms: 0, message: "provider error" }; }
  async search(_params: SearchProviderParams): Promise<SearchProviderResult> {
    throw new ProviderError("Upstream error", "provider_error");
  }
  async searchNews(_params: SearchProviderParams): Promise<SearchProviderResult> {
    throw new ProviderError("Upstream error", "provider_error");
  }
}

class MockExtractProvider implements ExtractProvider {
  readonly name = "mock-extract";
  capturedUrls: string[][] = [];

  async init(_config: { apiKey: string }): Promise<void> {}
  async healthCheck() { return { ok: true, latency_ms: 0 }; }

  async extract(urls: string[], _format: "markdown" | "text"): Promise<ExtractProviderResult> {
    this.capturedUrls.push(urls);
    return {
      results: urls.map((u) => ({ url: u, content: `# Content for ${u}` })),
      failed: [],
      response_time: 0.5,
    };
  }
}

class FailedExtractProvider implements ExtractProvider {
  readonly name = "failed-extract";
  async init(_config: { apiKey: string }): Promise<void> {}
  async healthCheck() { return { ok: false, latency_ms: 0, message: "failed" }; }
  async extract(urls: string[], _format: "markdown" | "text"): Promise<ExtractProviderResult> {
    return {
      results: [],
      failed: urls.map((u) => ({ url: u, error: "Connection refused" })),
      response_time: 0.1,
    };
  }
}

class RateLimitedExtractProvider implements ExtractProvider {
  readonly name = "rate-limited-extract";
  async init(_config: { apiKey: string }): Promise<void> {}
  async healthCheck() { return { ok: false, latency_ms: 0, message: "rate limited" }; }
  async extract(_urls: string[], _format: "markdown" | "text"): Promise<ExtractProviderResult> {
    throw new ProviderError("Rate limit exceeded", "rate_limited", 45);
  }
}

class ErrorExtractProvider implements ExtractProvider {
  readonly name = "error-extract";
  async init(_config: { apiKey: string }): Promise<void> {}
  async healthCheck() { return { ok: false, latency_ms: 0, message: "provider error" }; }
  async extract(_urls: string[], _format: "markdown" | "text"): Promise<ExtractProviderResult> {
    throw new ProviderError("Upstream error", "provider_error");
  }
}

// ─── searchWeb ────────────────────────────────────────────────────────────────

describe("searchWeb", () => {
  beforeEach(() => {});

  it("returns results for a valid query", async () => {
    const provider = new MockSearchProvider();
    const result = await searchWeb({ query: "latest AI news" }, provider);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.query).toBe("latest AI news");
    expect(result.data.results).toHaveLength(1);
    expect(result.data.results[0].score).toBe(0.92);
    expect(result.data.results[0].published).toBe("2024-01-01T00:00:00Z");
  });

  it("includes LLM answer when present", async () => {
    const provider = new MockSearchProvider();
    const result = await searchWeb({ query: "test", include_answer: true }, provider);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.answer).toBe("A short LLM-generated answer");
  });

  it("passes all optional params to provider", async () => {
    const provider = new MockSearchProvider();
    await searchWeb(
      {
        query: "test",
        search_depth: "advanced",
        country: "us",
        time_range: "week",
        include_domains: ["nytimes.com"],
        exclude_domains: ["spam.com"],
      },
      provider,
    );
    const captured = provider.capturedParams[0];
    expect(captured.search_depth).toBe("advanced");
    expect(captured.country).toBe("us");
    expect(captured.time_range).toBe("week");
    expect(captured.include_domains).toEqual(["nytimes.com"]);
    expect(captured.exclude_domains).toEqual(["spam.com"]);
  });

  it("returns 400 when query is empty", async () => {
    const result = await searchWeb({ query: "" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect(result.code).toBe("invalid_request");
  });

  it("returns 400 when query is whitespace only", async () => {
    const result = await searchWeb({ query: "   " });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect(result.code).toBe("invalid_request");
  });

  it("clamps max_results to 20", async () => {
    const provider = new MockSearchProvider();
    await searchWeb({ query: "test", max_results: 999 }, provider);
    expect(provider.capturedParams[0].max_results).toBe(20);
  });

  it("clamps max_results minimum to 1", async () => {
    const provider = new MockSearchProvider();
    await searchWeb({ query: "test", max_results: 0 }, provider);
    expect(provider.capturedParams[0].max_results).toBe(1);
  });

  it("defaults max_results to 5 when omitted", async () => {
    const provider = new MockSearchProvider();
    await searchWeb({ query: "test" }, provider);
    expect(provider.capturedParams[0].max_results).toBe(5);
  });

  it("returns 502 provider_error when TAVILY_API_KEY is missing", async () => {
    const orig = process.env.TAVILY_API_KEY;
    process.env.TAVILY_API_KEY = undefined;
    const result = await searchWeb({ query: "test" }); // no injected provider
    process.env.TAVILY_API_KEY = orig;
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("provider_error");
    expect(result.status).toBe(502);
  });

  it("returns 429 rate_limited when provider throws rate_limited", async () => {
    const result = await searchWeb({ query: "test" }, new RateLimitedSearchProvider());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("rate_limited");
    expect(result.status).toBe(429);
    expect(result.retryAfter).toBe(30);
  });

  it("returns 502 provider_error when provider throws provider_error", async () => {
    const result = await searchWeb({ query: "test" }, new ErrorSearchProvider());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("provider_error");
    expect(result.status).toBe(502);
  });
});

// ─── searchNews ───────────────────────────────────────────────────────────────

describe("searchNews", () => {
  beforeEach(() => {});

  it("returns results for a valid query", async () => {
    const provider = new MockSearchProvider();
    const result = await searchNews({ query: "breaking news" }, provider);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.query).toBe("breaking news");
    expect(result.data.results).toHaveLength(1);
  });

  it("calls searchNews on provider (not search)", async () => {
    const provider = new MockSearchProvider();
    await searchNews({ query: "elections" }, provider);
    // capturedTopics[0] is "news" because searchNews was called
    expect(provider.capturedTopics[0]).toBe("news");
  });

  it("regular search does NOT call searchNews on provider", async () => {
    const provider = new MockSearchProvider();
    await searchWeb({ query: "elections" }, provider);
    expect(provider.capturedTopics[0]).toBeUndefined();
  });

  it("returns 400 when query is missing", async () => {
    const result = await searchNews({ query: "" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect(result.code).toBe("invalid_request");
  });

  it("returns 502 provider_error when TAVILY_API_KEY is missing", async () => {
    const orig = process.env.TAVILY_API_KEY;
    process.env.TAVILY_API_KEY = undefined;
    const result = await searchNews({ query: "test" });
    process.env.TAVILY_API_KEY = orig;
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("provider_error");
  });

  it("returns 429 rate_limited when provider throws rate_limited", async () => {
    const result = await searchNews({ query: "test" }, new RateLimitedSearchProvider());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("rate_limited");
    expect(result.retryAfter).toBe(30);
  });
});

// ─── extractUrls ──────────────────────────────────────────────────────────────

describe("extractUrls", () => {
  beforeEach(() => {});

  it("extracts content from a single URL string", async () => {
    const provider = new MockExtractProvider();
    const result = await extractUrls({ urls: "https://example.com" }, provider);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.results).toHaveLength(1);
    expect(result.data.results[0].url).toBe("https://example.com");
    expect(result.data.results[0].content).toContain("Content for https://example.com");
    expect(result.data.failed).toHaveLength(0);
  });

  it("extracts content from an array of URLs", async () => {
    const provider = new MockExtractProvider();
    const result = await extractUrls({ urls: ["https://a.com", "https://b.com", "https://c.com"] }, provider);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.results).toHaveLength(3);
  });

  it("normalizes single URL string into array for provider", async () => {
    const provider = new MockExtractProvider();
    await extractUrls({ urls: "https://single.com" }, provider);
    expect(provider.capturedUrls[0]).toEqual(["https://single.com"]);
  });

  it("passes all URLs to provider", async () => {
    const provider = new MockExtractProvider();
    await extractUrls({ urls: ["https://x.com", "https://y.com"] }, provider);
    expect(provider.capturedUrls[0]).toEqual(["https://x.com", "https://y.com"]);
  });

  it("returns 400 when urls is missing", async () => {
    const result = await extractUrls({} as { urls: string });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect(result.code).toBe("invalid_request");
  });

  it("returns 400 when urls is an empty array", async () => {
    const result = await extractUrls({ urls: [] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect(result.code).toBe("invalid_request");
  });

  it("returns 400 when urls exceeds 20", async () => {
    const urls = Array.from({ length: 21 }, (_, i) => `https://example.com/${i}`);
    const result = await extractUrls({ urls });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect(result.code).toBe("invalid_request");
  });

  it("accepts exactly 20 URLs", async () => {
    const provider = new MockExtractProvider();
    const urls = Array.from({ length: 20 }, (_, i) => `https://example.com/${i}`);
    const result = await extractUrls({ urls }, provider);
    expect(result.ok).toBe(true);
  });

  it("returns 400 for non-URL strings", async () => {
    const result = await extractUrls({ urls: "not a url" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect(result.code).toBe("invalid_request");
  });

  it("returns 400 for non-http(s) URL schemes", async () => {
    const result = await extractUrls({ urls: "ftp://files.example.com" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect(result.code).toBe("invalid_request");
  });

  it("returns 400 for empty string in urls array", async () => {
    const result = await extractUrls({ urls: ["https://example.com", ""] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect(result.code).toBe("invalid_request");
  });

  it("returns 400 for mixed valid and invalid URLs", async () => {
    const result = await extractUrls({ urls: ["https://ok.com", "not-a-url"] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("invalid_request");
    expect(result.message).toContain("not-a-url");
  });

  it("includes failed extractions in response", async () => {
    const provider = new FailedExtractProvider();
    const result = await extractUrls({ urls: "https://broken.com" }, provider);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.failed).toHaveLength(1);
    expect(result.data.failed[0].url).toBe("https://broken.com");
    expect(result.data.failed[0].error).toBe("Connection refused");
  });

  it("returns 502 provider_error when TAVILY_API_KEY is missing", async () => {
    const orig = process.env.TAVILY_API_KEY;
    process.env.TAVILY_API_KEY = undefined;
    const result = await extractUrls({ urls: "https://example.com" });
    process.env.TAVILY_API_KEY = orig;
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("provider_error");
    expect(result.status).toBe(502);
  });

  it("returns 429 rate_limited when provider throws rate_limited", async () => {
    const result = await extractUrls({ urls: "https://example.com" }, new RateLimitedExtractProvider());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("rate_limited");
    expect(result.retryAfter).toBe(45);
  });

  it("returns 502 provider_error when provider throws provider_error", async () => {
    const result = await extractUrls({ urls: "https://example.com" }, new ErrorExtractProvider());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("provider_error");
    expect(result.status).toBe(502);
  });
});
