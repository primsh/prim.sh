// SPDX-License-Identifier: Apache-2.0
// ─── infer.sh API types (OpenAI-compatible) — Zod schemas ────────────────

import { z } from "zod";

// ─── Chat ────────────────────────────────────────────────────────────────

export const ContentPartSchema = z.object({
  type: z.enum(["text", "image_url"]),
  text: z.string().optional(),
  image_url: z
    .object({
      url: z.string(),
      detail: z.enum(["auto", "low", "high"]).optional(),
    })
    .optional(),
});
export type ContentPart = z.infer<typeof ContentPartSchema>;

export const ToolCallSchema = z.object({
  id: z.string(),
  type: z.literal("function"),
  function: z.object({ name: z.string(), arguments: z.string() }),
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

export const MessageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.union([z.string(), z.array(ContentPartSchema), z.null()]),
  name: z.string().optional(),
  tool_call_id: z.string().optional(),
  tool_calls: z.array(ToolCallSchema).optional(),
});
export type Message = z.infer<typeof MessageSchema>;

export const ToolSchema = z.object({
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    description: z.string().optional(),
    parameters: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type Tool = z.infer<typeof ToolSchema>;

export const ChatRequestSchema = z.object({
  model: z.string(),
  messages: z.array(MessageSchema),
  temperature: z.number().optional(),
  max_tokens: z.number().optional(),
  top_p: z.number().optional(),
  frequency_penalty: z.number().optional(),
  presence_penalty: z.number().optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  stream: z.boolean().optional(),
  tools: z.array(ToolSchema).optional(),
  tool_choice: z
    .union([
      z.enum(["none", "auto", "required"]),
      z.object({
        type: z.literal("function"),
        function: z.object({ name: z.string() }),
      }),
    ])
    .optional(),
  response_format: z
    .object({
      type: z.enum(["text", "json_object"]),
    })
    .optional(),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const ChoiceSchema = z.object({
  index: z.number(),
  message: MessageSchema,
  finish_reason: z.enum(["stop", "length", "tool_calls", "content_filter"]).nullable(),
});
export type Choice = z.infer<typeof ChoiceSchema>;

export const UsageSchema = z.object({
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number(),
});
export type Usage = z.infer<typeof UsageSchema>;

export const ChatResponseSchema = z.object({
  id: z.string(),
  object: z.literal("chat.completion"),
  created: z.number(),
  model: z.string(),
  choices: z.array(ChoiceSchema),
  usage: UsageSchema,
});
export type ChatResponse = z.infer<typeof ChatResponseSchema>;

// ─── Embeddings ──────────────────────────────────────────────────────────

export const EmbedRequestSchema = z.object({
  model: z.string(),
  input: z.union([z.string(), z.array(z.string())]),
});
export type EmbedRequest = z.infer<typeof EmbedRequestSchema>;

export const EmbeddingDataSchema = z.object({
  object: z.literal("embedding"),
  index: z.number(),
  embedding: z.array(z.number()),
});
export type EmbeddingData = z.infer<typeof EmbeddingDataSchema>;

export const EmbedResponseSchema = z.object({
  object: z.literal("list"),
  data: z.array(EmbeddingDataSchema),
  model: z.string(),
  usage: z.object({
    prompt_tokens: z.number(),
    total_tokens: z.number(),
  }),
});
export type EmbedResponse = z.infer<typeof EmbedResponseSchema>;

// ─── Models ──────────────────────────────────────────────────────────────

export const ModelPricingSchema = z.object({
  prompt: z.string(),
  completion: z.string(),
});
export type ModelPricing = z.infer<typeof ModelPricingSchema>;

export const ModelInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  context_length: z.number(),
  pricing: ModelPricingSchema,
});
export type ModelInfo = z.infer<typeof ModelInfoSchema>;

export const ListModelsResponseSchema = z.object({
  data: z.array(ModelInfoSchema),
});
export type ListModelsResponse = z.infer<typeof ListModelsResponseSchema>;

// ─── Error ───────────────────────────────────────────────────────────────

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string().describe("Machine-readable error code."),
    message: z.string().describe("Human-readable error message."),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const ERROR_CODES = [
  "invalid_request",
  "not_found",
  "rate_limited",
  "provider_error",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
