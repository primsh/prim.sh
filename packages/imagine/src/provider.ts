// ─── Provider result types ────────────────────────────────────────────────────

// TODO: Define the data shape returned by the provider
// biome-ignore lint/suspicious/noEmptyInterface: scaffold placeholder — add fields before implementing
export interface ImagineProviderData {
  // Add provider data fields here
}

// ─── Provider interface ───────────────────────────────────────────────────────

// biome-ignore lint/suspicious/noEmptyInterface: scaffold placeholder — add methods before implementing
export interface ImagineProvider {
  // TODO: Add provider method signatures matching your routes
  // generate(...): Promise<ImagineProviderData>;
  // describe(...): Promise<ImagineProviderData>;
  // upscale(...): Promise<ImagineProviderData>;
  // models(...): Promise<ImagineProviderData>;
}

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
