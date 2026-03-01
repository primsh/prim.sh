// ─── imagine.sh API types ─────────────────────────────────────────────────

// biome-ignore lint/suspicious/noEmptyInterface: scaffold — fields added when provider is implemented
export interface GenerateRequest {}

// biome-ignore lint/suspicious/noEmptyInterface: scaffold — fields added when provider is implemented
export interface GenerateResponse {}

// biome-ignore lint/suspicious/noEmptyInterface: scaffold — fields added when provider is implemented
export interface DescribeRequest {}

// biome-ignore lint/suspicious/noEmptyInterface: scaffold — fields added when provider is implemented
export interface DescribeResponse {}

// biome-ignore lint/suspicious/noEmptyInterface: scaffold — fields added when provider is implemented
export interface UpscaleRequest {}

// biome-ignore lint/suspicious/noEmptyInterface: scaffold — fields added when provider is implemented
export interface UpscaleResponse {}

// biome-ignore lint/suspicious/noEmptyInterface: scaffold — fields added when provider is implemented
export interface ModelsResponse {}

// ─── Error ────────────────────────────────────────────────────────────────────

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
