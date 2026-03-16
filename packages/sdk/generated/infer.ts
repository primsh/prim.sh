// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Source: packages/infer/generated/openapi.yaml
// Regenerate: pnpm gen:sdk

import { unwrap } from "../src/shared.js";

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
  tool_choice?: "none" | "auto" | "required" | {
    type: string;
    function: {
      name: string;
    };
  };
  response_format?: {
    type: "text" | "json_object";
  };
}

export interface ChatResponse {
  id: string;
  object: string;
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
  image_url?: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
}

export interface EmbedRequest {
  model: string;
  input: string | string[];
}

export interface EmbedResponse {
  object: string;
  data: EmbeddingData[];
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export interface EmbeddingData {
  object: string;
  index: number;
  embedding: number[];
}

export interface ListModelsResponse {
  data: ModelInfo[];
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

export interface Tool {
  type: string;
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface ToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
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
    async listModels(): Promise<ListModelsResponse> {
      const url = `${baseUrl}/v1/models`;
      const res = await primFetch(url);
      return unwrap<ListModelsResponse>(res);
    },
  };
}
