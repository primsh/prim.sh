// SPDX-License-Identifier: Apache-2.0
// ─── imagine.sh API types ─────────────────────────────────────────────────

import { z } from "zod";

export const GenerateRequestSchema = z.object({});
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;

export const GenerateResponseSchema = z.object({});
export type GenerateResponse = z.infer<typeof GenerateResponseSchema>;

export const DescribeRequestSchema = z.object({});
export type DescribeRequest = z.infer<typeof DescribeRequestSchema>;

export const DescribeResponseSchema = z.object({});
export type DescribeResponse = z.infer<typeof DescribeResponseSchema>;

export const UpscaleRequestSchema = z.object({});
export type UpscaleRequest = z.infer<typeof UpscaleRequestSchema>;

export const UpscaleResponseSchema = z.object({});
export type UpscaleResponse = z.infer<typeof UpscaleResponseSchema>;

export const ListModelsResponseSchema = z.object({});
export type ListModelsResponse = z.infer<typeof ListModelsResponseSchema>;

// ─── Error ────────────────────────────────────────────────────────────────────

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
