import { ProviderError } from "./provider.ts";
import { TavilyClient } from "./tavily.ts";
import type { SearchRequest, SearchResponse, ExtractRequest, ExtractResponse } from "./api.ts";
import type { SearchProvider, ExtractProvider } from "./provider.ts";

type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string; retryAfter?: number };

function defaultSearchProvider(): SearchProvider {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new ProviderError("TAVILY_API_KEY is not configured", "provider_error");
  return new TavilyClient(key);
}

function defaultExtractProvider(): ExtractProvider {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new ProviderError("TAVILY_API_KEY is not configured", "provider_error");
  return new TavilyClient(key);
}

function handleProviderError(err: unknown): ServiceResult<never> {
  if (err instanceof ProviderError) {
    const status = err.code === "rate_limited" ? 429 : 502;
    return { ok: false, status, code: err.code, message: err.message, retryAfter: err.retryAfter };
  }
  throw err;
}

export async function searchWeb(
  request: SearchRequest,
  provider?: SearchProvider,
): Promise<ServiceResult<SearchResponse>> {
  if (!request.query?.trim()) {
    return { ok: false, status: 400, code: "invalid_request", message: "query is required" };
  }

  const maxResults = Math.max(1, Math.min(request.max_results ?? 5, 20));

  try {
    const p = provider ?? defaultSearchProvider();
    const result = await p.search({ ...request, max_results: maxResults });
    return { ok: true, data: result };
  } catch (err) {
    return handleProviderError(err);
  }
}

export async function searchNews(
  request: SearchRequest,
  provider?: SearchProvider,
): Promise<ServiceResult<SearchResponse>> {
  if (!request.query?.trim()) {
    return { ok: false, status: 400, code: "invalid_request", message: "query is required" };
  }

  const maxResults = Math.max(1, Math.min(request.max_results ?? 5, 20));

  try {
    const p = provider ?? defaultSearchProvider();
    const result = await p.searchNews({ ...request, max_results: maxResults });
    return { ok: true, data: result };
  } catch (err) {
    return handleProviderError(err);
  }
}

export async function extractUrls(
  request: ExtractRequest,
  provider?: ExtractProvider,
): Promise<ServiceResult<ExtractResponse>> {
  if (!request.urls) {
    return { ok: false, status: 400, code: "invalid_request", message: "urls is required" };
  }

  const urls = Array.isArray(request.urls) ? request.urls : [request.urls];

  if (urls.length === 0) {
    return { ok: false, status: 400, code: "invalid_request", message: "urls must not be empty" };
  }

  if (urls.length > 20) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "urls must not exceed 20",
    };
  }

  const format = request.format ?? "markdown";

  try {
    const p = provider ?? defaultExtractProvider();
    const result = await p.extract(urls, format);
    return { ok: true, data: result };
  } catch (err) {
    return handleProviderError(err);
  }
}
