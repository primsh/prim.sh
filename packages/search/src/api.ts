// ─── Search ──────────────────────────────────────────────────────────────────

export interface SearchRequest {
  query: string;
  max_results?: number;
  search_depth?: "basic" | "advanced";
  country?: string;
  time_range?: "day" | "week" | "month" | "year";
  include_answer?: boolean;
  include_domains?: string[];
  exclude_domains?: string[];
}

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  published?: string;
}

export interface SearchResponse {
  query: string;
  answer?: string;
  results: SearchResult[];
  response_time: number;
}

// ─── Extract ─────────────────────────────────────────────────────────────────

export interface ExtractRequest {
  urls: string | string[];
  format?: "markdown" | "text";
}

export interface ExtractResult {
  url: string;
  content: string;
  images?: string[];
}

export interface FailedExtraction {
  url: string;
  error: string;
}

export interface ExtractResponse {
  results: ExtractResult[];
  failed: FailedExtraction[];
  response_time: number;
}

// ─── Error ───────────────────────────────────────────────────────────────────

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}
