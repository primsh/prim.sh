// SPDX-License-Identifier: Apache-2.0
// ─── infer.sh API types (OpenAI-compatible) ─────────────────────────────

// ─── Chat ────────────────────────────────────────────────────────────────

export interface ContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string; detail?: "auto" | "low" | "high" };
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[] | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface Tool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface ChatRequest {
  model: string;
  messages: Message[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
  stream?: boolean;
  tools?: Tool[];
  tool_choice?: "none" | "auto" | "required" | { type: "function"; function: { name: string } };
  response_format?: { type: "text" | "json_object" };
}

export interface Choice {
  index: number;
  message: Message;
  finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | null;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Choice[];
  usage: Usage;
}

// ─── Embeddings ──────────────────────────────────────────────────────────

export interface EmbedRequest {
  model: string;
  input: string | string[];
}

export interface EmbeddingData {
  object: "embedding";
  index: number;
  embedding: number[];
}

export interface EmbedResponse {
  object: "list";
  data: EmbeddingData[];
  model: string;
  usage: { prompt_tokens: number; total_tokens: number };
}

// ─── Models ──────────────────────────────────────────────────────────────

export interface ModelPricing {
  prompt: string;
  completion: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  context_length: number;
  pricing: ModelPricing;
}

export interface ModelsResponse {
  data: ModelInfo[];
}

// ─── Error ───────────────────────────────────────────────────────────────

export interface ApiError {
  error: {
    /** Machine-readable error code. */
    code: string;
    /** Human-readable error message. */
    message: string;
  };
}

export const ERROR_CODES = [
  "invalid_request",
  "not_found",
  "rate_limited",
  "provider_error",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
