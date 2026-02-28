import { ProviderError } from "./provider.ts";
// Re-export for convenience
export { ProviderError } from "./provider.ts";
import type {
  ChatRequest,
  ChatResponse,
  EmbedRequest,
  EmbedResponse,
  ModelsResponse,
} from "./api.ts";
import { getClient } from "./openrouter.ts";

// ─── ServiceResult ────────────────────────────────────────────────────────────

type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string; retryAfter?: number };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function handleProviderError(err: unknown): ServiceResult<never> {
  if (err instanceof ProviderError) {
    const status = err.code === "rate_limited" ? 429 : err.code === "not_found" ? 404 : 502;
    return { ok: false, status, code: err.code, message: err.message, retryAfter: err.retryAfter };
  }
  throw err;
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function chat(body: ChatRequest): Promise<ServiceResult<ChatResponse>> {
  if (!body.model?.trim()) {
    return { ok: false, status: 400, code: "invalid_request", message: "model is required" };
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "messages is required and must be non-empty",
    };
  }

  try {
    const client = getClient();
    const data = await client.chat(body);
    return { ok: true, data };
  } catch (err) {
    return handleProviderError(err);
  }
}

export async function embed(body: EmbedRequest): Promise<ServiceResult<EmbedResponse>> {
  if (!body.model?.trim()) {
    return { ok: false, status: 400, code: "invalid_request", message: "model is required" };
  }
  if (
    body.input === undefined ||
    body.input === null ||
    (typeof body.input === "string" && !body.input.trim()) ||
    (Array.isArray(body.input) && body.input.length === 0)
  ) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "input is required and must be non-empty",
    };
  }

  try {
    const client = getClient();
    const data = await client.embed(body);
    return { ok: true, data };
  } catch (err) {
    return handleProviderError(err);
  }
}

export async function models(): Promise<ServiceResult<ModelsResponse>> {
  try {
    const client = getClient();
    const data = await client.models();
    return { ok: true, data };
  } catch (err) {
    return handleProviderError(err);
  }
}
