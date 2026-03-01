// SPDX-License-Identifier: Apache-2.0
import type {
  ChatRequest,
  ChatResponse,
  EmbedRequest,
  EmbedResponse,
  ModelInfo,
  ModelsResponse,
} from "./api.ts";
import { ProviderError } from "./provider.ts";
import type { InferProvider } from "./provider.ts";

const BASE_URL = "https://openrouter.ai/api/v1";

interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number;
  pricing: { prompt: string; completion: string };
}

export class OpenrouterClient implements InferProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const resp = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://prim.sh",
        "X-Title": "infer.prim.sh",
      },
      body: JSON.stringify(body),
    });

    if (resp.status === 429) {
      const retryAfter = Number(resp.headers.get("Retry-After") ?? "60");
      throw new ProviderError("OpenRouter rate limit exceeded", "rate_limited", retryAfter);
    }

    if (!resp.ok) {
      let message = `OpenRouter API error: ${resp.status}`;
      try {
        const data = (await resp.json()) as { error?: { message?: string }; detail?: string };
        message = data.error?.message ?? data.detail ?? message;
      } catch {
        /* ignore parse errors */
      }

      if (resp.status === 404) {
        throw new ProviderError(message, "not_found");
      }
      throw new ProviderError(message, "provider_error");
    }

    return resp.json() as Promise<T>;
  }

  private async get<T>(path: string): Promise<T> {
    const resp = await fetch(`${BASE_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "HTTP-Referer": "https://prim.sh",
        "X-Title": "infer.prim.sh",
      },
    });

    if (resp.status === 429) {
      const retryAfter = Number(resp.headers.get("Retry-After") ?? "60");
      throw new ProviderError("OpenRouter rate limit exceeded", "rate_limited", retryAfter);
    }

    if (!resp.ok) {
      let message = `OpenRouter API error: ${resp.status}`;
      try {
        const data = (await resp.json()) as { error?: { message?: string }; detail?: string };
        message = data.error?.message ?? data.detail ?? message;
      } catch {
        /* ignore parse errors */
      }
      throw new ProviderError(message, "provider_error");
    }

    return resp.json() as Promise<T>;
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    return this.post<ChatResponse>("/chat/completions", req as unknown as Record<string, unknown>);
  }

  async embed(req: EmbedRequest): Promise<EmbedResponse> {
    try {
      return await this.post<EmbedResponse>(
        "/embeddings",
        req as unknown as Record<string, unknown>,
      );
    } catch (err) {
      if (err instanceof ProviderError && err.code === "not_found") {
        throw new ProviderError("Embeddings not supported for this model", "not_found");
      }
      throw err;
    }
  }

  async models(): Promise<ModelsResponse> {
    const raw = await this.get<{ data: OpenRouterModel[] }>("/models");
    const data: ModelInfo[] = raw.data.map((m) => ({
      id: m.id,
      name: m.name,
      context_length: m.context_length,
      pricing: { prompt: m.pricing.prompt, completion: m.pricing.completion },
    }));
    return { data };
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _client: OpenrouterClient | undefined;
let _clientKey: string | undefined;

export function resetClient(): void {
  _client = undefined;
  _clientKey = undefined;
}

export function getClient(): OpenrouterClient {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new ProviderError("OPENROUTER_API_KEY is not configured", "provider_error");
  if (!_client || _clientKey !== key) {
    _client = new OpenrouterClient(key);
    _clientKey = key;
  }
  return _client;
}
