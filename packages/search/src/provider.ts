// ─── Provider param/result types ─────────────────────────────────────────────

export interface SearchProviderParams {
  query: string;
  max_results?: number;
  search_depth?: "basic" | "advanced";
  country?: string;
  time_range?: "day" | "week" | "month" | "year";
  include_answer?: boolean;
  include_domains?: string[];
  exclude_domains?: string[];
}

export interface SearchProviderResult {
  query: string;
  answer?: string;
  results: Array<{
    title: string;
    url: string;
    content: string;
    score: number;
    published?: string;
  }>;
  response_time: number;
}

export interface ExtractProviderResult {
  results: Array<{
    url: string;
    content: string;
    images?: string[];
  }>;
  failed: Array<{
    url: string;
    error: string;
  }>;
  response_time: number;
}

// ─── Provider interfaces ──────────────────────────────────────────────────────

export interface SearchProvider {
  search(params: SearchProviderParams): Promise<SearchProviderResult>;
  searchNews(params: SearchProviderParams): Promise<SearchProviderResult>;
}

export interface ExtractProvider {
  extract(urls: string[], format: "markdown" | "text"): Promise<ExtractProviderResult>;
}

// ─── Error ────────────────────────────────────────────────────────────────────

export class ProviderError extends Error {
  code: "provider_error" | "rate_limited";
  retryAfter?: number;

  constructor(
    message: string,
    code: "provider_error" | "rate_limited" = "provider_error",
    retryAfter?: number,
  ) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.retryAfter = retryAfter;
  }
}
