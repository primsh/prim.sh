import { ProviderError } from "./provider.ts";
import type { SearchRequest, SearchResponse, ExtractRequest, ExtractResponse } from "./api.ts";
import type { SearchProvider, ExtractProvider } from "./provider.ts";
import type { ProviderRegistry } from "@primsh/x402-middleware";

type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string; retryAfter?: number };

// ─── Registry injection ───────────────────────────────────────────────────────
//
// index.ts calls setRegistry() on startup to wire the provider registry.
// Service functions use getProvider() which delegates to the registry.
// For tests, the optional `provider` parameter takes precedence — no registry needed.

let _registry: ProviderRegistry<SearchProvider & ExtractProvider> | undefined;
let _extractRegistry: ProviderRegistry<ExtractProvider> | undefined;

export function setRegistry(
  registry: ProviderRegistry<SearchProvider & ExtractProvider>,
): void {
  _registry = registry;
}

export function setExtractRegistry(registry: ProviderRegistry<ExtractProvider>): void {
  _extractRegistry = registry;
}

/**
 * Reset injected registries. Used in tests to restore a clean state between
 * test cases. In production this is never called.
 */
export function resetClient(): void {
  _registry = undefined;
  _extractRegistry = undefined;
}

async function getSearchProvider(override?: SearchProvider): Promise<SearchProvider> {
  if (override) return override;
  if (_registry) return _registry.get();
  throw new ProviderError(
    "No search provider configured. Call setRegistry() before using service functions.",
    "provider_error",
  );
}

async function getExtractProvider(override?: ExtractProvider): Promise<ExtractProvider> {
  if (override) return override;
  if (_extractRegistry) return _extractRegistry.get();
  if (_registry) return _registry.get();
  throw new ProviderError(
    "No extract provider configured. Call setRegistry() before using service functions.",
    "provider_error",
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function handleProviderError(err: unknown): ServiceResult<never> {
  if (err instanceof ProviderError) {
    const status = err.code === "rate_limited" ? 429 : 502;
    return { ok: false, status, code: err.code, message: err.message, retryAfter: err.retryAfter };
  }
  throw err;
}

function isValidUrl(url: string): boolean {
  if (!url.trim()) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function searchWeb(
  request: SearchRequest,
  provider?: SearchProvider,
): Promise<ServiceResult<SearchResponse>> {
  if (!request.query?.trim()) {
    return { ok: false, status: 400, code: "invalid_request", message: "query is required" };
  }

  const maxResults = Math.max(1, Math.min(request.max_results ?? 5, 20));

  try {
    const p = await getSearchProvider(provider);
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
    const p = await getSearchProvider(provider);
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
    return { ok: false, status: 400, code: "invalid_request", message: "urls must not exceed 20" };
  }

  const invalid = urls.filter((u) => !isValidUrl(u));
  if (invalid.length > 0) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: `Invalid URLs: ${invalid.join(", ")}`,
    };
  }

  const format = request.format ?? "markdown";

  try {
    const p = await getExtractProvider(provider);
    const result = await p.extract(urls, format);
    return { ok: true, data: result };
  } catch (err) {
    return handleProviderError(err);
  }
}
