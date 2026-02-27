// ─── create.sh API types ─────────────────────────────────────────────────

export interface ScaffoldRequest {
  /** prim.yaml spec as YAML string */
  spec: string;
}

export interface ScaffoldFile {
  /** Relative file path (e.g. "packages/foo/src/index.ts") */
  path: string;
  /** File content */
  content: string;
}

export interface ScaffoldResponse {
  /** Primitive ID */
  id: string;
  /** Generated files */
  files: ScaffoldFile[];
}

export interface ValidateRequest {
  /** prim.yaml spec as YAML string */
  spec: string;
}

export interface ValidateResponse {
  /** Whether the spec is valid */
  valid: boolean;
  /** Validation errors (empty if valid) */
  errors: string[];
}

export interface SchemaResponse {
  /** JSON Schema for prim.yaml */
  schema: Record<string, unknown>;
}

export interface PortAllocation {
  /** Primitive ID */
  id: string;
  /** Port number */
  port: number;
}

export interface PortsResponse {
  /** Currently allocated ports */
  allocated: PortAllocation[];
  /** Next available port number */
  next_available: number;
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
