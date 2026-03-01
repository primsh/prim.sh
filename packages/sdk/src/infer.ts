// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Source: packages/infer/openapi.yaml
// Regenerate: pnpm gen:sdk

import { unwrap } from "./shared.js";

// ── Types ──────────────────────────────────────────────────────────────────

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
  tool_choice?: "none" | "auto" | "required" | Record<string, unknown>;
  response_format?: Record<string, unknown>;
}

export interface ChatResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Choice[];
  usage: Usage;
}

export interface Choice {
  index: number;
  message: Message;
  finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | null;
}

export interface ContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: Record<string, unknown>;
}

export interface EmbedRequest {
  model: string;
  input: string | string[];
}

export interface EmbedResponse {
  object: "list";
  data: EmbeddingData[];
  model: string;
  usage: Record<string, unknown>;
}

export interface EmbeddingData {
  object: "embedding";
  index: number;
  embedding: number[];
}

export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[] | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ModelInfo {
  id: string;
  name: string;
  context_length: number;
  pricing: ModelPricing;
}

export interface ModelPricing {
  prompt: string;
  completion: string;
}

export interface ModelsResponse {
  data: ModelInfo[];
}

export interface Tool {
  type: "function";
  function: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: Record<string, unknown>;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

// ── Client ─────────────────────────────────────────────────────────────────

export function createInferClient(
  primFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  baseUrl = "https://infer.prim.sh",
) {
  return {
    async chat(req: ChatRequest): Promise<ChatResponse> {
      const url = `${baseUrl}/v1/chat`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return unwrap<ChatResponse>(res);
    },
    async embed(req: EmbedRequest): Promise<EmbedResponse> {
      const url = `${baseUrl}/v1/embed`;
      const res = await primFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return unwrap<EmbedResponse>(res);
    },
    async listModels(): Promise<ModelsResponse> {
      const url = `${baseUrl}/v1/models`;
      const res = await primFetch(url);
      return unwrap<ModelsResponse>(res);
    },
  };
}
