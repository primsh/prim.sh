// ─── Provider result types ────────────────────────────────────────────────────

// biome-ignore lint/suspicious/noEmptyInterface: scaffold — fields added when provider is implemented
export interface ImagineProviderData {}

// ─── Provider interface ───────────────────────────────────────────────────────

// biome-ignore lint/suspicious/noEmptyInterface: scaffold — methods added when provider is implemented
export interface ImagineProvider {}

// ─── Error ────────────────────────────────────────────────────────────────────

export class ProviderError extends Error {
  code: "not_found" | "invalid_request" | "provider_error" | "rate_limited";
  retryAfter?: number;

  constructor(
    message: string,
    code: "not_found" | "invalid_request" | "provider_error" | "rate_limited" = "provider_error",
    retryAfter?: number,
  ) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.retryAfter = retryAfter;
  }
}
