import { ProviderError } from "./provider.ts";
import type {
  SearchProvider,
  ExtractProvider,
  SearchProviderConfig,
  SearchProviderParams,
  SearchProviderResult,
  ExtractProviderResult,
} from "./provider.ts";
import type { ProviderHealth } from "@primsh/x402-middleware";

const TAVILY_BASE_URL = "https://api.tavily.com";

interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  published_date?: string;
}

interface TavilySearchResponse {
  query: string;
  answer?: string;
  results: TavilySearchResult[];
  response_time: number;
}

interface TavilyExtractResult {
  url: string;
  raw_content: string;
  images?: string[];
}

interface TavilyExtractResponse {
  results: TavilyExtractResult[];
  failed_results: Array<{ url: string; error: string }>;
  response_time: number;
}

export class TavilyClient implements SearchProvider, ExtractProvider {
  readonly name = "tavily";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async init(config: SearchProviderConfig): Promise<void> {
    if (!config.apiKey?.trim()) {
      throw new ProviderError("TAVILY_API_KEY is not configured", "provider_error");
    }
    this.apiKey = config.apiKey;
  }

  async healthCheck(): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      await this._search({ query: "ping", max_results: 1 });
      return { ok: true, latency_ms: Date.now() - start };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, latency_ms: Date.now() - start, message };
    }
  }

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const resp = await fetch(`${TAVILY_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (resp.status === 429) {
      const retryAfter = Number(resp.headers.get("Retry-After") ?? "60");
      throw new ProviderError("Tavily rate limit exceeded", "rate_limited", retryAfter);
    }

    if (!resp.ok) {
      let message = `Tavily API error: ${resp.status}`;
      try {
        const data = (await resp.json()) as { detail?: string; message?: string };
        message = data.detail ?? data.message ?? message;
      } catch {
        /* ignore parse errors */
      }
      throw new ProviderError(message, "provider_error");
    }

    return resp.json() as Promise<T>;
  }

  private async _search(
    params: SearchProviderParams,
    topic?: "news",
  ): Promise<SearchProviderResult> {
    const body: Record<string, unknown> = { query: params.query };
    if (topic) body.topic = topic;
    if (params.max_results !== undefined) body.max_results = params.max_results;
    if (params.search_depth !== undefined) body.search_depth = params.search_depth;
    if (params.country !== undefined) body.country = params.country;
    if (params.time_range !== undefined) body.time_range = params.time_range;
    if (params.include_answer !== undefined) body.include_answer = params.include_answer;
    if (params.include_domains !== undefined) body.include_domains = params.include_domains;
    if (params.exclude_domains !== undefined) body.exclude_domains = params.exclude_domains;

    const data = await this.post<TavilySearchResponse>("/search", body);

    return {
      query: data.query,
      answer: data.answer,
      results: data.results.map((r) => ({
        title: r.title,
        url: r.url,
        content: r.content,
        score: r.score,
        published: r.published_date,
      })),
      response_time: data.response_time,
    };
  }

  async search(params: SearchProviderParams): Promise<SearchProviderResult> {
    return this._search(params);
  }

  async searchNews(params: SearchProviderParams): Promise<SearchProviderResult> {
    return this._search(params, "news");
  }

  async extract(urls: string[], format: "markdown" | "text"): Promise<ExtractProviderResult> {
    const data = await this.post<TavilyExtractResponse>("/extract", { urls, format });

    return {
      results: data.results.map((r) => ({
        url: r.url,
        content: r.raw_content,
        images: r.images?.length ? r.images : undefined,
      })),
      failed: (data.failed_results ?? []).map((f) => ({
        url: f.url,
        error: f.error,
      })),
      response_time: data.response_time,
    };
  }
}
