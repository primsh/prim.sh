// SPDX-License-Identifier: Apache-2.0
/**
 * search.sh API contract — Zod schemas, inferred types, and error envelope.
 */

import { z } from "zod";

// ─── Search ──────────────────────────────────────────────────────────────────

export const SearchRequestSchema = z.object({
  query: z.string().describe("Search query string."),
  max_results: z
    .number()
    .optional()
    .describe("Maximum number of results to return. 1-20, default 10."),
  search_depth: z
    .enum(["basic", "advanced"])
    .optional()
    .describe('Search depth. "basic" | "advanced", default "basic".'),
  country: z
    .string()
    .optional()
    .describe('Two-letter ISO 3166-1 country code to bias results (e.g. "US").'),
  time_range: z
    .enum(["day", "week", "month", "year"])
    .optional()
    .describe('Restrict results by recency. "day" | "week" | "month" | "year".'),
  include_answer: z
    .boolean()
    .optional()
    .describe("Include AI-generated answer summarizing top results. Default false."),
  include_domains: z
    .array(z.string())
    .optional()
    .describe('Restrict results to these domains only (e.g. ["docs.base.org"]).'),
  exclude_domains: z
    .array(z.string())
    .optional()
    .describe('Exclude results from these domains (e.g. ["reddit.com"]).'),
});
export type SearchRequest = z.infer<typeof SearchRequestSchema>;

export const SearchResultSchema = z.object({
  title: z.string().describe("Page title."),
  url: z.string().describe("Page URL."),
  content: z.string().describe("Snippet text extracted from the page."),
  score: z.number().describe("Relevance score (0-1)."),
  published: z.string().optional().describe("Publication date (ISO 8601). Only present if available."),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

export const SearchResponseSchema = z.object({
  query: z.string().describe("Search query echoed back."),
  answer: z
    .string()
    .optional()
    .describe(
      "AI-generated answer summarizing top results. Only present if include_answer was true.",
    ),
  results: z.array(SearchResultSchema).describe("Ranked search results."),
  response_time: z
    .number()
    .describe("Time taken to complete the search in milliseconds."),
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

// ─── Extract ─────────────────────────────────────────────────────────────────

export const ExtractRequestSchema = z.object({
  urls: z
    .union([z.string(), z.array(z.string())])
    .describe("URL string or array of URLs to extract content from."),
  format: z
    .enum(["markdown", "text"])
    .optional()
    .describe('Output format. "markdown" | "text", default "markdown".'),
});
export type ExtractRequest = z.infer<typeof ExtractRequestSchema>;

export const ExtractResultSchema = z.object({
  url: z.string().describe("The URL that was extracted."),
  content: z.string().describe("Extracted content in the requested format."),
  images: z.array(z.string()).optional().describe("Image URLs found on the page. May be empty."),
});
export type ExtractResult = z.infer<typeof ExtractResultSchema>;

export const FailedExtractionSchema = z.object({
  url: z.string().describe("The URL that failed extraction."),
  error: z.string().describe('Human-readable reason (e.g. "HTTP 404: page not found").'),
});
export type FailedExtraction = z.infer<typeof FailedExtractionSchema>;

export const ExtractResponseSchema = z.object({
  results: z.array(ExtractResultSchema).describe("Successfully extracted pages."),
  failed: z.array(FailedExtractionSchema).describe("Pages that could not be extracted."),
  response_time: z
    .number()
    .describe("Time taken to complete the extraction in milliseconds."),
});
export type ExtractResponse = z.infer<typeof ExtractResponseSchema>;

// ─── Error ───────────────────────────────────────────────────────────────────

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string().describe("Machine-readable error code."),
    message: z.string().describe("Human-readable error message."),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const ERROR_CODES = ["invalid_request", "rate_limited", "provider_error"] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
