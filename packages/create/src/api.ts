// SPDX-License-Identifier: Apache-2.0
/**
 * create.sh API contract — Zod schemas, inferred types, and error envelope.
 */

import { z } from "zod";

// ─── create.sh API types ─────────────────────────────────────────────────

export const ScaffoldRequestSchema = z.object({
  spec: z.string().describe("prim.yaml spec as YAML string"),
});
export type ScaffoldRequest = z.infer<typeof ScaffoldRequestSchema>;

export const ScaffoldFileSchema = z.object({
  path: z.string().describe('Relative file path (e.g. "packages/foo/src/index.ts")'),
  content: z.string().describe("File content"),
});
export type ScaffoldFile = z.infer<typeof ScaffoldFileSchema>;

export const ScaffoldResponseSchema = z.object({
  id: z.string().describe("Primitive ID"),
  files: z.array(ScaffoldFileSchema).describe("Generated files"),
});
export type ScaffoldResponse = z.infer<typeof ScaffoldResponseSchema>;

export const ValidateRequestSchema = z.object({
  spec: z.string().describe("prim.yaml spec as YAML string"),
});
export type ValidateRequest = z.infer<typeof ValidateRequestSchema>;

export const ValidateResponseSchema = z.object({
  valid: z.boolean().describe("Whether the spec is valid"),
  errors: z.array(z.string()).describe("Validation errors (empty if valid)"),
});
export type ValidateResponse = z.infer<typeof ValidateResponseSchema>;

export const GetSchemaResponseSchema = z.object({
  schema: z.record(z.string(), z.unknown()).describe("JSON Schema for prim.yaml"),
});
export type GetSchemaResponse = z.infer<typeof GetSchemaResponseSchema>;

export const PortAllocationSchema = z.object({
  id: z.string().describe("Primitive ID"),
  port: z.number().describe("Port number"),
});
export type PortAllocation = z.infer<typeof PortAllocationSchema>;

export const ListPortsResponseSchema = z.object({
  allocated: z.array(PortAllocationSchema).describe("Currently allocated ports"),
  next_available: z.number().describe("Next available port number"),
});
export type ListPortsResponse = z.infer<typeof ListPortsResponseSchema>;

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
