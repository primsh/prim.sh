// ─── imagine.sh API types ─────────────────────────────────────────────────

// TODO: Define request fields for POST /v1/generate
// biome-ignore lint/suspicious/noEmptyInterface: scaffold placeholder — add fields before implementing
export interface GenerateRequest {
  // Add fields here
}

// TODO: Define response fields for POST /v1/generate
// biome-ignore lint/suspicious/noEmptyInterface: scaffold placeholder — add fields before implementing
export interface GenerateResponse {
  // Add fields here
}

// TODO: Define request fields for POST /v1/describe
// biome-ignore lint/suspicious/noEmptyInterface: scaffold placeholder — add fields before implementing
export interface DescribeRequest {
  // Add fields here
}

// TODO: Define response fields for POST /v1/describe
// biome-ignore lint/suspicious/noEmptyInterface: scaffold placeholder — add fields before implementing
export interface DescribeResponse {
  // Add fields here
}

// TODO: Define request fields for POST /v1/upscale
// biome-ignore lint/suspicious/noEmptyInterface: scaffold placeholder — add fields before implementing
export interface UpscaleRequest {
  // Add fields here
}

// TODO: Define response fields for POST /v1/upscale
// biome-ignore lint/suspicious/noEmptyInterface: scaffold placeholder — add fields before implementing
export interface UpscaleResponse {
  // Add fields here
}

// TODO: Define response fields for GET /v1/models
// biome-ignore lint/suspicious/noEmptyInterface: scaffold placeholder — add fields before implementing
export interface ModelsResponse {
  // Add fields here
}

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
