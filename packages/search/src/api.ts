// SPDX-License-Identifier: Apache-2.0
// ─── Search ──────────────────────────────────────────────────────────────────

export interface SearchRequest {
  /** Search query string. */
  query: string;
  /** Maximum number of results to return. 1-20, default 10. */
  max_results?: number;
  /** Search depth. "basic" | "advanced", default "basic". */
  search_depth?: "basic" | "advanced";
  /** Two-letter ISO 3166-1 country code to bias results (e.g. "US"). */
  country?: string;
  /** Restrict results by recency. "day" | "week" | "month" | "year". */
  time_range?: "day" | "week" | "month" | "year";
  /** Include AI-generated answer summarizing top results. Default false. */
  include_answer?: boolean;
  /** Restrict results to these domains only (e.g. ["docs.base.org"]). */
  include_domains?: string[];
  /** Exclude results from these domains (e.g. ["reddit.com"]). */
  exclude_domains?: string[];
}

export interface SearchResult {
  /** Page title. */
  title: string;
  /** Page URL. */
  url: string;
  /** Snippet text extracted from the page. */
  content: string;
  /** Relevance score (0-1). */
  score: number;
  /** Publication date (ISO 8601). Only present if available. */
  published?: string;
}

export interface SearchResponse {
  /** Search query echoed back. */
  query: string;
  /** AI-generated answer summarizing top results. Only present if include_answer was true. */
  answer?: string;
  /** Ranked search results. */
  results: SearchResult[];
  /** Time taken to complete the search in milliseconds. */
  response_time: number;
}

// ─── Extract ─────────────────────────────────────────────────────────────────

export interface ExtractRequest {
  /** URL string or array of URLs to extract content from. */
  urls: string | string[];
  /** Output format. "markdown" | "text", default "markdown". */
  format?: "markdown" | "text";
}

export interface ExtractResult {
  /** The URL that was extracted. */
  url: string;
  /** Extracted content in the requested format. */
  content: string;
  /** Image URLs found on the page. May be empty. */
  images?: string[];
}

export interface FailedExtraction {
  /** The URL that failed extraction. */
  url: string;
  /** Human-readable reason (e.g. "HTTP 404: page not found"). */
  error: string;
}

export interface ExtractResponse {
  /** Successfully extracted pages. */
  results: ExtractResult[];
  /** Pages that could not be extracted. */
  failed: FailedExtraction[];
  /** Time taken to complete the extraction in milliseconds. */
  response_time: number;
}

// ─── Error ───────────────────────────────────────────────────────────────────

export interface ApiError {
  error: {
    /** Machine-readable error code. */
    code: string;
    /** Human-readable error message. */
    message: string;
  };
}

export const ERROR_CODES = ["invalid_request", "rate_limited", "provider_error"] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
