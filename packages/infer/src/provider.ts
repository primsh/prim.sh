// SPDX-License-Identifier: Apache-2.0
import type {
  ChatRequest,
  ChatResponse,
  EmbedRequest,
  EmbedResponse,
  ModelsResponse,
} from "./api.ts";

// ─── Provider interface ───────────────────────────────────────────────────────

export interface InferProvider {
  chat(req: ChatRequest): Promise<ChatResponse>;
  embed(req: EmbedRequest): Promise<EmbedResponse>;
  models(): Promise<ModelsResponse>;
}

// ─── Error ────────────────────────────────────────────────────────────────────

export class ProviderError extends Error {
  code: "not_found" | "invalid_request" | "provider_error" | "rate_limited";
  retryAfter?: number;

  constructor(
    message: string,
    code: "not_found" | "invalid_request" | "provider_error" | "rate_limited" = "provider_error",
    retryAfter?: number,
  ) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.retryAfter = retryAfter;
  }
}
